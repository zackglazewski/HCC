import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { expressjwt } from 'express-jwt'
import jwksRsa from 'jwks-rsa'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const prisma = new PrismaClient()

const PORT = parseInt(process.env.PORT || '5174', 10)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000'
const ASSETS_DIR = process.env.ASSETS_DIR || '../../assets'
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '10mb'
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'

// Security headers + CSP suited for a JSON API
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}))
app.use(express.json({ limit: JSON_BODY_LIMIT }))
app.use(morgan('dev'))
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: false }))
if (TRUST_PROXY) app.set('trust proxy', 1)

// Serve static assets (backgrounds, mask, fonts) from repo assets folder
const baseAssets = path.resolve(__dirname, '../../assets')
let resolvedAssets = path.resolve(__dirname, ASSETS_DIR)
if (!resolvedAssets.startsWith(baseAssets)) {
  // eslint-disable-next-line no-console
  console.warn('[server] ASSETS_DIR outside allowed base. Falling back to repo assets directory.')
  resolvedAssets = baseAssets
}
app.use('/assets', express.static(resolvedAssets))

// Auth middleware (fail-closed; Auth0 required)
const rawIssuer = process.env.AUTH0_ISSUER_BASE_URL
const audience = process.env.AUTH0_AUDIENCE
if (!rawIssuer || !audience) {
  // Fail closed: do not start without auth configured
  // eslint-disable-next-line no-console
  console.error('[server] Missing AUTH0_ISSUER_BASE_URL or AUTH0_AUDIENCE. Refusing to start for safety.')
  process.exit(1)
}
const issuer = rawIssuer.endsWith('/') ? rawIssuer : `${rawIssuer}/`
const requireAuth = expressjwt({
  algorithms: ['RS256'],
  audience,
  issuer,
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${issuer}.well-known/jwks.json`
  })
})

// Simple in-memory rate limiting (per-IP or per-token). Not cluster-safe but sufficient for v1.
const rateBuckets = new Map()
function rateLimit({ windowMs, max, keyFn }) {
  return function (req, res, next) {
    const now = Date.now()
    const key = keyFn ? keyFn(req) : req.ip
    let entry = rateBuckets.get(key)
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs }
      rateBuckets.set(key, entry)
    }
    entry.count += 1
    if (entry.count > max) {
      res.status(429).json({ error: 'rate_limited' })
      return
    }
    next()
  }
}

// Rate limiting configuration (tunable via env). Disable by setting RATE_LIMIT_ENABLED=false
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false'
const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || '60000', 10)
const GENERAL_RATE_LIMIT = parseInt(process.env.GENERAL_RATE_LIMIT || '1000', 10) // default 1000/min
const IMAGE_RATE_LIMIT = parseInt(process.env.IMAGE_RATE_LIMIT || '120', 10) // default 120/min

const generalLimiter = RATE_LIMIT_ENABLED
  ? rateLimit({ windowMs: RATE_WINDOW_MS, max: GENERAL_RATE_LIMIT, keyFn: (req) => req.headers['authorization'] || req.ip })
  : (req, res, next) => next()

const imageLimiter = RATE_LIMIT_ENABLED
  ? rateLimit({ windowMs: RATE_WINDOW_MS, max: IMAGE_RATE_LIMIT, keyFn: (req) => req.headers['authorization'] || req.ip })
  : (req, res, next) => next()

// Apply general limiter to /api except debug logging
app.use((req, res, next) => {
  if (!RATE_LIMIT_ENABLED) return next()
  if (req.path && req.path.startsWith('/api')) return generalLimiter(req, res, next)
  return next()
})

// Periodic cleanup of expired rate entries
const RATE_SWEEP_MS = parseInt(process.env.RATE_SWEEP_MS || '60000', 10)
if (RATE_LIMIT_ENABLED) {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateBuckets.entries()) {
      if (!entry || entry.reset < now) rateBuckets.delete(key)
    }
  }, RATE_SWEEP_MS).unref()
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})


// Helpers
function getUserIdFromToken(req) {
  // Map Auth0 sub to users.auth_sub
  return req.auth?.sub || null
}

async function getOrCreateUser(req) {
  const authSub = getUserIdFromToken(req)
  if (!authSub) return null
  const user = await prisma.users.upsert({
    where: { auth_sub: authSub },
    update: {},
    create: { auth_provider: 'auth0', auth_sub: authSub }
  })
  return user
}

function parseId(param) {
  const id = Number(param)
  return Number.isFinite(id) && id > 0 ? id : null
}

// Schemas
const CardCreateSchema = z.object({
  title: z.string().min(1).max(200),
  general: z.string().min(1).max(50)
})

const CardPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  general: z.string().min(1).max(50).optional(),
  card_name: z.string().max(200).optional(),
  tribe_name: z.string().max(200).optional(),
  species: z.string().max(200).optional(),
  uniqueness: z.string().max(200).optional(),
  class: z.string().max(200).optional(),
  personality: z.string().max(200).optional(),
  size: z.string().max(50).optional(),
  life: z.string().max(50).optional(),
  move: z.string().max(50).optional(),
  range: z.string().max(50).optional(),
  attack: z.string().max(50).optional(),
  defense: z.string().max(50).optional(),
  points: z.string().max(50).optional(),
  theme_primary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  theme_secondary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  theme_background_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
}).strict()

const ImageCreateSchema = z.object({
  name: z.string().max(200).optional(),
  dataUrl: z.string().startsWith('data:'),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  scale: z.number().finite().optional(),
  rotation: z.number().finite().nullable().optional(),
})

const ImagePatchSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  scale: z.number().finite().optional(),
  rotation: z.number().finite().nullable().optional(),
  order: z.number().int().optional(),
  name: z.string().max(200).optional(),
}).strict()

const PowerCreateSchema = z.object({
  order: z.number().int().min(0).max(3),
  heading: z.string().max(200),
  body: z.string().max(5000),
})

const PowerPatchSchema = z.object({
  order: z.number().int().min(0).max(3).optional(),
  heading: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
}).strict()

const ThemeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  primary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
  secondary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
  background_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
})

const ThemePatchSchema = ThemeCreateSchema.partial().strict()

// Cards API (minimal skeleton)
app.get('/api/cards', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const cards = await prisma.cards.findMany({ where: { user_id: user.id }, orderBy: { updated_at: 'desc' } })
  res.json(cards)
})

app.post('/api/cards', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = CardCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const { title, general } = parsed.data
  const card = await prisma.cards.create({ data: { user_id: user.id, title, general, schema_version: 1 } })
  res.status(201).json(card)
})

app.get('/api/cards/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const card = await prisma.cards.findFirst({
    where: { id, user_id: user.id },
    include: { powers: true, images: true }
  })
  if (!card) return res.status(404).json({ error: 'not_found' })
  res.json(card)
})

app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const parsed = CardPatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const exists = await prisma.cards.findFirst({ where: { id, user_id: user.id } })
    if (!exists) return res.status(404).json({ error: 'not_found' })
    const updated = await prisma.cards.update({ where: { id }, data: parsed.data })
    res.json(updated)
  } catch (e) {
    return res.status(400).json({ error: 'update_failed' })
  }
})

app.delete('/api/cards/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const deleted = await prisma.cards.deleteMany({ where: { id, user_id: user.id } })
  if (deleted.count === 0) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
})

// Images API
app.post('/api/cards/:id/images', requireAuth, imageLimiter, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const card = await prisma.cards.findFirst({ where: { id, user_id: user.id } })
  if (!card) return res.status(404).json({ error: 'not_found' })
  const parsed = ImageCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const { name, dataUrl, x = 0, y = 0, scale = 1, rotation = null } = parsed.data
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) return res.status(400).json({ error: 'invalid_dataUrl' })
  const mime = match[1].toLowerCase()
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
  if (!allowed.has(mime)) return res.status(415).json({ error: 'unsupported_media_type' })
  const base64 = match[2]
  const blob = Buffer.from(base64, 'base64')
  // Minimal sniffing to confirm the type
  const pngSig = blob.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const jpegSig = blob[0] === 0xff && blob[1] === 0xd8
  const webpSig = blob.subarray(0, 12).toString('ascii') === 'RIFF' && blob.subarray(8,12).toString('ascii') === 'WEBP'
  if (mime === 'image/png' && !pngSig) return res.status(415).json({ error: 'invalid_png' })
  if (mime === 'image/jpeg' && !jpegSig) return res.status(415).json({ error: 'invalid_jpeg' })
  if (mime === 'image/webp' && !webpSig) return res.status(415).json({ error: 'invalid_webp' })
  const maxOrder = await prisma.card_images.aggregate({ _max: { order: true }, where: { card_id: id } })
  const order = (maxOrder._max.order ?? -1) + 1
  const created = await prisma.card_images.create({
    data: { card_id: id, order, x, y, scale, rotation, name, blob }
  })
  res.status(201).json(created)
})

app.patch('/api/cards/:id/images/:imageId', requireAuth, imageLimiter, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  const imageId = parseId(req.params.imageId)
  if (!id || !imageId) return res.status(400).json({ error: 'invalid_id' })
  const parsed = ImagePatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const image = await prisma.card_images.findUnique({ where: { id: imageId }, include: { card: true } })
    if (!image || image.card_id !== id || image.card.user_id !== user.id) return res.status(404).json({ error: 'not_found' })
    const updated = await prisma.card_images.update({ where: { id: imageId }, data: parsed.data })
    res.json(updated)
  } catch (e) {
    res.status(400).json({ error: 'update_failed' })
  }
})

app.delete('/api/cards/:id/images/:imageId', requireAuth, imageLimiter, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  const imageId = parseId(req.params.imageId)
  if (!id || !imageId) return res.status(400).json({ error: 'invalid_id' })
  const image = await prisma.card_images.findUnique({ where: { id: imageId }, include: { card: true } })
  if (!image || image.card_id !== id || image.card.user_id !== user.id) return res.status(404).json({ error: 'not_found' })
  await prisma.card_images.delete({ where: { id: imageId } })
  res.status(204).end()
})

// Debug logging endpoint removed

// Powers API
app.post('/api/cards/:id/powers', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const card = await prisma.cards.findFirst({ where: { id, user_id: user.id } })
  if (!card) return res.status(404).json({ error: 'not_found' })
  const parsed = PowerCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const created = await prisma.card_powers.create({ data: { card_id: id, ...parsed.data } })
    res.status(201).json(created)
  } catch (e) {
    res.status(400).json({ error: 'create_failed' })
  }
})

app.patch('/api/cards/:id/powers/:powerId', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  const powerId = parseId(req.params.powerId)
  if (!id || !powerId) return res.status(400).json({ error: 'invalid_id' })
  const parsed = PowerPatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const power = await prisma.card_powers.findUnique({ where: { id: powerId }, include: { card: true } })
    if (!power || power.card_id !== id || power.card.user_id !== user.id) return res.status(404).json({ error: 'not_found' })
    const updated = await prisma.card_powers.update({ where: { id: powerId }, data: parsed.data })
    res.json(updated)
  } catch (e) {
    res.status(400).json({ error: 'update_failed' })
  }
})

app.delete('/api/cards/:id/powers/:powerId', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  const powerId = parseId(req.params.powerId)
  if (!id || !powerId) return res.status(400).json({ error: 'invalid_id' })
  const power = await prisma.card_powers.findUnique({ where: { id: powerId }, include: { card: true } })
  if (!power || power.card_id !== id || power.card.user_id !== user.id) return res.status(404).json({ error: 'not_found' })
  await prisma.card_powers.delete({ where: { id: powerId } })
  res.status(204).end()
})

// Export placeholder (client-only in v1). Endpoint reserved for future use.
app.post('/api/cards/:id/export', requireAuth, async (req, res) => {
  res.status(501).json({ error: 'server_side_export_not_implemented' })
})

// Theme library API
app.get('/api/themes', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const themes = await prisma.user_themes.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'desc' } })
  res.json(themes)
})

app.post('/api/themes', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = ThemeCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const created = await prisma.user_themes.create({ data: { user_id: user.id, ...parsed.data } })
    res.status(201).json(created)
  } catch (e) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'name_conflict' })
    res.status(400).json({ error: 'create_failed' })
  }
})

app.patch('/api/themes/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const parsed = ThemePatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  try {
    const exists = await prisma.user_themes.findFirst({ where: { id, user_id: user.id } })
    if (!exists) return res.status(404).json({ error: 'not_found' })
    const updated = await prisma.user_themes.update({ where: { id }, data: parsed.data })
    res.json(updated)
  } catch (e) {
    return res.status(400).json({ error: 'update_failed' })
  }
})

app.delete('/api/themes/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const deleted = await prisma.user_themes.deleteMany({ where: { id, user_id: user.id } })
  if (deleted.count === 0) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
})

// Auth error handler (must be after routes)
app.use((err, req, res, next) => {
  if (err && err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'unauthorized' })
  }
  // eslint-disable-next-line no-console
  console.error('[server] Unhandled error:', err && err.stack ? err.stack : err)
  return res.status(500).json({ error: 'internal_error' })
})

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
  console.log(`[server] serving assets from ${resolvedAssets} at /assets`)
})

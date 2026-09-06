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
import { isSelfOrDescendant } from './folderTree.js'

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
  general: z.string().min(1).max(50),
  folder_id: z.number().int().positive().nullable().optional(),
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
  hitbox_json: z.string().max(2000000).nullable().optional(),
  folder_id: z.number().int().positive().nullable().optional(),
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

const PREFERENCES_MAX_BYTES = 16 * 1024
const PreferencesPatchSchema = z.object({
  preferences: z.record(z.string(), z.unknown()),
}).strict()

const THUMBNAIL_MAX_BYTES = 512 * 1024
const ThumbnailPutSchema = z.object({
  dataUrl: z.string().startsWith('data:').max(THUMBNAIL_MAX_BYTES * 2),
})

const FolderCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parent_id: z.number().int().positive().nullable().optional(),
})

const FolderPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parent_id: z.number().int().positive().nullable().optional(),
}).strict()

const MoveSchema = z.object({
  card_ids: z.array(z.number().int().positive()).max(1000).default([]),
  folder_ids: z.array(z.number().int().positive()).max(1000).default([]),
  target_folder_id: z.number().int().positive().nullable(),
})

const ThemeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  primary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
  secondary_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
  background_hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
})

const ThemePatchSchema = ThemeCreateSchema.partial().strict()

// Decodes a base64 data URL and validates the real content type by magic bytes
// (files often carry the wrong extension/MIME). Returns null when it isn't PNG/JPEG/WebP.
function decodeImageDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) return null
  const blob = Buffer.from(match[2], 'base64')
  const isPng = blob.length >= 8 && blob.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const isJpeg = blob.length >= 2 && blob[0] === 0xff && blob[1] === 0xd8
  const isWebp = blob.length >= 12 && blob.subarray(0, 4).toString('ascii') === 'RIFF' && blob.subarray(8,12).toString('ascii') === 'WEBP'
  if (isPng) return { blob, mime: 'image/png' }
  if (isJpeg) return { blob, mime: 'image/jpeg' }
  if (isWebp) return { blob, mime: 'image/webp' }
  return null
}

function parsePreferences(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    preferences: parsePreferences(user.preferences),
  }
}

// Current user + preferences
app.get('/api/me', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  res.json(publicUser(user))
})

// Shallow-merges the given keys into the stored preferences blob. Send a key with `null` to clear it.
app.patch('/api/me', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = PreferencesPatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const merged = { ...parsePreferences(user.preferences) }
  for (const [key, value] of Object.entries(parsed.data.preferences)) {
    if (value === null || value === undefined) delete merged[key]
    else merged[key] = value
  }
  const serialized = JSON.stringify(merged)
  if (Buffer.byteLength(serialized, 'utf8') > PREFERENCES_MAX_BYTES) return res.status(413).json({ error: 'preferences_too_large' })
  const updated = await prisma.users.update({ where: { id: user.id }, data: { preferences: serialized } })
  res.json(publicUser(updated))
})

// Folder helpers
// Users have at most a few hundred folders, so loading the whole tree once per request is cheaper
// and simpler than issuing a query per ancestor while walking up the tree.
async function loadFolderMap(userId) {
  const rows = await prisma.folders.findMany({ where: { user_id: userId }, select: { id: true, parent_id: true } })
  return new Map(rows.map((f) => [f.id, f]))
}

// Cards API (minimal skeleton)
app.get('/api/cards', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const cards = await prisma.cards.findMany({
    where: { user_id: user.id },
    orderBy: { updated_at: 'desc' },
    include: { thumbnail: { select: { updated_at: true } } },
  })
  res.json(cards)
})

app.post('/api/cards', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = CardCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const { title, general, folder_id = null } = parsed.data
  if (folder_id != null) {
    const folder = await prisma.folders.findFirst({ where: { id: folder_id, user_id: user.id }, select: { id: true } })
    if (!folder) return res.status(400).json({ error: 'invalid_folder' })
  }
  const card = await prisma.cards.create({ data: { user_id: user.id, title, general, folder_id, schema_version: 1 } })
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
    if (parsed.data.folder_id != null) {
      const folder = await prisma.folders.findFirst({ where: { id: parsed.data.folder_id, user_id: user.id }, select: { id: true } })
      if (!folder) return res.status(400).json({ error: 'invalid_folder' })
    }
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

// Folders API
// Folders form a tree via parent_id (null = root). The client receives the flat list and builds the tree.
app.get('/api/folders', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const folders = await prisma.folders.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } })
  res.json(folders)
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = FolderCreateSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const { name, parent_id = null } = parsed.data
  if (parent_id != null) {
    const parent = await prisma.folders.findFirst({ where: { id: parent_id, user_id: user.id }, select: { id: true } })
    if (!parent) return res.status(400).json({ error: 'invalid_parent' })
  }
  const folder = await prisma.folders.create({ data: { user_id: user.id, name, parent_id } })
  res.status(201).json(folder)
})

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const parsed = FolderPatchSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const folderMap = await loadFolderMap(user.id)
  if (!folderMap.has(id)) return res.status(404).json({ error: 'not_found' })
  if (parsed.data.parent_id !== undefined && parsed.data.parent_id != null) {
    if (!folderMap.has(parsed.data.parent_id)) return res.status(400).json({ error: 'invalid_parent' })
    if (isSelfOrDescendant(folderMap, id, parsed.data.parent_id)) return res.status(400).json({ error: 'cyclic_move' })
  }
  try {
    const updated = await prisma.folders.update({ where: { id }, data: parsed.data })
    res.json(updated)
  } catch (e) {
    res.status(400).json({ error: 'update_failed' })
  }
})

// Deleting a folder cascades (via FK constraints) to every nested folder and card.
app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const deleted = await prisma.folders.deleteMany({ where: { id, user_id: user.id } })
  if (deleted.count === 0) return res.status(404).json({ error: 'not_found' })
  res.status(204).end()
})

// Bulk move: re-parent any mix of cards and folders into target_folder_id (null = root) atomically.
app.post('/api/move', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const parsed = MoveSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const { card_ids, folder_ids, target_folder_id } = parsed.data
  const folderMap = await loadFolderMap(user.id)
  if (target_folder_id != null && !folderMap.has(target_folder_id)) return res.status(400).json({ error: 'invalid_target' })
  for (const fid of folder_ids) {
    if (!folderMap.has(fid)) return res.status(404).json({ error: 'not_found', folder_id: fid })
    if (target_folder_id != null && isSelfOrDescendant(folderMap, fid, target_folder_id)) {
      return res.status(400).json({ error: 'cyclic_move', folder_id: fid })
    }
  }
  const [cards, folders] = await prisma.$transaction([
    prisma.cards.updateMany({ where: { id: { in: card_ids }, user_id: user.id }, data: { folder_id: target_folder_id } }),
    prisma.folders.updateMany({ where: { id: { in: folder_ids }, user_id: user.id }, data: { parent_id: target_folder_id } }),
  ])
  res.json({ ok: true, moved: { cards: cards.count, folders: folders.count } })
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
  if (!/^data:[^;]+;base64,/.test(dataUrl)) return res.status(400).json({ error: 'invalid_dataUrl' })
  const decoded = decodeImageDataUrl(dataUrl)
  if (!decoded) {
    return res.status(415).json({ error: 'unsupported_format', detail: 'Content must be PNG, JPEG, or WebP' })
  }
  const { blob } = decoded
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

// Thumbnails API
// The editor renders a small preview after autosave and PUTs it here; the explorer GETs it.
app.put('/api/cards/:id/thumbnail', requireAuth, imageLimiter, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const card = await prisma.cards.findFirst({ where: { id, user_id: user.id }, select: { id: true } })
  if (!card) return res.status(404).json({ error: 'not_found' })
  const parsed = ThumbnailPutSchema.safeParse(req.body || {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' })
  const decoded = decodeImageDataUrl(parsed.data.dataUrl)
  if (!decoded) return res.status(415).json({ error: 'unsupported_format' })
  if (decoded.blob.length > THUMBNAIL_MAX_BYTES) return res.status(413).json({ error: 'thumbnail_too_large' })
  const saved = await prisma.card_thumbnails.upsert({
    where: { card_id: id },
    update: { mime: decoded.mime, blob: decoded.blob },
    create: { card_id: id, mime: decoded.mime, blob: decoded.blob },
    select: { updated_at: true },
  })
  res.json({ updated_at: saved.updated_at })
})

// Clients append ?v=<updated_at> so the response can be cached immutably per version.
app.get('/api/cards/:id/thumbnail', requireAuth, async (req, res) => {
  const user = await getOrCreateUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const id = parseId(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  const thumb = await prisma.card_thumbnails.findFirst({ where: { card_id: id, card: { user_id: user.id } } })
  if (!thumb) return res.status(404).json({ error: 'not_found' })
  res.set('Content-Type', thumb.mime)
  res.set('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, no-cache')
  res.send(Buffer.from(thumb.blob))
})

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

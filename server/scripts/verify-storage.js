#!/usr/bin/env node
/**
 * Cross-checks card_images against object storage and reports what the bucket holds.
 *
 *   node scripts/verify-storage.js
 *
 * Lists every object under u/ (one request per 1000 objects) and compares with the database:
 *   - rows whose object is missing from storage      -> exit code 1; never --clear-blobs until 0
 *   - rows whose object size differs from size_bytes -> exit code 1
 *   - objects no row references (orphans)            -> reported only; harmless
 * Uses the same STORAGE_DRIVER / R2_* env as the API.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createStorage } from '../src/storage.js'

const prisma = new PrismaClient()
const storage = createStorage()
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

const [total, withBlob, keyed, keyedWithBlob, neither, keyRows] = await Promise.all([
  prisma.card_images.count(),
  prisma.card_images.count({ where: { blob: { not: null } } }),
  prisma.card_images.count({ where: { object_key: { not: null } } }),
  prisma.card_images.count({ where: { object_key: { not: null }, blob: { not: null } } }),
  prisma.card_images.count({ where: { object_key: null, blob: null } }),
  prisma.card_images.findMany({ where: { object_key: { not: null } }, select: { id: true, object_key: true, size_bytes: true } }),
])

console.log(`[verify] storage: ${storage.describe()}`)
console.log('[verify] database rows')
console.log(`  total                         ${total}`)
console.log(`  in storage (object_key set)   ${keyed}`)
console.log(`    ...still holding blob too   ${keyedWithBlob}  (cleared by backfill --clear-blobs)`)
console.log(`  blob only, not yet migrated   ${withBlob - keyedWithBlob}`)
console.log(`  neither (unrecoverable)       ${neither}`)

const objects = await storage.list('u/')
const sizeByKey = new Map(objects.map((o) => [o.key, o.size]))
const totalBytes = objects.reduce((n, o) => n + o.size, 0)
console.log(`[verify] storage holds ${objects.length} objects, ${mb(totalBytes)}`)

const missing = []
const sizeMismatch = []
const referenced = new Set()
for (const row of keyRows) {
  referenced.add(row.object_key)
  const size = sizeByKey.get(row.object_key)
  if (size === undefined) missing.push(row)
  else if (row.size_bytes != null && size !== row.size_bytes) sizeMismatch.push({ ...row, actual: size })
}
const orphans = objects.filter((o) => !referenced.has(o.key))

console.log(`[verify] rows whose object is missing:   ${missing.length}`)
for (const row of missing.slice(0, 20)) console.log(`    image ${row.id} -> ${row.object_key}`)
if (missing.length > 20) console.log(`    ...and ${missing.length - 20} more`)
console.log(`[verify] rows whose object size differs: ${sizeMismatch.length}`)
for (const row of sizeMismatch.slice(0, 20)) console.log(`    image ${row.id}: db ${row.size_bytes} B, storage ${row.actual} B`)
console.log(`[verify] orphaned objects (no row):      ${orphans.length}, ${mb(orphans.reduce((n, o) => n + o.size, 0))}`)

await prisma.$disconnect()
if (missing.length || sizeMismatch.length) {
  console.error('[verify] FAILED: storage does not hold every image the database points at. Do not clear blobs.')
  process.exit(1)
}
console.log(withBlob - keyedWithBlob ? '[verify] OK so far; rows without object_key still need the backfill' : '[verify] OK: every image the database points at is in storage')

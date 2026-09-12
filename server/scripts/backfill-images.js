#!/usr/bin/env node
/**
 * Moves image bytes out of card_images.blob into object storage.
 *
 * Idempotent and safe to re-run: it only visits rows that still have bytes in the database.
 *   1. sniff the mime, hash the bytes, upload to u/<user_id>/<sha256> unless already stored
 *   2. record object_key / mime / size_bytes / sha256 on the row
 *   3. with --clear-blobs, null `blob` on each row whose object was confirmed this run
 *
 * Run from server/ with the same env the API uses (STORAGE_DRIVER, R2_*, LOCAL_STORAGE_DIR):
 *   node scripts/backfill-images.js [--dry-run] [--clear-blobs] [--batch=100]
 *
 * Memory stays flat: images are loaded and uploaded one at a time (--batch only sizes the id pages).
 * Write the log somewhere persistent, e.g. nohup node scripts/backfill-images.js > /data/backfill.log 2>&1 &
 *
 * Deploy the API first so new uploads already go to storage, run this without flags, check that
 * cards render, then run it again with --clear-blobs and follow with scripts/vacuum-db.js.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createStorage } from '../src/storage.js'
import { imageObjectKey, sha256Hex, sniffImageMime } from '../src/images.js'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const clearBlobs = args.has('--clear-blobs')
const batchArg = [...args].find((a) => a.startsWith('--batch='))
const BATCH = Math.max(1, parseInt(batchArg?.split('=')[1] || '100', 10) || 100) // ids per page, not blobs

const prisma = new PrismaClient()
const storage = createStorage()
const stats = { scanned: 0, uploaded: 0, present: 0, cleared: 0, skipped: 0, failed: 0 }

async function processRow(row) {
  const blob = Buffer.isBuffer(row.blob) ? row.blob : Buffer.from(row.blob)
  const mime = sniffImageMime(blob)
  if (!mime) {
    console.warn(`  image ${row.id}: unrecognised bytes (${blob.length} B), skipping`)
    stats.skipped++
    return
  }
  const sha256 = sha256Hex(blob)
  const key = imageObjectKey(row.card.user_id, sha256)
  const present = await storage.exists(key)
  if (dryRun) {
    console.log(`  image ${row.id}: ${present ? 'already stored' : 'would upload'} ${key} (${mime}, ${blob.length} B)`)
    if (present) stats.present++
    else stats.uploaded++
    return
  }
  if (present) {
    stats.present++
  } else {
    await storage.put(key, blob, mime)
    stats.uploaded++
  }
  await prisma.card_images.update({
    where: { id: row.id },
    data: { object_key: key, mime, size_bytes: blob.length, sha256, ...(clearBlobs ? { blob: null } : {}) },
  })
  if (clearBlobs) stats.cleared++
}

async function main() {
  console.log(`[backfill] storage: ${storage.describe()}${dryRun ? ' (dry run)' : ''}${clearBlobs ? ', clearing blobs' : ''}`)
  const orphaned = await prisma.card_images.count({ where: { blob: null, object_key: null } })
  if (orphaned) console.warn(`[backfill] ${orphaned} row(s) have neither bytes nor an object key and cannot be recovered here`)

  // Page over ids only, then load one image at a time. Prisma moves Bytes through its engine as
  // base64 JSON, so pulling whole batches of blobs into memory can exceed a small instance's RAM
  // and take the API down with it; this keeps peak memory at a few copies of the largest image.
  let lastId = 0
  for (;;) {
    const ids = await prisma.card_images.findMany({
      where: { id: { gt: lastId }, blob: { not: null } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true },
    })
    if (ids.length === 0) break
    for (const { id } of ids) {
      const row = await prisma.card_images.findUnique({
        where: { id },
        select: { id: true, blob: true, card: { select: { user_id: true } } },
      })
      if (!row || !row.blob) continue // deleted or cleared since the id page was read
      stats.scanned++
      try {
        await processRow(row)
      } catch (e) {
        stats.failed++
        console.error(`  image ${row.id}: failed:`, e?.message || e)
      }
      if (stats.scanned % 25 === 0) console.log(`[backfill] ${stats.scanned} scanned, ${stats.uploaded} uploaded, ${stats.present} already stored`)
      if (process.env.BACKFILL_DEBUG_MEM && stats.scanned % 100 === 0) {
        const m = process.memoryUsage()
        const mb = (n) => `${Math.round(n / 1048576)}MB`
        console.log(`[mem] rss=${mb(m.rss)} heap=${mb(m.heapUsed)} external=${mb(m.external)} arrayBuffers=${mb(m.arrayBuffers)}`)
      }
    }
    lastId = ids[ids.length - 1].id
  }
  console.log('[backfill] done', stats)
  if (clearBlobs && stats.cleared && !dryRun) console.log('[backfill] run `node scripts/vacuum-db.js` to hand the freed space back to the filesystem')
  if (stats.failed) process.exitCode = 1
}

main().finally(() => prisma.$disconnect())

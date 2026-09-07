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
 *   node scripts/backfill-images.js [--dry-run] [--clear-blobs] [--batch=25]
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
const BATCH = Math.max(1, parseInt(batchArg?.split('=')[1] || '25', 10) || 25)

const prisma = new PrismaClient()
const storage = createStorage()
const stats = { scanned: 0, uploaded: 0, present: 0, cleared: 0, skipped: 0, failed: 0 }

async function processRow(row) {
  const blob = Buffer.from(row.blob)
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

  let lastId = 0
  for (;;) {
    const rows = await prisma.card_images.findMany({
      where: { id: { gt: lastId }, blob: { not: null } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, blob: true, card: { select: { user_id: true } } },
    })
    if (rows.length === 0) break
    for (const row of rows) {
      stats.scanned++
      try {
        await processRow(row)
      } catch (e) {
        stats.failed++
        console.error(`  image ${row.id}: failed:`, e?.message || e)
      }
    }
    lastId = rows[rows.length - 1].id
    console.log(`[backfill] ${stats.scanned} scanned, ${stats.uploaded} uploaded, ${stats.present} already stored`)
  }
  console.log('[backfill] done', stats)
  if (clearBlobs && stats.cleared && !dryRun) console.log('[backfill] run `node scripts/vacuum-db.js` to hand the freed space back to the filesystem')
  if (stats.failed) process.exitCode = 1
}

main().finally(() => prisma.$disconnect())

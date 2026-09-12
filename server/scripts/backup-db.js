#!/usr/bin/env node
/**
 * Writes a consistent copy of the live SQLite database using VACUUM INTO, which is safe while the
 * API is running (a plain `cp` of an open database can capture a half-written page). It then opens
 * the copy and counts rows to prove it is readable.
 *
 *   node scripts/backup-db.js [target-path]
 *
 * Default target: next to the database, <name>.backup-<UTC stamp>.db. The target must not exist.
 * Needs free disk equal to the database's live data. Copy the file off the machine afterwards.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

// Prisma resolves file: URLs relative to the prisma/ directory.
function dbFile() {
  const url = process.env.DATABASE_URL || ''
  if (!url.startsWith('file:')) throw new Error('backup-db only supports SQLite file: DATABASE_URLs')
  const p = url.slice('file:'.length).split('?')[0]
  return path.isAbsolute(p) ? p : path.resolve('prisma', p)
}

const mb = (file) => `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`
const source = dbFile()
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const target = path.resolve(process.argv[2] || source.replace(/\.db$/, '') + `.backup-${stamp}.db`)
if (fs.existsSync(target)) {
  console.error(`[backup] ${target} already exists; VACUUM INTO refuses to overwrite. Pick another path.`)
  process.exit(1)
}

console.log(`[backup] source ${source} (${mb(source)})`)
const prisma = new PrismaClient()
const started = Date.now()
await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
await prisma.$disconnect()
console.log(`[backup] wrote ${target} (${mb(target)}) in ${((Date.now() - started) / 1000).toFixed(1)}s`)

// Raw SQL so the read-back works whichever schema version the copy carries.
const copy = new PrismaClient({ datasources: { db: { url: `file:${target}` } } })
const [{ users, cards, images, powers }] = await copy.$queryRawUnsafe(
  'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM card_images) AS images, (SELECT count(*) FROM card_powers) AS powers',
)
const [{ integrity_check }] = await copy.$queryRawUnsafe('PRAGMA integrity_check')
await copy.$disconnect()
console.log(`[backup] copy reads back: ${users} users, ${cards} cards, ${images} images, ${powers} powers; integrity_check: ${integrity_check}`)
if (integrity_check !== 'ok') process.exit(1)

#!/usr/bin/env node
/**
 * Writes a consistent copy of the live SQLite database using VACUUM INTO, then opens the copy and
 * counts rows and runs an integrity check to prove it is readable.
 *
 *   node scripts/backup-db.js [target-path]
 *
 * Default target: next to the database, <name>.backup-<UTC stamp>.db. The target must not exist.
 * Needs free disk equal to the database's live data.
 *
 * Locking: VACUUM INTO holds a read lock for the whole copy. On a fast disk that is seconds; on a
 * slow network disk with a large database it is minutes, and SQLite's default journal mode makes
 * every writer wait for it, so requests that write start timing out. Run this while nothing is
 * serving, or let scripts/backup-before-migrate.js run it at boot before migrations.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { PrismaClient } from '@prisma/client'

// Prisma resolves file: URLs relative to the prisma/ directory.
export function databaseFile(env = process.env) {
  const url = env.DATABASE_URL || ''
  if (!url.startsWith('file:')) throw new Error('backup-db only supports SQLite file: DATABASE_URLs')
  const p = url.slice('file:'.length).split('?')[0]
  return path.isAbsolute(p) ? p : path.resolve('prisma', p)
}

const mb = (file) => `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`

/** Backs up the configured database to `target`. Throws if the target exists or the copy fails its checks. */
export async function backupDatabase(target) {
  const source = databaseFile()
  target = path.resolve(target)
  if (fs.existsSync(target)) throw new Error(`${target} already exists; VACUUM INTO refuses to overwrite. Pick another path.`)
  fs.mkdirSync(path.dirname(target), { recursive: true })

  console.log(`[backup] source ${source} (${mb(source)})`)
  const prisma = new PrismaClient()
  const started = Date.now()
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  } finally {
    await prisma.$disconnect()
  }
  console.log(`[backup] wrote ${target} (${mb(target)}) in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  // Raw SQL so the read-back works whichever schema version the copy carries.
  const copy = new PrismaClient({ datasources: { db: { url: `file:${target}` } } })
  let counts, integrity
  try {
    ;[counts] = await copy.$queryRawUnsafe(
      'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM card_images) AS images, (SELECT count(*) FROM card_powers) AS powers',
    )
    ;[{ integrity_check: integrity }] = await copy.$queryRawUnsafe('PRAGMA integrity_check')
  } finally {
    await copy.$disconnect()
  }
  console.log(`[backup] copy reads back: ${counts.users} users, ${counts.cards} cards, ${counts.images} images, ${counts.powers} powers; integrity_check: ${integrity}`)
  if (integrity !== 'ok') throw new Error(`backup failed integrity_check: ${integrity}`)
  return { target, ...counts }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const target = process.argv[2] || databaseFile().replace(/\.db$/, '') + `.backup-${stamp}.db`
  backupDatabase(target).catch((e) => {
    console.error(`[backup] ${e.message}`)
    process.exit(1)
  })
}

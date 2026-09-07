#!/usr/bin/env node
/**
 * Rebuilds the SQLite file so space freed by clearing image blobs is returned to the filesystem.
 * SQLite never shrinks a database on its own. Needs about the database's size in free disk while it
 * runs and takes a write lock, so run it in a quiet moment. From server/:  node scripts/vacuum-db.js
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

// Prisma resolves file: URLs relative to the prisma/ directory. Best effort, only used for the size log.
function dbFile() {
  const url = process.env.DATABASE_URL || ''
  if (!url.startsWith('file:')) return null
  const p = url.slice('file:'.length).split('?')[0]
  return path.isAbsolute(p) ? p : path.resolve('prisma', p)
}

function sizeOf(file) {
  try {
    return `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`
  } catch {
    return 'unknown size'
  }
}

const prisma = new PrismaClient()
const file = dbFile()
if (file) console.log(`[vacuum] before: ${sizeOf(file)} (${file})`)
await prisma.$executeRawUnsafe('VACUUM')
if (file) console.log(`[vacuum] after:  ${sizeOf(file)}`)
await prisma.$disconnect()

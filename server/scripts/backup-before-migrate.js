#!/usr/bin/env node
/**
 * Boot-time backup hook. `npm run start:migrate` runs this before `prisma migrate deploy`.
 *
 * Does nothing unless BACKUP_BEFORE_MIGRATE names a target path. If that file already exists it
 * logs and continues, so a restart never makes a second copy. Running here rather than from the
 * Shell matters: at this moment nothing is serving requests, so the read lock VACUUM INTO holds
 * for minutes on a slow disk cannot time out anyone's writes. If the backup fails the process
 * exits non-zero and the deploy stops before any migration runs.
 *
 * Use: set the variable, deploy or restart, confirm the "[backup] wrote" log line, remove the variable.
 */
import fs from 'fs'
import { backupDatabase } from './backup-db.js'

const target = process.env.BACKUP_BEFORE_MIGRATE
if (!target) process.exit(0)
if (fs.existsSync(target)) {
  console.log(`[backup] ${target} already exists; skipping the boot-time backup`)
  process.exit(0)
}
console.log('[backup] BACKUP_BEFORE_MIGRATE is set; backing up before migrations run')
backupDatabase(target).catch((e) => {
  console.error(`[backup] FAILED, refusing to continue: ${e.message}`)
  process.exit(1)
})

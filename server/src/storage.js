import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Object storage for image bytes. Both drivers expose the same interface:
 *
 *   put(key, bytes, mime)    store; idempotent because keys are content-addressed
 *   exists(key)              boolean
 *   get(key)                 Buffer, or null when missing
 *   delete(key)              no-op when missing
 *   list(prefix)             every stored object under prefix as { key, size }; used by verification
 *   presignGet(key, ttl)     absolute URL the browser can GET without credentials, or null when the
 *                            driver has no such thing (local). The API then serves the bytes itself
 *                            through a signed /api/images/:id/content URL (see signedUrls.js).
 *
 *   r2     Cloudflare R2 over its S3-compatible endpoint. Use in production.
 *   local  Files under LOCAL_STORAGE_DIR (default server/storage). Development and tests only —
 *          on Render the disk is ephemeral, so anything stored this way vanishes on redeploy.
 */
export function createStorage(env = process.env) {
  const driver = (env.STORAGE_DRIVER || 'local').toLowerCase()
  if (driver === 'r2') return createR2Storage(env)
  if (driver === 'local') return createLocalStorage(env)
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected "r2" or "local")`)
}

function isNotFound(e) {
  return e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey'
}

export function createR2Storage(env = process.env) {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((k) => !env[k])
  if (missing.length) throw new Error(`STORAGE_DRIVER=r2 requires ${missing.join(', ')}`)
  const Bucket = env.R2_BUCKET
  const client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // https://<account>.r2.cloudflarestorage.com/<bucket>/<key>, the form Cloudflare documents.
    forcePathStyle: true,
    // R2 doesn't implement the newer SDK default of sending a CRC32 checksum header on every request.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return {
    driver: 'r2',
    describe: () => `r2 bucket "${Bucket}"`,
    async put(key, bytes, mime) {
      await client.send(new PutObjectCommand({
        Bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        // A key's content never changes, so the browser may cache the object for as long as the URL lives.
        CacheControl: 'private, max-age=31536000, immutable',
      }))
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return true
      } catch (e) {
        if (isNotFound(e)) return false
        throw e
      }
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        return Buffer.from(await out.Body.transformToByteArray())
      } catch (e) {
        if (isNotFound(e)) return null
        throw e
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },
    async list(prefix = '') {
      const objects = []
      let ContinuationToken
      do {
        const out = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }))
        for (const o of out.Contents || []) objects.push({ key: o.Key, size: o.Size })
        ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined
      } while (ContinuationToken)
      return objects
    },
    presignGet(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: ttlSeconds })
    },
  }
}

export function createLocalStorage(env = process.env) {
  const root = path.resolve(SERVER_ROOT, env.LOCAL_STORAGE_DIR || './storage')
  const resolve = (key) => {
    const full = path.resolve(root, key)
    if (!full.startsWith(root + path.sep)) throw new Error(`storage key escapes root: ${key}`)
    return full
  }
  return {
    driver: 'local',
    root,
    describe: () => `local directory ${root}`,
    async put(key, bytes) {
      const full = resolve(key)
      await fs.mkdir(path.dirname(full), { recursive: true })
      // Write beside the target and rename so a crash mid-write never leaves a truncated object.
      const tmp = `${full}.${process.pid}.tmp`
      await fs.writeFile(tmp, bytes)
      await fs.rename(tmp, full)
    },
    async exists(key) {
      try {
        await fs.access(resolve(key))
        return true
      } catch {
        return false
      }
    },
    async get(key) {
      try {
        return await fs.readFile(resolve(key))
      } catch (e) {
        if (e?.code === 'ENOENT') return null
        throw e
      }
    },
    async delete(key) {
      await fs.rm(resolve(key), { force: true })
    },
    async list(prefix = '') {
      const objects = []
      const walk = async (dir) => {
        let entries
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch (e) {
          if (e?.code === 'ENOENT') return
          throw e
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(full)
          } else if (!entry.name.endsWith('.tmp')) {
            const key = path.relative(root, full).split(path.sep).join('/')
            if (key.startsWith(prefix)) objects.push({ key, size: (await fs.stat(full)).size })
          }
        }
      }
      await walk(root)
      return objects
    },
    async presignGet() {
      return null
    },
  }
}

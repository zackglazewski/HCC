import { createHash } from 'crypto'

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/** Detects PNG/JPEG/WebP from the leading bytes; null for anything else. */
export function sniffImageMime(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

/**
 * Decodes a base64 data URL and validates the real content type by magic bytes (files often carry
 * the wrong extension/MIME). Returns null when it isn't PNG/JPEG/WebP.
 */
export function decodeImageDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) return null
  const blob = Buffer.from(match[2], 'base64')
  const mime = sniffImageMime(blob)
  return mime ? { blob, mime } : null
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Storage key for a user's image. Content-addressed, so the same picture on two cards is stored once. */
export function imageObjectKey(userId, sha256) {
  return `u/${userId}/${sha256}`
}

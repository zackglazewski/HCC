import { createHmac, timingSafeEqual } from 'crypto'

/**
 * HMAC-signed, expiring URLs for image bytes the API serves itself: the local storage driver, and
 * legacy rows whose bytes still live in the database. They give the browser the same thing a
 * presigned R2 URL does — a plain GET with no bearer token that works for a limited time.
 */
export function createUrlSigner(secret) {
  if (!secret) throw new Error('createUrlSigner: secret required')
  const sign = (imageId, exp) => createHmac('sha256', secret).update(`${imageId}:${exp}`).digest('hex')
  return {
    /** Path (relative to the API origin) that serves image `imageId` for the next `ttlSeconds`. */
    imagePath(imageId, ttlSeconds, now = Date.now()) {
      const exp = Math.floor(now / 1000) + ttlSeconds
      return `/api/images/${imageId}/content?exp=${exp}&sig=${sign(imageId, exp)}`
    },
    /** True when `sig` matches `imageId`/`exp` and `exp` hasn't passed. */
    verify(imageId, exp, sig, now = Date.now()) {
      const expNum = Number(exp)
      if (!Number.isInteger(expNum) || expNum * 1000 < now) return false
      if (typeof sig !== 'string' || sig.length !== 64) return false
      const expected = Buffer.from(sign(imageId, expNum), 'hex')
      const given = Buffer.from(sig, 'hex')
      return given.length === expected.length && timingSafeEqual(expected, given)
    },
  }
}

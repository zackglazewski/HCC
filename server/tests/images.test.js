import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeImageDataUrl, imageObjectKey, sha256Hex, sniffImageMime } from '../src/images.js'

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16, 1)])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 1)])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])

test('sniffs png, jpeg and webp by magic bytes', () => {
  assert.equal(sniffImageMime(png), 'image/png')
  assert.equal(sniffImageMime(jpeg), 'image/jpeg')
  assert.equal(sniffImageMime(webp), 'image/webp')
  assert.equal(sniffImageMime(Buffer.from('GIF89a')), null)
  assert.equal(sniffImageMime(Buffer.alloc(0)), null)
})

test('decodes a data URL and trusts the bytes over the declared mime', () => {
  const decoded = decodeImageDataUrl(`data:image/gif;base64,${png.toString('base64')}`)
  assert.ok(decoded)
  assert.equal(decoded.mime, 'image/png')
  assert.ok(decoded.blob.equals(png))
})

test('rejects non-image and malformed data URLs', () => {
  assert.equal(decodeImageDataUrl('data:text/plain;base64,aGVsbG8='), null)
  assert.equal(decodeImageDataUrl('not a data url'), null)
  assert.equal(decodeImageDataUrl('data:image/png,rawbytes'), null)
})

test('object keys are content-addressed per user', () => {
  const sha = sha256Hex(png)
  assert.match(sha, /^[0-9a-f]{64}$/)
  assert.equal(imageObjectKey(7, sha), `u/7/${sha}`)
  assert.equal(sha256Hex(Buffer.from(png)), sha)
})

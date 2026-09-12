import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUrlSigner } from '../src/signedUrls.js'

const signer = createUrlSigner('test-secret')
const NOW = 1_800_000_000_000

function parts(path) {
  const url = new URL(path, 'http://x')
  return { exp: url.searchParams.get('exp'), sig: url.searchParams.get('sig') }
}

test('a fresh signed path verifies', () => {
  const path = signer.imagePath(42, 900, NOW)
  assert.match(path, /^\/api\/images\/42\/content\?exp=\d+&sig=[0-9a-f]{64}$/)
  const { exp, sig } = parts(path)
  assert.equal(signer.verify(42, exp, sig, NOW), true)
  assert.equal(signer.verify(42, exp, sig, NOW + 899_000), true)
})

test('expired, tampered and foreign signatures fail', () => {
  const { exp, sig } = parts(signer.imagePath(42, 900, NOW))
  assert.equal(signer.verify(42, exp, sig, NOW + 901_000), false, 'expired')
  assert.equal(signer.verify(43, exp, sig, NOW), false, 'different image')
  assert.equal(signer.verify(42, String(Number(exp) + 1), sig, NOW), false, 'different expiry')
  assert.equal(signer.verify(42, exp, sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a'), NOW), false, 'flipped byte')
  assert.equal(signer.verify(42, exp, 'zz'.repeat(32), NOW), false, 'non-hex')
  assert.equal(signer.verify(42, exp, undefined, NOW), false, 'missing')
  assert.equal(signer.verify(42, 'soon', sig, NOW), false, 'non-numeric expiry')
  assert.equal(createUrlSigner('other').verify(42, exp, sig, NOW), false, 'different secret')
})

test('refuses to run without a secret', () => {
  assert.throws(() => createUrlSigner(''))
})

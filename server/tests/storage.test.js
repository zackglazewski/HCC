import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createLocalStorage, createStorage } from '../src/storage.js'

async function tempStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-storage-'))
  return { dir, storage: createLocalStorage({ LOCAL_STORAGE_DIR: dir }) }
}

test('local driver round-trips bytes', async (t) => {
  const { dir, storage } = await tempStorage()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const key = 'u/1/abc123'
  assert.equal(await storage.exists(key), false)
  assert.equal(await storage.get(key), null)
  await storage.put(key, Buffer.from('hello'), 'image/png')
  assert.equal(await storage.exists(key), true)
  assert.equal((await storage.get(key)).toString(), 'hello')
  assert.equal(await storage.presignGet(key, 60), null)
  await storage.put('u/2/def456', Buffer.from('second'), 'image/png')
  assert.deepEqual(
    (await storage.list('u/')).sort((a, b) => a.key.localeCompare(b.key)),
    [{ key: 'u/1/abc123', size: 5 }, { key: 'u/2/def456', size: 6 }],
  )
  assert.deepEqual(await storage.list('u/2/'), [{ key: 'u/2/def456', size: 6 }])
  await storage.delete('u/2/def456')
  await storage.delete(key)
  await storage.delete(key) // deleting a missing object is a no-op
  assert.equal(await storage.exists(key), false)
  assert.deepEqual(await fs.readdir(dir), ['u'], 'no temp files left behind')
})

test('local driver never writes outside its root', async (t) => {
  const { dir, storage } = await tempStorage()
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  await assert.rejects(storage.put('../escape', Buffer.from('x')))
  await assert.rejects(storage.get('/etc/passwd'))
})

test('createStorage picks a driver from the environment', () => {
  assert.equal(createStorage({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: os.tmpdir() }).driver, 'local')
  assert.equal(createStorage({}).driver, 'local')
  assert.throws(() => createStorage({ STORAGE_DRIVER: 's3' }), /Unknown STORAGE_DRIVER/)
  assert.throws(() => createStorage({ STORAGE_DRIVER: 'r2', R2_BUCKET: 'b' }), /R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/)
  const r2 = createStorage({ STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'b' })
  assert.equal(r2.driver, 'r2')
})

test('r2 driver presigns a GET against the account endpoint', async () => {
  const r2 = createStorage({ STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'bucket' })
  const url = new URL(await r2.presignGet('u/1/abc', 900))
  assert.equal(url.origin, 'https://acct.r2.cloudflarestorage.com')
  assert.equal(url.pathname, '/bucket/u/1/abc')
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900')
  assert.ok(url.searchParams.get('X-Amz-Signature'))
})

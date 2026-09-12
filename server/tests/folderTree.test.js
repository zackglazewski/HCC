import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectDescendants, isSelfOrDescendant } from '../src/folderTree.js'

// root
// ├── 1
// │   ├── 2
// │   │   └── 3
// │   └── 4
// └── 5
const tree = new Map(
  [
    { id: 1, parent_id: null },
    { id: 2, parent_id: 1 },
    { id: 3, parent_id: 2 },
    { id: 4, parent_id: 1 },
    { id: 5, parent_id: null },
  ].map((f) => [f.id, f]),
)

test('moving to the root is always allowed', () => {
  assert.equal(isSelfOrDescendant(tree, 1, null), false)
})

test('a folder cannot move into itself', () => {
  assert.equal(isSelfOrDescendant(tree, 1, 1), true)
})

test('a folder cannot move into a direct child or deeper descendant', () => {
  assert.equal(isSelfOrDescendant(tree, 1, 2), true)
  assert.equal(isSelfOrDescendant(tree, 1, 3), true)
  assert.equal(isSelfOrDescendant(tree, 2, 3), true)
})

test('a folder can move into a sibling, ancestor, or unrelated branch', () => {
  assert.equal(isSelfOrDescendant(tree, 2, 4), false)
  assert.equal(isSelfOrDescendant(tree, 3, 1), false)
  assert.equal(isSelfOrDescendant(tree, 1, 5), false)
  assert.equal(isSelfOrDescendant(tree, 5, 3), false)
})

test('an unknown target is treated as not a descendant', () => {
  assert.equal(isSelfOrDescendant(tree, 1, 999), false)
})

test('corrupt cyclic data terminates instead of looping forever', () => {
  const cyclic = new Map([
    [10, { id: 10, parent_id: 11 }],
    [11, { id: 11, parent_id: 10 }],
  ])
  assert.equal(isSelfOrDescendant(cyclic, 42, 10), true)
})

test('collectDescendants returns the folder and everything nested under it', () => {
  assert.deepEqual(collectDescendants(tree, 1).sort(), [1, 2, 3, 4])
  assert.deepEqual(collectDescendants(tree, 2), [2, 3])
  assert.deepEqual(collectDescendants(tree, 5), [5])
  assert.deepEqual(collectDescendants(tree, 99), [99])
})

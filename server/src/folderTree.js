/**
 * Pure helpers for the folder tree. Kept separate from the Express app so they can be unit tested.
 *
 * `folderMap` is a Map<id, { id, parent_id }> containing every folder the user owns.
 */

/**
 * True when `targetId` is `folderId` itself or one of its descendants — i.e. re-parenting
 * `folderId` under `targetId` would create a cycle. `targetId` of null (the root) is always safe.
 */
export function isSelfOrDescendant(folderMap, folderId, targetId) {
  let cursor = targetId
  const seen = new Set()
  while (cursor != null) {
    if (cursor === folderId) return true
    if (seen.has(cursor)) return true // defensive: never loop forever on corrupt data
    seen.add(cursor)
    const node = folderMap.get(cursor)
    if (!node) return false
    cursor = node.parent_id
  }
  return false
}

/** Ids of `rootId` and every folder nested under it, at any depth. */
export function collectDescendants(folderMap, rootId) {
  const children = new Map()
  for (const f of folderMap.values()) {
    if (f.parent_id == null) continue
    if (!children.has(f.parent_id)) children.set(f.parent_id, [])
    children.get(f.parent_id).push(f.id)
  }
  const result = [rootId]
  const seen = new Set(result)
  for (let i = 0; i < result.length; i++) {
    for (const child of children.get(result[i]) || []) {
      if (seen.has(child)) continue // defensive: never loop forever on corrupt data
      seen.add(child)
      result.push(child)
    }
  }
  return result
}

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

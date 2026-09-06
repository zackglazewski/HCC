import { ServerCard, ServerFolder } from '../lib/api'

// ---------------------------------------------------------------------------
// Item identity
// ---------------------------------------------------------------------------

export type ItemKind = 'folder' | 'card'
/** Stable identity for anything shown in the explorer: `folder:12` or `card:34`. */
export type ItemKey = string

export function keyOf(kind: ItemKind, id: number): ItemKey {
  return `${kind}:${id}`
}

export function parseKey(key: ItemKey): { kind: ItemKind; id: number } {
  const [kind, id] = key.split(':')
  return { kind: kind as ItemKind, id: Number(id) }
}

export function splitKeys(keys: Iterable<ItemKey>): { cardIds: number[]; folderIds: number[] } {
  const cardIds: number[] = []
  const folderIds: number[] = []
  for (const key of keys) {
    const { kind, id } = parseKey(key)
    if (kind === 'card') cardIds.push(id)
    else folderIds.push(id)
  }
  return { cardIds, folderIds }
}

export type ExplorerItem =
  | { kind: 'folder'; id: number; key: ItemKey; name: string; updatedAt: string; parentId: number | null; folder: ServerFolder }
  | { kind: 'card'; id: number; key: ItemKey; name: string; updatedAt: string; parentId: number | null; card: ServerCard }

export type ViewMode = 'grid' | 'list'
export type SortField = 'name' | 'updated'
export type SortDir = 'asc' | 'desc'
/** What a card tile shows: the general's crest on a tinted cover, or the rendered card itself. */
export type CardPreviewMode = 'emblem' | 'render'

// ---------------------------------------------------------------------------
// Tree index
// ---------------------------------------------------------------------------

export type FolderIndex = {
  byId: Map<number, ServerFolder>
  cardById: Map<number, ServerCard>
  /** Direct child folders per parent (null = root). */
  childrenOf: Map<number | null, ServerFolder[]>
  /** Cards directly inside each folder (null = root). */
  cardsIn: Map<number | null, ServerCard[]>
}

/**
 * Builds lookup maps from the flat server lists. Anything pointing at a folder we don't know
 * about (shouldn't happen thanks to FK constraints, but be defensive) is bucketed at the root.
 */
export function buildIndex(folders: ServerFolder[], cards: ServerCard[]): FolderIndex {
  const byId = new Map<number, ServerFolder>()
  for (const f of folders) byId.set(f.id, f)

  const childrenOf = new Map<number | null, ServerFolder[]>()
  for (const f of folders) {
    const parent = f.parent_id != null && byId.has(f.parent_id) ? f.parent_id : null
    const list = childrenOf.get(parent)
    if (list) list.push(f)
    else childrenOf.set(parent, [f])
  }

  const cardById = new Map<number, ServerCard>()
  const cardsIn = new Map<number | null, ServerCard[]>()
  for (const c of cards) {
    cardById.set(c.id, c)
    const parent = c.folder_id != null && byId.has(c.folder_id) ? c.folder_id : null
    const list = cardsIn.get(parent)
    if (list) list.push(c)
    else cardsIn.set(parent, [c])
  }

  return { byId, cardById, childrenOf, cardsIn }
}

/** Ancestors from the root down to (and including) `folderId`. Empty for the root itself. */
export function pathTo(index: FolderIndex, folderId: number | null): ServerFolder[] {
  const path: ServerFolder[] = []
  const seen = new Set<number>()
  let cursor = folderId
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor)
    const folder = index.byId.get(cursor)
    if (!folder) break
    path.unshift(folder)
    cursor = folder.parent_id
  }
  return path
}

/** Every folder nested anywhere under `folderId` (not including `folderId` itself). */
export function descendantFolderIds(index: FolderIndex, folderId: number): Set<number> {
  const out = new Set<number>()
  const stack = [folderId]
  while (stack.length) {
    const current = stack.pop()!
    for (const child of index.childrenOf.get(current) || []) {
      if (out.has(child.id)) continue
      out.add(child.id)
      stack.push(child.id)
    }
  }
  return out
}

/** Recursive totals of what lives under a folder (used for delete confirmations and tile captions). */
export function subtreeCounts(index: FolderIndex, folderId: number): { folders: number; cards: number } {
  const nested = descendantFolderIds(index, folderId)
  let cards = (index.cardsIn.get(folderId) || []).length
  for (const id of nested) cards += (index.cardsIn.get(id) || []).length
  return { folders: nested.size, cards }
}

/** Direct child count for a folder tile caption. */
export function directCounts(index: FolderIndex, folderId: number): { folders: number; cards: number } {
  return {
    folders: (index.childrenOf.get(folderId) || []).length,
    cards: (index.cardsIn.get(folderId) || []).length,
  }
}

/**
 * A folder can't be dropped into itself or any of its descendants. Cards can go anywhere.
 * `targetId` null means the root, which is always a legal destination.
 */
export function isInvalidDropTarget(index: FolderIndex, movingFolderIds: number[], targetId: number | null): boolean {
  if (targetId == null) return false
  for (const id of movingFolderIds) {
    if (id === targetId) return true
    if (descendantFolderIds(index, id).has(targetId)) return true
  }
  return false
}

/** True when every item is already inside `targetId`, so a move would be a no-op. */
export function allAlreadyIn(index: FolderIndex, keys: Iterable<ItemKey>, targetId: number | null): boolean {
  let any = false
  for (const key of keys) {
    any = true
    const { kind, id } = parseKey(key)
    const parent = kind === 'card' ? index.cardById.get(id)?.folder_id ?? null : index.byId.get(id)?.parent_id ?? null
    if (parent !== targetId) return false
  }
  return any
}

// ---------------------------------------------------------------------------
// Items, sorting, searching
// ---------------------------------------------------------------------------

export function folderItem(folder: ServerFolder): ExplorerItem {
  return { kind: 'folder', id: folder.id, key: keyOf('folder', folder.id), name: folder.name, updatedAt: folder.updated_at, parentId: folder.parent_id, folder }
}

export function cardItem(card: ServerCard): ExplorerItem {
  return { kind: 'card', id: card.id, key: keyOf('card', card.id), name: card.title, updatedAt: card.updated_at, parentId: card.folder_id ?? null, card }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortItems(items: ExplorerItem[], field: SortField, dir: SortDir): ExplorerItem[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (field === 'name') {
      const byName = collator.compare(a.name, b.name)
      if (byName !== 0) return byName * sign
      return a.id - b.id
    }
    const byTime = Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    if (byTime !== 0) return byTime * sign
    return collator.compare(a.name, b.name)
  })
}

/** Contents of one folder for display: folders first, then cards, each sorted. */
export function itemsInFolder(index: FolderIndex, folderId: number | null, field: SortField, dir: SortDir): ExplorerItem[] {
  const folders = (index.childrenOf.get(folderId) || []).map(folderItem)
  const cards = (index.cardsIn.get(folderId) || []).map(cardItem)
  return [...sortItems(folders, field, dir), ...sortItems(cards, field, dir)]
}

/** Case-insensitive substring search across every folder and card. */
export function searchItems(folders: ServerFolder[], cards: ServerCard[], query: string, field: SortField, dir: SortDir): ExplorerItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matchFolders = folders.filter((f) => f.name.toLowerCase().includes(q)).map(folderItem)
  const matchCards = cards.filter((c) => c.title.toLowerCase().includes(q)).map(cardItem)
  return [...sortItems(matchFolders, field, dir), ...sortItems(matchCards, field, dir)]
}

/** Human-readable "My Cards / Armies / Utgar" for search results and move dialogs. */
export function describePath(index: FolderIndex, folderId: number | null, rootLabel = 'My Cards'): string {
  const path = pathTo(index, folderId)
  return [rootLabel, ...path.map((f) => f.name)].join(' / ')
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export const GENERAL_LABELS: Record<string, string> = {
  aquilla: 'Aquilla',
  einar: 'Einar',
  jandar: 'Jandar',
  ullar: 'Ullar',
  utgar: 'Utgar',
  valkrill: 'Valkrill',
  vydar: 'Vydar',
  custom: 'Custom',
}

/** Two-stop gradient per general, used as the card tile "cover art". */
export const GENERAL_GRADIENTS: Record<string, [string, string]> = {
  aquilla: ['#d9b13b', '#8a6a12'],
  einar: ['#8a3b7d', '#3e1039'],
  jandar: ['#6aa8dc', '#2f5f96'],
  ullar: ['#3f9f6a', '#12553a'],
  utgar: ['#c9484a', '#6f1d20'],
  valkrill: ['#d08a3a', '#7a4712'],
  vydar: ['#7f9db0', '#3d5566'],
  custom: ['#94a3b8', '#475569'],
}

export function generalLabel(general: string | null | undefined): string {
  if (!general) return 'Card'
  return GENERAL_LABELS[general] || general.charAt(0).toUpperCase() + general.slice(1)
}

export function generalGradient(general: string | null | undefined): [string, string] {
  return (general && GENERAL_GRADIENTS[general]) || GENERAL_GRADIENTS.custom
}

const HEX6 = /^#?[0-9a-fA-F]{6}$/
function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex || !HEX6.test(hex)) return null
  return hex.startsWith('#') ? hex : `#${hex}`
}

/**
 * Cover gradient for a card. Custom-template cards use the theme colours saved with the card
 * (primary frame colour fading into the background colour); everything else uses its general.
 */
export function cardGradient(card: Pick<ServerCard, 'general' | 'theme_primary_hex' | 'theme_secondary_hex' | 'theme_background_hex'>): [string, string] {
  if (card.general === 'custom') {
    const primary = normalizeHex(card.theme_primary_hex)
    const background = normalizeHex(card.theme_background_hex)
    const secondary = normalizeHex(card.theme_secondary_hex)
    const from = primary ?? secondary
    const to = background ?? secondary ?? primary
    if (from && to) return [from, to]
  }
  return generalGradient(card.general)
}

export function formatUpdated(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "“Armies”" for a single item, otherwise "3 cards" / "2 folders" / "5 items". */
export function describeSelection(index: FolderIndex, keys: ItemKey[]): string {
  if (keys.length === 1) {
    const { kind, id } = parseKey(keys[0])
    const name = kind === 'card' ? index.cardById.get(id)?.title : index.byId.get(id)?.name
    if (name) return `“${name}”`
  }
  const { cardIds, folderIds } = splitKeys(keys)
  if (folderIds.length === 0) return pluralize(cardIds.length, 'card')
  if (cardIds.length === 0) return pluralize(folderIds.length, 'folder')
  return pluralize(keys.length, 'item')
}

export function describeContents(counts: { folders: number; cards: number }): string {
  const parts: string[] = []
  if (counts.folders) parts.push(pluralize(counts.folders, 'folder'))
  if (counts.cards) parts.push(pluralize(counts.cards, 'card'))
  return parts.length ? parts.join(', ') : 'Empty'
}

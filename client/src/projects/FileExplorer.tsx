import { DragEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createCard, createFolder, deleteCard, deleteFolder, listCards, listFolders, moveItems, patchCard, patchFolder, ServerCard, ServerFolder } from '../lib/api'
import {
  ExplorerItem,
  ItemKey,
  SortField,
  allAlreadyIn,
  buildIndex,
  cardItem,
  describeContents,
  describePath,
  describeSelection,
  descendantFolderIds,
  directCounts,
  folderItem,
  isInvalidDropTarget,
  itemsInFolder,
  keyOf,
  parseKey,
  pathTo,
  pluralize,
  searchItems,
  splitKeys,
  subtreeCounts,
} from './explorerModel'
import { useCoarsePointer, usePersistedState, useToasts } from './hooks'
import { useExplorerPrefs } from './preferences'
import { hasLocalRender, loadThumbnail } from './thumbnails'
import { ThumbnailBackfill } from './ThumbnailBackfill'
import { DropHandlers, FolderTreeView } from './FolderTree'
import { Breadcrumbs, CardTile, FolderTile, ListHeader, ListRow } from './ExplorerItems'
import { ConfirmDialog, ContextMenu, MenuItem, MoveDialog, NameDialog, Toasts } from './dialogs'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CrestIcon,
  FolderPlusIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  MoveIcon,
  OpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SelectIcon,
  TrashIcon,
  XIcon,
} from './icons'

const ROOT_LABEL = 'My Cards'

type DialogState =
  | { type: 'newFolder' }
  | { type: 'rename'; key: ItemKey }
  | { type: 'move'; keys: ItemKey[] }
  | { type: 'delete'; keys: ItemKey[] }

/** Keys empty = menu for the empty background of the current folder. */
type MenuState = { x: number; y: number; keys: ItemKey[] }

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number')

/**
 * Google-Drive-style explorer for a signed-in user's cards: recursive folders, breadcrumbs,
 * grid/list views, drag & drop, context menus, search, and an opt-in select mode for bulk actions.
 *
 * Interaction model: a plain click opens (card → editor, folder → navigate). Selection happens via
 * the Select toggle, the hover checkbox, Cmd/Ctrl-click, Shift-click, or the item menu. Once
 * anything is selected, clicks toggle until the selection is cleared.
 * The folder being viewed lives in the URL (`?folder=ID`) so the browser back button works.
 */
export function FileExplorer() {
  const { getAccessTokenSilently, logout } = useAuth0()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toasts, push: toast, dismiss } = useToasts()
  const coarsePointer = useCoarsePointer()

  const token = useCallback(() => getAccessTokenSilently().catch(() => null), [getAccessTokenSilently])

  // ---- data -------------------------------------------------------------
  const [folders, setFolders] = useState<ServerFolder[]>([])
  const [cards, setCards] = useState<ServerCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ---- preferences (account-synced) + device-local tree state -------------
  const { prefs, update: updatePrefs } = useExplorerPrefs(token)
  const { view, sortField, sortDir, cardPreview } = prefs
  const [expandedList, setExpandedList] = usePersistedState<number[]>('hcc:explorer:expanded', [], isNumberArray)
  const expanded = useMemo(() => new Set(expandedList), [expandedList])

  // ---- transient ui ----------------------------------------------------
  const [query, setQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<ItemKey>>(() => new Set())
  const anchorRef = useRef<ItemKey | null>(null)
  const [dragKeys, setDragKeys] = useState<ItemKey[] | null>(null)
  /** undefined = nothing hovered, null = the root, number = a folder. */
  const [dropTarget, setDropTarget] = useState<number | null | undefined>(undefined)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])
  const ghostRef = useRef<HTMLDivElement>(null)
  /** Latest moveKeys, so drop handlers created earlier never call a stale closure. */
  const moveKeysRef = useRef<(keys: ItemKey[], targetId: number | null) => Promise<void>>(async () => {})

  // ---- derived ---------------------------------------------------------
  const folderParam = searchParams.get('folder')
  const currentFolderId = folderParam && /^\d+$/.test(folderParam) ? Number(folderParam) : null
  const index = useMemo(() => buildIndex(folders, cards), [folders, cards])
  const path = useMemo(() => pathTo(index, currentFolderId), [index, currentFolderId])
  const searching = query.trim().length > 0
  const items = useMemo(
    () => (searching ? searchItems(folders, cards, query, sortField, sortDir) : itemsInFolder(index, currentFolderId, sortField, sortDir)),
    [searching, folders, cards, query, index, currentFolderId, sortField, sortDir],
  )
  const itemByKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const folderItems = useMemo(() => items.filter((i): i is Extract<ExplorerItem, { kind: 'folder' }> => i.kind === 'folder'), [items])
  const cardItems = useMemo(() => items.filter((i): i is Extract<ExplorerItem, { kind: 'card' }> => i.kind === 'card'), [items])
  const selectedKeys = useMemo(() => [...selected], [selected])
  /** Explicit select mode, or an implicit one while anything is selected. */
  const inSelectMode = selectMode || selected.size > 0
  const menuKeys = useMemo(() => new Set(menu?.keys ?? []), [menu])

  const thumbnailLoader = useCallback((card: ServerCard) => loadThumbnail(card, token), [token])

  /** Cards with no preview yet, current folder first so what's on screen fills in soonest. */
  const previewQueue = useMemo(() => {
    if (cardPreview !== 'render' || loading) return []
    const missing = cards.filter((c) => !c.thumbnail && !hasLocalRender(c.id))
    const here = new Set((index.cardsIn.get(currentFolderId) || []).map((c) => c.id))
    return [...missing.filter((c) => here.has(c.id)), ...missing.filter((c) => !here.has(c.id))]
  }, [cardPreview, loading, cards, index, currentFolderId])

  const onPreviewRendered = useCallback((cardId: number, updatedAt: string) => {
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, thumbnail: { updated_at: updatedAt } } : c)))
  }, [])

  /** Resolve a key to an item even when it isn't in the current listing (e.g. a sidebar folder). */
  const lookupItem = useCallback(
    (key: ItemKey): ExplorerItem | undefined => {
      const fromList = itemByKey.get(key)
      if (fromList) return fromList
      const { kind, id } = parseKey(key)
      if (kind === 'folder') {
        const f = index.byId.get(id)
        return f ? folderItem(f) : undefined
      }
      const c = index.cardById.get(id)
      return c ? cardItem(c) : undefined
    },
    [itemByKey, index],
  )

  // ---- loading ---------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let t: string
    try {
      t = await getAccessTokenSilently()
    } catch {
      // Token refresh failed — the cached Auth0 session is stale, so clear it.
      logout({ openUrl: false })
      return
    }
    try {
      const [f, c] = await Promise.all([listFolders(t), listCards(t)])
      setFolders(f)
      setCards(c)
    } catch {
      setError('Could not load your cards. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [getAccessTokenSilently, logout])

  useEffect(() => {
    load()
  }, [load])

  // The folder in the URL may have been deleted (or never existed) — fall back to the root.
  useEffect(() => {
    if (loading) return
    if (currentFolderId != null && !index.byId.has(currentFolderId)) setSearchParams({}, { replace: true })
  }, [loading, currentFolderId, index, setSearchParams])

  // Keep the sidebar tree opened along the path to the current folder.
  useEffect(() => {
    if (path.length === 0) return
    setExpandedList((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const f of path) {
        if (!next.has(f.id)) {
          next.add(f.id)
          changed = true
        }
      }
      return changed ? [...next] : prev
    })
  }, [path, setExpandedList])

  // Selection only ever refers to what's on screen.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => itemByKey.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [itemByKey])

  // ---- selection -------------------------------------------------------
  const clearSelection = useCallback(() => {
    setSelected((prev) => (prev.size ? new Set() : prev))
    anchorRef.current = null
  }, [])

  /** Leave select mode entirely (after a bulk action completes, Escape, or the ✕ button). */
  const exitSelectMode = useCallback(() => {
    clearSelection()
    setSelectMode(false)
  }, [clearSelection])

  function toggleKey(key: ItemKey) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    anchorRef.current = key
  }

  function rangeTo(key: ItemKey) {
    const anchor = anchorRef.current
    const a = anchor ? items.findIndex((i) => i.key === anchor) : -1
    const b = items.findIndex((i) => i.key === key)
    if (a < 0 || b < 0) return toggleKey(key)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    setSelected((prev) => {
      const next = new Set(prev)
      for (let i = lo; i <= hi; i++) next.add(items[i].key)
      return next
    })
  }

  const selectAll = useCallback(() => setSelected(new Set(items.map((i) => i.key))), [items])

  // ---- navigation ------------------------------------------------------
  const navigateTo = useCallback(
    (id: number | null) => {
      setQuery('')
      clearSelection()
      if (id == null) setSearchParams({})
      else setSearchParams({ folder: String(id) })
    },
    [setSearchParams, clearSelection],
  )

  const openItem = useCallback(
    (item: ExplorerItem) => {
      if (item.kind === 'folder') navigateTo(item.id)
      else nav(`/editor/${item.id}`)
    },
    [navigateTo, nav],
  )

  // ---- item event handlers --------------------------------------------
  function handleItemClick(e: MouseEvent, item: ExplorerItem) {
    e.stopPropagation()
    if (e.shiftKey && anchorRef.current) return rangeTo(item.key)
    if (e.metaKey || e.ctrlKey) return toggleKey(item.key)
    if (inSelectMode) return toggleKey(item.key)
    openItem(item)
  }

  function handleItemDoubleClick(e: MouseEvent, item: ExplorerItem) {
    e.preventDefault()
    // In select mode the two single clicks toggled twice (net zero); open as a convenience.
    if (inSelectMode) openItem(item)
  }

  function handleToggleSelect(e: MouseEvent, item: ExplorerItem) {
    e.stopPropagation()
    toggleKey(item.key)
  }

  /** Right-click / ⋯ act on the whole selection when the item is part of it, otherwise on just that item. */
  function keysForMenu(key: ItemKey): ItemKey[] {
    return selected.has(key) ? [...selected] : [key]
  }

  function handleContextMenu(e: MouseEvent, key: ItemKey) {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, keys: keysForMenu(key) })
  }

  function handleMore(e: MouseEvent, key: ItemKey) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.bottom + 4, keys: keysForMenu(key) })
  }

  function handleBackgroundContextMenu(e: MouseEvent) {
    if (searching) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, keys: [] })
  }

  // ---- keyboard --------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || menu) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (e.key === 'Escape') return exitSelectMode()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        return selectAll()
      }
      if (!selected.size) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        return setDialog({ type: 'delete', keys: [...selected] })
      }
      if (e.key === 'Enter' && selected.size === 1) {
        const item = itemByKey.get([...selected][0])
        if (item) {
          e.preventDefault()
          openItem(item)
        }
        return
      }
      if (e.key === 'F2' && selected.size === 1) return setDialog({ type: 'rename', key: [...selected][0] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, menu, selected, itemByKey, exitSelectMode, selectAll, openItem])

  // ---- drag & drop -----------------------------------------------------
  /** Dragging a selected item drags the whole selection; dragging anything else moves just that item. */
  function handleDragStart(e: DragEvent, key: ItemKey) {
    const keys = selected.has(key) ? [...selected] : [key]
    setDragKeys(keys)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', keys.join(','))
    const ghost = ghostRef.current
    if (ghost) {
      ghost.textContent = keys.length === 1 ? lookupItem(key)?.name ?? '1 item' : `${keys.length} items`
      e.dataTransfer.setDragImage(ghost, 16, 16)
    }
  }

  const handleDragEnd = useCallback(() => {
    setDragKeys(null)
    setDropTarget(undefined)
  }, [])

  const canDropOn = useCallback(
    (targetId: number | null) => {
      if (!dragKeys) return false
      const { folderIds } = splitKeys(dragKeys)
      if (isInvalidDropTarget(index, folderIds, targetId)) return false
      return !allAlreadyIn(index, dragKeys, targetId)
    },
    [dragKeys, index],
  )

  const getDropHandlers = useCallback(
    (targetId: number | null): DropHandlers => ({
      onDragOver: (e) => {
        if (!canDropOn(targetId)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropTarget((prev) => (prev === targetId ? prev : targetId))
      },
      onDragLeave: (e) => {
        const related = e.relatedTarget as Node | null
        if (related && e.currentTarget.contains(related)) return
        setDropTarget((prev) => (prev === targetId ? undefined : prev))
      },
      onDrop: (e) => {
        e.preventDefault()
        e.stopPropagation()
        const keys = dragKeys
        setDropTarget(undefined)
        setDragKeys(null)
        if (keys && canDropOn(targetId)) void moveKeysRef.current(keys, targetId).catch(() => {})
      },
    }),
    [canDropOn, dragKeys],
  )

  // ---- mutations (optimistic, revert on failure) -------------------------
  async function moveKeys(keys: ItemKey[], targetId: number | null) {
    const { cardIds, folderIds } = splitKeys(keys)
    if (isInvalidDropTarget(index, folderIds, targetId)) {
      toast("A folder can't be moved into itself.", 'error')
      return
    }
    if (allAlreadyIn(index, keys, targetId)) return
    const prevFolders = folders
    const prevCards = cards
    const cardSet = new Set(cardIds)
    const folderSet = new Set(folderIds)
    setFolders((fs) => fs.map((f) => (folderSet.has(f.id) ? { ...f, parent_id: targetId } : f)))
    setCards((cs) => cs.map((c) => (cardSet.has(c.id) ? { ...c, folder_id: targetId } : c)))
    exitSelectMode()
    try {
      await moveItems({ card_ids: cardIds, folder_ids: folderIds, target_folder_id: targetId }, await token())
      toast(`Moved ${describeSelection(index, keys)} to ${targetId == null ? ROOT_LABEL : index.byId.get(targetId)?.name ?? 'folder'}`)
    } catch {
      setFolders(prevFolders)
      setCards(prevCards)
      toast('Move failed. Please try again.', 'error')
      throw new Error('move_failed')
    }
  }
  moveKeysRef.current = moveKeys

  async function renameKey(key: ItemKey, name: string) {
    const { kind, id } = parseKey(key)
    const prevFolders = folders
    const prevCards = cards
    if (kind === 'folder') setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)))
    else setCards((cs) => cs.map((c) => (c.id === id ? { ...c, title: name } : c)))
    try {
      const t = await token()
      if (kind === 'folder') {
        const updated = await patchFolder(id, { name }, t)
        setFolders((fs) => fs.map((f) => (f.id === id ? updated : f)))
      } else {
        const updated = await patchCard(id, { title: name }, t)
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...updated } : c)))
      }
    } catch {
      setFolders(prevFolders)
      setCards(prevCards)
      toast('Rename failed. Please try again.', 'error')
      throw new Error('rename_failed')
    }
  }

  async function deleteKeys(keys: ItemKey[]) {
    const { cardIds, folderIds } = splitKeys(keys)
    // Folders nested inside another selected folder are removed by the parent's cascade.
    const topFolders = folderIds.filter((id) => !folderIds.some((other) => other !== id && descendantFolderIds(index, other).has(id)))
    const removedFolders = new Set(folderIds)
    for (const id of topFolders) for (const d of descendantFolderIds(index, id)) removedFolders.add(d)
    const cascadedCards = new Set<number>()
    for (const c of cards) if (c.folder_id != null && removedFolders.has(c.folder_id)) cascadedCards.add(c.id)
    const directCards = cardIds.filter((id) => !cascadedCards.has(id))
    const removedCards = new Set([...cascadedCards, ...directCards])

    const prevFolders = folders
    const prevCards = cards
    setFolders((fs) => fs.filter((f) => !removedFolders.has(f.id)))
    setCards((cs) => cs.filter((c) => !removedCards.has(c.id)))
    exitSelectMode()

    // If we deleted the folder we're standing in, climb to the nearest surviving ancestor.
    if (currentFolderId != null && removedFolders.has(currentFolderId)) {
      const survivor = [...path].reverse().find((f) => !removedFolders.has(f.id))
      navigateTo(survivor ? survivor.id : null)
    }

    try {
      const t = await token()
      const results = await Promise.allSettled([...topFolders.map((id) => deleteFolder(id, t)), ...directCards.map((id) => deleteCard(id, t))])
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) {
        toast(`${pluralize(failed, 'item')} could not be deleted.`, 'error')
        await load()
      } else {
        toast(`Deleted ${describeSelection(buildIndex(prevFolders, prevCards), keys)}`)
      }
    } catch {
      setFolders(prevFolders)
      setCards(prevCards)
      toast('Delete failed. Please try again.', 'error')
      throw new Error('delete_failed')
    }
  }

  async function createFolderHere(name: string) {
    try {
      const created = await createFolder({ name, parent_id: currentFolderId }, await token())
      setFolders((fs) => [...fs, created])
      toast(`Created folder “${created.name}”`)
    } catch {
      toast('Could not create the folder.', 'error')
      throw new Error('create_failed')
    }
  }

  async function createCardHere() {
    try {
      const created = await createCard({ title: 'Untitled Card', general: 'vydar', folder_id: currentFolderId }, await token())
      nav(`/editor/${created.id}`)
    } catch {
      toast('Could not create a card.', 'error')
    }
  }

  // ---- context menu contents ----------------------------------------------
  function menuItemsFor(keys: ItemKey[]): MenuItem[] {
    if (keys.length === 0) {
      return [
        { label: 'New card', icon: <PlusIcon className="w-4 h-4" />, onSelect: () => void createCardHere() },
        { label: 'New folder', icon: <FolderPlusIcon className="w-4 h-4" />, onSelect: () => setDialog({ type: 'newFolder' }) },
        { separator: true },
        { label: selectMode ? 'Exit select mode' : 'Select items', icon: <SelectIcon className="w-4 h-4" />, onSelect: () => (selectMode ? exitSelectMode() : setSelectMode(true)) },
      ]
    }
    if (keys.length === 1) {
      const item = lookupItem(keys[0])
      if (!item) return []
      const isSelected = selected.has(item.key)
      const selectable = itemByKey.has(item.key) // sidebar folders aren't part of the listing
      return [
        { label: item.kind === 'folder' ? 'Open folder' : 'Open in editor', icon: <OpenIcon className="w-4 h-4" />, onSelect: () => openItem(item) },
        ...(selectable ? [{ label: isSelected ? 'Deselect' : 'Select', icon: <CheckIcon className="w-4 h-4" />, onSelect: () => toggleKey(item.key) } as MenuItem] : []),
        { separator: true },
        { label: 'Rename', icon: <PencilIcon className="w-4 h-4" />, onSelect: () => setDialog({ type: 'rename', key: item.key }), shortcut: 'F2' },
        { label: 'Move to…', icon: <MoveIcon className="w-4 h-4" />, onSelect: () => setDialog({ type: 'move', keys: [item.key] }) },
        { separator: true },
        { label: 'Delete', icon: <TrashIcon className="w-4 h-4" />, danger: true, onSelect: () => setDialog({ type: 'delete', keys: [item.key] }), shortcut: '⌫' },
      ]
    }
    return [
      { label: `Move ${keys.length} items to…`, icon: <MoveIcon className="w-4 h-4" />, onSelect: () => setDialog({ type: 'move', keys }) },
      { label: 'Clear selection', icon: <XIcon className="w-4 h-4" />, onSelect: exitSelectMode, shortcut: 'Esc' },
      { separator: true },
      { label: `Delete ${keys.length} items`, icon: <TrashIcon className="w-4 h-4" />, danger: true, onSelect: () => setDialog({ type: 'delete', keys }), shortcut: '⌫' },
    ]
  }

  function deleteMessage(keys: ItemKey[]) {
    const { folderIds } = splitKeys(keys)
    let nestedFolders = 0
    let nestedCards = 0
    for (const id of folderIds) {
      const counts = subtreeCounts(index, id)
      nestedFolders += counts.folders
      nestedCards += counts.cards
    }
    const inside: string[] = []
    if (nestedFolders) inside.push(pluralize(nestedFolders, 'nested folder'))
    if (nestedCards) inside.push(pluralize(nestedCards, 'card'))
    return (
      <>
        <p>
          Permanently delete {describeSelection(index, keys)}
          {folderIds.length ? ' and everything inside' : ''}?
        </p>
        {inside.length > 0 && <p className="mt-2 text-red-600 font-medium">This includes {inside.join(' and ')}.</p>}
        <p className="mt-2 text-slate-500">This can't be undone.</p>
      </>
    )
  }

  // ---- render helpers -------------------------------------------------------
  function interactionFor(item: ExplorerItem) {
    return {
      selected: selected.has(item.key),
      dragging: !!dragKeys?.includes(item.key),
      menuOpen: menuKeys.has(item.key),
      showCheckbox: inSelectMode,
      showMore: inSelectMode || coarsePointer,
      isDropTarget: item.kind === 'folder' && dropTarget === item.id,
      drop: item.kind === 'folder' ? getDropHandlers(item.id) : undefined,
      onClick: (e: MouseEvent) => handleItemClick(e, item),
      onDoubleClick: (e: MouseEvent) => handleItemDoubleClick(e, item),
      onContextMenu: (e: MouseEvent) => handleContextMenu(e, item.key),
      onToggleSelect: (e: MouseEvent) => handleToggleSelect(e, item),
      onMore: (e: MouseEvent) => handleMore(e, item.key),
      onDragStart: (e: DragEvent) => handleDragStart(e, item.key),
      onDragEnd: handleDragEnd,
    }
  }

  function folderCaption(item: Extract<ExplorerItem, { kind: 'folder' }>) {
    if (searching) return `in ${describePath(index, item.parentId, ROOT_LABEL)}`
    return describeContents(directCounts(index, item.id))
  }

  function toggleSort(field: SortField) {
    if (sortField === field) updatePrefs({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
    else updatePrefs({ sortField: field, sortDir: field === 'name' ? 'asc' : 'desc' })
  }

  const allSelected = items.length > 0 && selected.size === items.length
  const someSelected = selected.size > 0 && !allSelected
  const showSelectionBar = selected.size > 0

  const sidebar = (
    <FolderTreeView
      index={index}
      expanded={expanded}
      onToggle={(id) => setExpandedList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
      currentId={searching ? -1 : currentFolderId}
      onSelect={navigateTo}
      rootLabel={ROOT_LABEL}
      dropTargetId={dropTarget}
      getDropHandlers={getDropHandlers}
      onItemContextMenu={(e, id) => handleContextMenu(e, keyOf('folder', id))}
      onItemDragStart={(e, id) => handleDragStart(e, keyOf('folder', id))}
      onItemDragEnd={handleDragEnd}
    />
  )

  const toggleButtonClass = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`

  return (
    <div className="flex gap-6 items-start">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col w-60 xl:w-64 flex-shrink-0 sticky top-24 max-h-[calc(100vh-7.5rem)]">
        <button type="button" className="btn-primary text-sm inline-flex items-center justify-center gap-2 w-full" onClick={() => void createCardHere()}>
          <PlusIcon className="w-4 h-4" />
          New card
        </button>
        <button type="button" className="btn-secondary text-sm inline-flex items-center justify-center gap-2 w-full mt-2" onClick={() => setDialog({ type: 'newFolder' })}>
          <FolderPlusIcon className="w-4 h-4" />
          New folder
        </button>
        <div className="mt-4 -mx-2 px-2 overflow-y-auto min-h-0">{sidebar}</div>
      </aside>

      {/* Main pane */}
      <section className="flex-1 min-w-0">
        {/* Toolbar. The selection bar overlays it in place so the content below never shifts. */}
        <div className={`relative mb-4 rounded-xl border shadow-lg shadow-slate-200/50 transition-colors duration-200 ${showSelectionBar ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-100'}`}>
          <div className={`p-2.5 sm:p-3 flex flex-wrap items-center gap-2 ${showSelectionBar ? 'invisible' : ''}`} aria-hidden={showSelectionBar || undefined}>
            <div className="flex-1 min-w-[10rem] flex items-center">
              {searching ? (
                <div className="text-sm text-slate-600 px-2 py-1">
                  Results for <span className="font-semibold text-slate-900">“{query.trim()}”</span>
                  <span className="text-slate-400"> · {pluralize(items.length, 'match', 'matches')}</span>
                </div>
              ) : (
                <Breadcrumbs path={path} onNavigate={navigateTo} rootLabel={ROOT_LABEL} dropTargetId={dropTarget} getDropHandlers={getDropHandlers} />
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label className="relative block">
                <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setQuery('')
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                  placeholder="Search cards & folders"
                  aria-label="Search cards and folders"
                  className="block w-40 sm:w-56 focus:w-56 sm:focus:w-72 py-1.5 pl-8 pr-8 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
                {query && (
                  <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => setQuery('')}>
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </label>
              <div className="hidden sm:flex items-center gap-1">
                <select
                  aria-label="Sort by"
                  className="py-1.5 pl-3 pr-8 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={sortField}
                  onChange={(e) => {
                    const field = e.target.value as SortField
                    updatePrefs({ sortField: field, sortDir: field === 'name' ? 'asc' : 'desc' })
                  }}
                >
                  <option value="updated">Last modified</option>
                  <option value="name">Name</option>
                </select>
                <button
                  type="button"
                  className="btn-icon !p-1.5"
                  aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                  onClick={() => updatePrefs({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
                >
                  {sortDir === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                </button>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white shadow-sm p-0.5" role="radiogroup" aria-label="View mode">
                <button type="button" role="radio" aria-checked={view === 'grid'} title="Grid view" className={toggleButtonClass(view === 'grid')} onClick={() => updatePrefs({ view: 'grid' })}>
                  <GridIcon className="w-4 h-4" />
                </button>
                <button type="button" role="radio" aria-checked={view === 'list'} title="List view" className={toggleButtonClass(view === 'list')} onClick={() => updatePrefs({ view: 'list' })}>
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              {previewQueue.length > 0 && (
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap" title="Rendering previews for cards that don't have one yet">
                  <span className="spinner !w-3 !h-3 !border-2" />
                  {pluralize(previewQueue.length, 'preview')} to render
                </span>
              )}
              <div className="inline-flex rounded-lg border border-slate-200 bg-white shadow-sm p-0.5" role="radiogroup" aria-label="Card artwork">
                <button
                  type="button"
                  role="radio"
                  aria-checked={cardPreview === 'emblem'}
                  title="Show general crests"
                  className={toggleButtonClass(cardPreview === 'emblem')}
                  onClick={() => updatePrefs({ cardPreview: 'emblem' })}
                >
                  <CrestIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={cardPreview === 'render'}
                  title="Show rendered card previews"
                  className={toggleButtonClass(cardPreview === 'render')}
                  onClick={() => updatePrefs({ cardPreview: 'render' })}
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                aria-pressed={selectMode}
                title={selectMode ? 'Exit select mode' : 'Select items'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium shadow-sm transition-all duration-200 active:scale-95 ${
                  selectMode ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              >
                <SelectIcon className="w-4 h-4" />
                <span className="hidden md:inline">Select</span>
              </button>
              <div className="flex lg:hidden items-center gap-1">
                <button type="button" className="btn-icon !p-1.5" title="New folder" aria-label="New folder" onClick={() => setDialog({ type: 'newFolder' })}>
                  <FolderPlusIcon className="w-4 h-4" />
                </button>
                <button type="button" className="btn-primary !px-2.5 !py-1.5 text-sm inline-flex items-center gap-1" onClick={() => void createCardHere()}>
                  <PlusIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
            </div>
          </div>

          {showSelectionBar && (
            <div className="absolute inset-0 flex items-center gap-2 px-3 text-white animate-fade-in">
              <button type="button" aria-label="Clear selection" className="p-1 rounded-md hover:bg-white/15" onClick={exitSelectMode}>
                <XIcon className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium whitespace-nowrap">{pluralize(selected.size, 'item')} selected</span>
              <div className="flex-1" />
              {!allSelected && (
                <button type="button" className="hidden sm:inline text-sm px-2 py-1 rounded-md hover:bg-white/15" onClick={selectAll}>
                  Select all
                </button>
              )}
              {selected.size === 1 && (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md hover:bg-white/15"
                    onClick={() => {
                      const item = itemByKey.get(selectedKeys[0])
                      if (item) openItem(item)
                    }}
                  >
                    <OpenIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Open</span>
                  </button>
                  <button type="button" className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md hover:bg-white/15" onClick={() => setDialog({ type: 'rename', key: selectedKeys[0] })}>
                    <PencilIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Rename</span>
                  </button>
                </>
              )}
              <button type="button" className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md hover:bg-white/15" onClick={() => setDialog({ type: 'move', keys: selectedKeys })}>
                <MoveIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Move to…</span>
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md bg-white/10 hover:bg-red-500" onClick={() => setDialog({ type: 'delete', keys: selectedKeys })}>
                <TrashIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}
        </div>

        {selectMode && selected.size === 0 && (
          <p className="-mt-2 mb-3 text-xs text-slate-500 px-1 animate-fade-in">Select mode: click items to select them. Press Esc or the Select button to leave.</p>
        )}

        {/* Content */}
        <div className="min-h-[50vh]" onClick={clearSelection} onContextMenu={handleBackgroundContextMenu}>
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="spinner mb-4" />
                <p className="text-slate-500">Loading your cards...</p>
              </div>
            </div>
          ) : error ? (
            <div className="card p-8 text-center">
              <p className="text-slate-700 mb-4">{error}</p>
              <button type="button" className="btn-primary text-sm" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              searching={searching}
              query={query}
              inFolder={currentFolderId != null}
              onNewCard={() => void createCardHere()}
              onNewFolder={() => setDialog({ type: 'newFolder' })}
              onClearSearch={() => setQuery('')}
            />
          ) : view === 'grid' ? (
            <div className="space-y-6">
              {folderItems.length > 0 && (
                <div>
                  <SectionLabel>Folders</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3" role="listbox" aria-multiselectable aria-label="Folders">
                    {folderItems.map((item) => (
                      <FolderTile key={item.key} item={item} caption={folderCaption(item)} {...interactionFor(item)} />
                    ))}
                  </div>
                </div>
              )}
              {cardItems.length > 0 && (
                <div>
                  <SectionLabel>Cards</SectionLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4" role="listbox" aria-multiselectable aria-label="Cards">
                    {cardItems.map((item) => (
                      <CardTile
                        key={item.key}
                        item={item}
                        preview={cardPreview}
                        loadThumbnail={thumbnailLoader}
                        subtitle={searching ? `in ${describePath(index, item.parentId, ROOT_LABEL)}` : undefined}
                        {...interactionFor(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden" role="listbox" aria-multiselectable aria-label="Cards and folders">
              <ListHeader sortField={sortField} sortDir={sortDir} onSort={toggleSort} allSelected={allSelected} someSelected={someSelected} onToggleAll={() => (allSelected ? clearSelection() : selectAll())} disabled={items.length === 0} />
              {items.map((item) => (
                <ListRow
                  key={item.key}
                  item={item}
                  preview={cardPreview}
                  loadThumbnail={thumbnailLoader}
                  caption={item.kind === 'folder' ? folderCaption(item) : undefined}
                  pathLabel={searching ? `in ${describePath(index, item.parentId, ROOT_LABEL)}` : undefined}
                  {...interactionFor(item)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Off-screen renderer that fills in missing previews while in preview mode */}
      {previewQueue.length > 0 && <ThumbnailBackfill queue={previewQueue} getToken={token} onRendered={onPreviewRendered} />}

      {/* Drag preview badge (positioned off-screen; the browser snapshots it for the cursor) */}
      <div ref={ghostRef} aria-hidden className="fixed -top-96 left-0 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium shadow-xl whitespace-nowrap max-w-xs truncate pointer-events-none" />

      {/* Overlays */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.keys)} onClose={closeMenu} />}
      {dialog?.type === 'newFolder' && (
        <NameDialog
          title="New folder"
          label={currentFolderId == null ? `Folder name (in ${ROOT_LABEL})` : `Folder name (in ${index.byId.get(currentFolderId)?.name ?? 'this folder'})`}
          placeholder="Untitled folder"
          submitLabel="Create"
          onSubmit={createFolderHere}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'rename' && (
        <NameDialog
          title={parseKey(dialog.key).kind === 'folder' ? 'Rename folder' : 'Rename card'}
          label="Name"
          initial={lookupItem(dialog.key)?.name ?? ''}
          submitLabel="Rename"
          onSubmit={(name) => renameKey(dialog.key, name)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'move' && <MoveDialog index={index} keys={dialog.keys} rootLabel={ROOT_LABEL} onMove={(target) => moveKeys(dialog.keys, target)} onClose={closeDialog} />}
      {dialog?.type === 'delete' && (
        <ConfirmDialog title={`Delete ${describeSelection(index, dialog.keys)}?`} message={deleteMessage(dialog.keys)} confirmLabel="Delete" onConfirm={() => deleteKeys(dialog.keys)} onClose={closeDialog} />
      )}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-0.5">{children}</h2>
}

function EmptyState({
  searching,
  query,
  inFolder,
  onNewCard,
  onNewFolder,
  onClearSearch,
}: {
  searching: boolean
  query: string
  inFolder: boolean
  onNewCard: () => void
  onNewFolder: () => void
  onClearSearch: () => void
}) {
  if (searching) {
    return (
      <div className="text-center py-20 animate-in">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
          <SearchIcon className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">No matches</h3>
        <p className="text-slate-500 mb-6">Nothing is named “{query.trim()}”.</p>
        <button type="button" className="btn-secondary text-sm" onClick={onClearSearch}>
          Clear search
        </button>
      </div>
    )
  }
  return (
    <div className="text-center py-20 animate-in">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">{inFolder ? 'This folder is empty' : 'No cards yet'}</h3>
      <p className="text-slate-500 mb-6">{inFolder ? 'Create a card or folder here, or move items in with “Move to…”.' : 'Create your first Heroscape card to get started'}</p>
      <div className="flex items-center justify-center gap-2">
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={onNewCard}>
          <PlusIcon className="w-4 h-4" />
          New card
        </button>
        <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={onNewFolder}>
          <FolderPlusIcon className="w-4 h-4" />
          New folder
        </button>
      </div>
    </div>
  )
}

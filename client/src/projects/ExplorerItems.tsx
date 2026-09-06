import { DragEvent, MouseEvent, useEffect, useRef, useState } from 'react'
import { ServerCard, ServerFolder } from '../lib/api'
import { CardPreviewMode, ExplorerItem, SortDir, SortField, cardGradient, formatUpdated, generalLabel } from './explorerModel'
import { DropHandlers } from './FolderTree'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronRightIcon, Emblem, FolderIcon, HomeIcon, MoreIcon } from './icons'
import { useInView, useThumbnailUrl } from './thumbnails'

export type ThumbnailLoader = (card: ServerCard) => Promise<string | null>

/** Everything a tile or row needs to take part in selection, opening, menus and drag & drop. */
export type ItemInteraction = {
  selected: boolean
  dragging: boolean
  /** A context menu is open for this item (subtle highlight, no selection change). */
  menuOpen: boolean
  /** Force the checkbox visible (select mode). Otherwise it appears on hover. */
  showCheckbox: boolean
  /** Force the ⋯ button visible (select mode, or touch devices where there is no hover). */
  showMore: boolean
  /** Folders only: a drag is hovering over this item. */
  isDropTarget?: boolean
  /** Folders only: drop handlers so cards can be dragged onto them. */
  drop?: DropHandlers
  onClick: (e: MouseEvent) => void
  onDoubleClick: (e: MouseEvent) => void
  onContextMenu: (e: MouseEvent) => void
  onToggleSelect: (e: MouseEvent) => void
  onMore: (e: MouseEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: (e: DragEvent) => void
}

function surfaceClass({ selected, dragging, isDropTarget, menuOpen }: ItemInteraction, extra = '') {
  const base = `group relative bg-white rounded-xl border transition-all duration-200 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${extra}`
  if (isDropTarget) return `${base} border-blue-400 ring-2 ring-blue-400 bg-blue-50 shadow-lg shadow-blue-200/60 scale-[1.02]`
  if (selected) return `${base} border-blue-500 ring-2 ring-blue-500 bg-blue-50/60 shadow-md shadow-blue-200/50`
  const rest = menuOpen
    ? `${base} border-slate-300 ring-2 ring-slate-300 shadow-md`
    : `${base} border-slate-200 shadow-sm hover:shadow-lg hover:shadow-slate-200/70 hover:border-slate-300 hover:-translate-y-0.5`
  return dragging ? `${rest} opacity-40` : rest
}

function interactionProps(ix: ItemInteraction) {
  return {
    onClick: ix.onClick,
    onDoubleClick: ix.onDoubleClick,
    onContextMenu: ix.onContextMenu,
    onDragStart: ix.onDragStart,
    onDragEnd: ix.onDragEnd,
    draggable: true,
    tabIndex: 0,
    ...(ix.drop || {}),
  }
}

export function SelectCheckbox({ checked, visible, onClick, label, className = '' }: { checked: boolean; visible: boolean; onClick: (e: MouseEvent) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`w-5 h-5 rounded-md border-2 grid place-items-center transition-all duration-150 ${
        checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/90 border-slate-300 text-transparent hover:border-blue-500'
      } ${checked || visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} ${className}`}
    >
      <CheckIcon className="w-3.5 h-3.5" />
    </button>
  )
}

export function MoreButton({ onClick, visible, className = '' }: { onClick: (e: MouseEvent) => void; visible: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label="More actions"
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`w-7 h-7 rounded-lg grid place-items-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-all ${
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      } ${className}`}
    >
      <MoreIcon className="w-4 h-4" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card artwork: rendered thumbnail, or the general's crest on a tinted cover
// ---------------------------------------------------------------------------

/**
 * Cover art for a card tile or row. In "render" mode it lazily fetches the card's uploaded
 * thumbnail once on screen and falls back to the crest until one exists.
 */
export function CardArt({
  card,
  preview,
  loadThumbnail,
  className = '',
  emblemClassName = 'w-[42%] h-[42%]',
  showMissingHint = false,
}: {
  card: ServerCard
  preview: CardPreviewMode
  loadThumbnail?: ThumbnailLoader
  className?: string
  emblemClassName?: string
  showMissingHint?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const wantsRender = preview === 'render'
  const inView = useInView(ref, wantsRender)
  const url = useThumbnailUrl(card, wantsRender, loadThumbnail, inView)
  const [from, to] = cardGradient(card)
  const isCustom = card.general === 'custom'
  const initial = (card.title || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}>
      {url ? (
        <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover bg-white animate-fade-in" />
      ) : (
        <>
          <div className="absolute inset-0 opacity-25" style={{ background: 'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,0.9), transparent 60%)' }} />
          <div className="absolute inset-0 grid place-items-center text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105">
            {isCustom ? (
              <span className="font-bold leading-none select-none" style={{ fontSize: 'min(40cqw, 40cqh)' }}>
                {initial}
              </span>
            ) : (
              <Emblem general={card.general} className={emblemClassName} />
            )}
          </div>
          {wantsRender && showMissingHint && (
            <span className="absolute bottom-1.5 right-1.5 text-[10px] leading-none px-1.5 py-1 rounded-md bg-black/35 text-white/90 backdrop-blur-sm">No preview yet</span>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid tiles
// ---------------------------------------------------------------------------

export function FolderTile({ item, caption, ...ix }: { item: Extract<ExplorerItem, { kind: 'folder' }>; caption: string } & ItemInteraction) {
  return (
    <div className={surfaceClass(ix, 'flex items-center gap-3 px-3 py-2.5 min-h-[3.75rem]')} {...interactionProps(ix)} aria-selected={ix.selected} role="option">
      <div className="relative flex-shrink-0">
        <FolderIcon className={`w-8 h-8 transition-colors ${ix.selected || ix.isDropTarget ? 'text-blue-500' : 'text-amber-400 group-hover:text-amber-500'}`} />
        <SelectCheckbox
          checked={ix.selected}
          visible={ix.showCheckbox}
          onClick={ix.onToggleSelect}
          label={`Select ${item.name}`}
          className="absolute -left-1.5 -top-1.5 shadow-sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 truncate leading-tight">{item.name}</div>
        <div className="text-xs text-slate-500 truncate mt-0.5">{caption}</div>
      </div>
      <MoreButton onClick={ix.onMore} visible={ix.showMore} />
    </div>
  )
}

export function CardTile({
  item,
  subtitle,
  preview,
  loadThumbnail,
  ...ix
}: { item: Extract<ExplorerItem, { kind: 'card' }>; subtitle?: string; preview: CardPreviewMode; loadThumbnail?: ThumbnailLoader } & ItemInteraction) {
  const [from] = cardGradient(item.card)
  return (
    <div className={surfaceClass(ix, 'flex flex-col overflow-hidden')} {...interactionProps(ix)} aria-selected={ix.selected} role="option">
      <div className="relative">
        <CardArt
          card={item.card}
          preview={preview}
          loadThumbnail={loadThumbnail}
          showMissingHint
          className={`rounded-t-[11px] [container-type:size] ${preview === 'render' ? 'aspect-square' : 'aspect-[5/3]'}`}
        />
        <div className="absolute left-2.5 top-2.5">
          <SelectCheckbox checked={ix.selected} visible={ix.showCheckbox} onClick={ix.onToggleSelect} label={`Select ${item.name}`} className="shadow-md" />
        </div>
        <div className="absolute right-2 top-2">
          <MoreButton onClick={ix.onMore} visible={ix.showMore} className="bg-white/85 hover:bg-white text-slate-700 shadow-md" />
        </div>
      </div>
      <div className="px-3.5 py-3 flex-1">
        <div className="font-semibold text-slate-900 truncate leading-snug group-hover:text-blue-700 transition-colors">{item.name}</div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: from }} />
          <span className="truncate">{subtitle ?? `${generalLabel(item.card.general)} · ${formatUpdated(item.updatedAt)}`}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

const LIST_COLS = 'grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] md:grid-cols-[2rem_minmax(0,1fr)_7.5rem_10rem_2.5rem] items-center gap-x-3'

export function ListHeader({
  sortField,
  sortDir,
  onSort,
  allSelected,
  someSelected,
  onToggleAll,
  disabled,
}: {
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
  disabled: boolean
}) {
  const SortLabel = ({ field, children, className = '' }: { field: SortField; children: string; className?: string }) => {
    const active = sortField === field
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'} ${className}`}
      >
        {children}
        {active && (sortDir === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />)}
      </button>
    )
  }
  return (
    <div className={`${LIST_COLS} px-3 py-2 border-b border-slate-200 bg-slate-50/80 rounded-t-xl`} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
        aria-label="Select all"
        disabled={disabled}
        onClick={onToggleAll}
        className={`w-5 h-5 rounded-md border-2 grid place-items-center transition-colors disabled:opacity-40 ${
          allSelected || someSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-transparent hover:border-blue-500'
        }`}
      >
        {allSelected ? <CheckIcon className="w-3.5 h-3.5" /> : someSelected ? <span className="block w-2.5 h-0.5 bg-white rounded" /> : null}
      </button>
      <SortLabel field="name">Name</SortLabel>
      <span className="hidden md:block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
      <SortLabel field="updated" className="hidden md:inline-flex">Modified</SortLabel>
      <span />
    </div>
  )
}

export function ListRow({
  item,
  caption,
  pathLabel,
  preview,
  loadThumbnail,
  ...ix
}: { item: ExplorerItem; caption?: string; pathLabel?: string; preview: CardPreviewMode; loadThumbnail?: ThumbnailLoader } & ItemInteraction) {
  const isFolder = item.kind === 'folder'
  const rowTone = ix.isDropTarget
    ? 'bg-blue-100 ring-2 ring-inset ring-blue-400'
    : ix.selected
      ? 'bg-blue-50'
      : ix.menuOpen
        ? 'bg-slate-100'
        : 'hover:bg-slate-50'
  return (
    <div
      className={`${LIST_COLS} group px-3 py-2 border-b border-slate-100 last:border-b-0 transition-colors select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${rowTone} ${ix.dragging ? 'opacity-40' : ''}`}
      {...interactionProps(ix)}
      aria-selected={ix.selected}
      role="option"
    >
      <SelectCheckbox checked={ix.selected} visible={ix.showCheckbox} onClick={ix.onToggleSelect} label={`Select ${item.name}`} />
      <div className="flex items-center gap-3 min-w-0">
        {isFolder ? (
          <FolderIcon className={`w-7 h-7 flex-shrink-0 ${ix.selected || ix.isDropTarget ? 'text-blue-500' : 'text-amber-400'}`} />
        ) : (
          <CardArt card={item.card} preview={preview} loadThumbnail={loadThumbnail} className="w-7 h-7 rounded-md flex-shrink-0 [container-type:size]" emblemClassName="w-4 h-4" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
          {pathLabel ? (
            <div className="truncate text-xs text-slate-500">{pathLabel}</div>
          ) : (
            <div className="truncate text-xs text-slate-500 md:hidden">
              {isFolder ? caption : `${generalLabel(item.card.general)} · ${formatUpdated(item.updatedAt)}`}
            </div>
          )}
        </div>
      </div>
      <div className="hidden md:block text-sm text-slate-600 truncate">{isFolder ? caption || 'Folder' : generalLabel(item.card.general)}</div>
      <div className="hidden md:block text-sm text-slate-600 truncate">{formatUpdated(item.updatedAt)}</div>
      <MoreButton onClick={ix.onMore} visible={ix.showMore} className="justify-self-end" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export function Breadcrumbs({
  path,
  onNavigate,
  rootLabel = 'My Cards',
  dropTargetId,
  getDropHandlers,
}: {
  path: ServerFolder[]
  onNavigate: (id: number | null) => void
  rootLabel?: string
  dropTargetId?: number | null
  getDropHandlers?: (id: number | null) => DropHandlers
}) {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const collapse = path.length > 3
  const hidden = collapse ? path.slice(0, path.length - 2) : []
  const visible = collapse ? path.slice(path.length - 2) : path

  useEffect(() => {
    if (!overflowOpen) return
    const close = (e: Event) => {
      if (overflowRef.current && e.target instanceof Node && overflowRef.current.contains(e.target)) return
      setOverflowOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [overflowOpen])

  const crumbClass = (active: boolean, drop: boolean) =>
    `inline-flex items-center gap-1.5 max-w-[14rem] px-2 py-1 rounded-lg text-sm transition-colors truncate ${
      drop ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-400' : active ? 'text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`

  return (
    <nav aria-label="Breadcrumb" className="flex items-center min-w-0 flex-wrap gap-y-1">
      <button type="button" className={crumbClass(path.length === 0, dropTargetId === null)} onClick={() => onNavigate(null)} {...getDropHandlers?.(null)}>
        <HomeIcon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{rootLabel}</span>
      </button>
      {hidden.length > 0 && (
        <>
          <ChevronRightIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="relative" ref={overflowRef}>
            <button type="button" className={crumbClass(false, false)} aria-haspopup="menu" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((v) => !v)}>
              …
            </button>
            {overflowOpen && (
              <div role="menu" className="absolute left-0 top-full mt-1 z-20 min-w-[12rem] bg-white rounded-xl shadow-xl border border-slate-200 py-1 animate-fade-in">
                {hidden.map((folder, i) => (
                  <button
                    key={folder.id}
                    role="menuitem"
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 text-left"
                    style={{ paddingLeft: 12 + i * 10 }}
                    onClick={() => {
                      setOverflowOpen(false)
                      onNavigate(folder.id)
                    }}
                  >
                    <FolderIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {visible.map((folder, i) => {
        const last = i === visible.length - 1
        return (
          <span key={folder.id} className="inline-flex items-center min-w-0">
            <ChevronRightIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <button
              type="button"
              className={crumbClass(last, dropTargetId === folder.id)}
              onClick={() => onNavigate(folder.id)}
              aria-current={last ? 'page' : undefined}
              {...(last ? {} : getDropHandlers?.(folder.id))}
            >
              <span className="truncate">{folder.name}</span>
            </button>
          </span>
        )
      })}
    </nav>
  )
}

import { DragEvent, MouseEvent } from 'react'
import { ServerFolder } from '../lib/api'
import { FolderIndex } from './explorerModel'
import { ChevronRightIcon, FolderIcon, FolderOpenIcon, HomeIcon } from './icons'

export type DropHandlers = {
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export type FolderTreeViewProps = {
  index: FolderIndex
  expanded: Set<number>
  onToggle: (id: number) => void
  /** Highlighted folder (null = root). */
  currentId: number | null
  onSelect: (id: number | null) => void
  rootLabel?: string
  /** Folders that can't be chosen (e.g. the folder being moved and its descendants). */
  disabledIds?: Set<number>
  /** Folder currently hovered by a drag (undefined = none, null = root). */
  dropTargetId?: number | null
  getDropHandlers?: (id: number | null) => DropHandlers
  onItemContextMenu?: (e: MouseEvent, id: number) => void
  onItemDragStart?: (e: DragEvent, id: number) => void
  onItemDragEnd?: (e: DragEvent) => void
  /** Tighter rows for use inside dialogs. */
  compact?: boolean
}

/**
 * Recursive folder tree. Used for the sidebar (navigation + drop targets) and inside the
 * move dialog (destination picker with disabled nodes).
 */
export function FolderTreeView(props: FolderTreeViewProps) {
  const { index, currentId, onSelect, rootLabel = 'My Cards', dropTargetId, getDropHandlers, compact } = props
  const rootActive = currentId === null
  const rootDrop = dropTargetId === null
  const rootHandlers = getDropHandlers?.(null)
  const roots = index.childrenOf.get(null) || []

  return (
    <div className="select-none text-sm" role="tree">
      <button
        type="button"
        role="treeitem"
        aria-selected={rootActive}
        className={rowClass({ active: rootActive, drop: rootDrop, compact })}
        style={{ paddingLeft: compact ? 8 : 10 }}
        onClick={() => onSelect(null)}
        {...rootHandlers}
      >
        <span className="w-5 flex-shrink-0" />
        <HomeIcon className={`w-4 h-4 flex-shrink-0 ${rootActive ? 'text-blue-600' : 'text-slate-500'}`} />
        <span className="truncate font-medium">{rootLabel}</span>
      </button>
      {roots.length > 0 && (
        <div role="group">
          {roots.map((folder) => (
            <TreeNode key={folder.id} folder={folder} depth={1} {...props} />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeNode({ folder, depth, ...props }: FolderTreeViewProps & { folder: ServerFolder; depth: number }) {
  const { index, expanded, onToggle, currentId, onSelect, disabledIds, dropTargetId, getDropHandlers, onItemContextMenu, onItemDragStart, onItemDragEnd, compact } = props
  const children = index.childrenOf.get(folder.id) || []
  const hasChildren = children.length > 0
  const isOpen = expanded.has(folder.id)
  const active = currentId === folder.id
  const disabled = disabledIds?.has(folder.id) ?? false
  const drop = dropTargetId === folder.id
  const dropHandlers = !disabled ? getDropHandlers?.(folder.id) : undefined
  const indent = (compact ? 8 : 10) + depth * (compact ? 14 : 16)

  return (
    <div role="none">
      <div
        role="treeitem"
        aria-selected={active}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={rowClass({ active, drop, disabled, compact })}
        style={{ paddingLeft: indent }}
        draggable={!!onItemDragStart && !disabled}
        onClick={() => !disabled && onSelect(folder.id)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(folder.id)
          } else if (e.key === 'ArrowRight' && hasChildren && !isOpen) {
            onToggle(folder.id)
          } else if (e.key === 'ArrowLeft' && isOpen) {
            onToggle(folder.id)
          }
        }}
        onContextMenu={onItemContextMenu ? (e) => onItemContextMenu(e, folder.id) : undefined}
        onDragStart={onItemDragStart ? (e) => onItemDragStart(e, folder.id) : undefined}
        onDragEnd={onItemDragEnd}
        {...dropHandlers}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          className={`w-5 h-5 flex-shrink-0 grid place-items-center rounded transition-colors ${hasChildren ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70' : 'invisible'}`}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(folder.id)
          }}
        >
          <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        {active || drop ? (
          <FolderOpenIcon className={`w-4 h-4 flex-shrink-0 ${disabled ? 'text-slate-300' : 'text-blue-500'}`} />
        ) : (
          <FolderIcon className={`w-4 h-4 flex-shrink-0 ${disabled ? 'text-slate-300' : 'text-amber-400'}`} />
        )}
        <span className="truncate">{folder.name}</span>
      </div>
      {hasChildren && isOpen && (
        <div role="group">
          {children.map((child) => (
            <TreeNode key={child.id} folder={child} depth={depth + 1} {...props} />
          ))}
        </div>
      )}
    </div>
  )
}

function rowClass({ active, drop, disabled, compact }: { active?: boolean; drop?: boolean; disabled?: boolean; compact?: boolean }) {
  const base = `w-full flex items-center gap-1.5 pr-2 rounded-lg text-left outline-none transition-colors ${compact ? 'py-1' : 'py-1.5'} focus-visible:ring-2 focus-visible:ring-blue-400`
  if (drop) return `${base} bg-blue-100 text-blue-900 ring-2 ring-blue-400 ring-inset`
  if (disabled) return `${base} text-slate-400 cursor-not-allowed`
  if (active) return `${base} bg-blue-50 text-blue-800 font-medium`
  return `${base} text-slate-700 hover:bg-slate-100 cursor-pointer`
}

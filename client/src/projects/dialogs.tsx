import { FormEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FolderIndex, ItemKey, allAlreadyIn, describePath, describeSelection, descendantFolderIds, parseKey, splitKeys } from './explorerModel'
import { FolderTreeView } from './FolderTree'
import { Toast } from './hooks'
import { XIcon } from './icons'

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-md',
}: {
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const titleId = useRef(`dlg-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`w-full ${width} bg-white rounded-2xl shadow-2xl border border-slate-200 animate-in overflow-hidden`}>
        <div className="px-5 pt-5 pb-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 leading-tight">
            {title}
          </h2>
          {description && <div className="text-sm text-slate-500 mt-1">{description}</div>}
        </div>
        <div className="px-5 pb-4">{children}</div>
        {footer && <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Name prompt (new folder, rename)
// ---------------------------------------------------------------------------

export function NameDialog({
  title,
  label,
  initial = '',
  placeholder,
  submitLabel = 'Save',
  onSubmit,
  onClose,
}: {
  title: string
  label: string
  initial?: string
  placeholder?: string
  submitLabel?: string
  onSubmit: (name: string) => void | Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const formId = useRef(`name-form-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const trimmed = value.trim()
  const valid = trimmed.length > 0 && trimmed.length <= 100 && trimmed !== initial.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100" disabled={!valid || busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
        <input ref={inputRef} className="input-modern" value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} placeholder={placeholder} autoComplete="off" spellCheck={false} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Confirm (delete)
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={buttonRef}
            type="button"
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-md transition-all duration-200 active:scale-95 disabled:opacity-60 ${
              danger ? 'bg-red-600 hover:bg-red-700 shadow-red-500/25' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
            }`}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } catch {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600 leading-relaxed">{message}</div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Move picker
// ---------------------------------------------------------------------------

export function MoveDialog({
  index,
  keys,
  onMove,
  onClose,
  rootLabel = 'My Cards',
}: {
  index: FolderIndex
  keys: ItemKey[]
  onMove: (targetId: number | null) => void | Promise<void>
  onClose: () => void
  rootLabel?: string
}) {
  const { folderIds } = useMemo(() => splitKeys(keys), [keys])
  // A folder can't move into itself or its own subtree.
  const disabledIds = useMemo(() => {
    const set = new Set<number>()
    for (const id of folderIds) {
      set.add(id)
      for (const d of descendantFolderIds(index, id)) set.add(d)
    }
    return set
  }, [index, folderIds])
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(index.byId.keys()))
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const currentLocation = useMemo(() => {
    const parents = new Set<number | null>()
    for (const key of keys) {
      const { kind, id } = parseKey(key)
      parents.add(kind === 'card' ? index.cardById.get(id)?.folder_id ?? null : index.byId.get(id)?.parent_id ?? null)
    }
    if (parents.size !== 1) return 'multiple locations'
    return describePath(index, [...parents][0], rootLabel)
  }, [index, keys, rootLabel])

  const noop = allAlreadyIn(index, keys, target)

  return (
    <Modal
      title={`Move ${describeSelection(index, keys)}`}
      description={
        <>
          Currently in <span className="font-medium text-slate-700">{currentLocation}</span>. Choose a destination.
        </>
      }
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <div className="flex-1 text-xs text-slate-500 truncate">
            To: <span className="font-medium text-slate-700">{describePath(index, target, rootLabel)}</span>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            disabled={noop || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onMove(target)
                onClose()
              } catch {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Moving…' : 'Move here'}
          </button>
        </>
      }
    >
      <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto p-1.5 bg-slate-50/60">
        <FolderTreeView
          compact
          index={index}
          expanded={expanded}
          onToggle={(id) =>
            setExpanded((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          currentId={target}
          onSelect={setTarget}
          disabledIds={disabledIds}
          rootLabel={rootLabel}
        />
      </div>
      {noop && <p className="text-xs text-amber-600 mt-2">Already in this location — pick a different folder.</p>}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; shortcut?: string } | { separator: true }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    setPos({ left, top })
  }, [x, y, items.length])

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')
    first?.focus()
    const onPointer = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])
        if (!buttons.length) return
        e.preventDefault()
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
        buttons[next].focus()
      }
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('contextmenu', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('contextmenu', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} role="menu" className="fixed z-50 min-w-[12rem] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 animate-fade-in" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="my-1 border-t border-slate-100" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            type="button"
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50' : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100'
            }`}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span className="w-4 h-4 grid place-items-center text-current opacity-80">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-xs text-slate-400">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-center gap-3 max-w-md w-full sm:w-auto px-4 py-2.5 rounded-xl shadow-xl text-sm animate-in ${t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Dismiss" className="opacity-70 hover:opacity-100" onClick={() => onDismiss(t.id)}>
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

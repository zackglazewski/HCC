import { useCallback, useEffect, useRef, useState } from 'react'
import { getMe, patchMe } from '../lib/api'
import { CardPreviewMode, SortDir, SortField, ViewMode } from './explorerModel'

/** Explorer preferences that follow the user across devices (stored under `preferences.explorer`). */
export type ExplorerPrefs = {
  view: ViewMode
  sortField: SortField
  sortDir: SortDir
  cardPreview: CardPreviewMode
}

export const DEFAULT_EXPLORER_PREFS: ExplorerPrefs = {
  view: 'grid',
  sortField: 'updated',
  sortDir: 'desc',
  cardPreview: 'emblem',
}

const LOCAL_KEY = 'hcc:explorer:prefs'
const SERVER_KEY = 'explorer'
const SAVE_DEBOUNCE_MS = 600

/** Accepts only known keys with valid values so a corrupt blob can't break the UI. */
export function sanitizePrefs(raw: unknown): Partial<ExplorerPrefs> {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: Partial<ExplorerPrefs> = {}
  if (r.view === 'grid' || r.view === 'list') out.view = r.view
  if (r.sortField === 'name' || r.sortField === 'updated') out.sortField = r.sortField
  if (r.sortDir === 'asc' || r.sortDir === 'desc') out.sortDir = r.sortDir
  if (r.cardPreview === 'emblem' || r.cardPreview === 'render') out.cardPreview = r.cardPreview
  return out
}

function readLocal(): Partial<ExplorerPrefs> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? sanitizePrefs(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

function writeLocal(prefs: ExplorerPrefs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs))
  } catch {}
}

/**
 * Explorer preferences synced to the user's account. Renders immediately from the local cache,
 * then reconciles with the server; writes are optimistic and debounced.
 */
export function useExplorerPrefs(getToken: () => Promise<string | null>) {
  const [prefs, setPrefs] = useState<ExplorerPrefs>(() => ({ ...DEFAULT_EXPLORER_PREFS, ...readLocal() }))
  const [loaded, setLoaded] = useState(false)
  const pendingRef = useRef<Partial<ExplorerPrefs>>({})
  const timerRef = useRef<number | null>(null)
  const latestRef = useRef(prefs)
  latestRef.current = prefs

  // Pull the server copy once. Anything the user changed before it arrives wins.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await getMe(await getToken())
        if (cancelled) return
        const fromServer = sanitizePrefs(me.preferences?.[SERVER_KEY])
        setPrefs((current) => {
          const merged = { ...DEFAULT_EXPLORER_PREFS, ...fromServer, ...pendingRef.current }
          const changed = (Object.keys(merged) as (keyof ExplorerPrefs)[]).some((k) => merged[k] !== current[k])
          if (!changed) return current
          writeLocal(merged)
          return merged
        })
      } catch {
        // Offline or the endpoint failed — the local copy is still good.
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken])

  const flush = useCallback(async () => {
    timerRef.current = null
    if (!Object.keys(pendingRef.current).length) return
    const snapshot = { ...latestRef.current }
    pendingRef.current = {}
    try {
      await patchMe({ [SERVER_KEY]: snapshot }, await getToken())
    } catch {
      // Keep the local value; we'll try again on the next change.
    }
  }, [getToken])

  const update = useCallback(
    (patch: Partial<ExplorerPrefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...patch }
        writeLocal(next)
        return next
      })
      pendingRef.current = { ...pendingRef.current, ...patch }
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  // Don't lose a pending write if the page unloads mid-debounce.
  useEffect(() => {
    const onHide = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        void flush()
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flush])

  return { prefs, update, loaded }
}

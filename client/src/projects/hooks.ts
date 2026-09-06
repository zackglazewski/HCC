import { useCallback, useEffect, useState } from 'react'

/**
 * useState that mirrors its value into localStorage. Storage failures (private mode, quota)
 * are swallowed so the explorer still works without persistence.
 */
export function usePersistedState<T>(key: string, fallback: T, validate?: (raw: unknown) => raw is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback
      const parsed = JSON.parse(raw)
      if (validate && !validate(parsed)) return fallback
      return parsed as T
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }, [key, value])
  return [value, setValue] as const
}

/** True on touch-first devices, where hover affordances don't exist and single tap should open. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => {
    try {
      return window.matchMedia('(pointer: coarse)').matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    let media: MediaQueryList
    try {
      media = window.matchMedia('(pointer: coarse)')
    } catch {
      return
    }
    const onChange = () => setCoarse(media.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])
  return coarse
}

export type Toast = { id: number; kind: 'info' | 'error'; message: string }

/** Tiny toast queue. Toasts auto-dismiss after a few seconds. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (message: string, kind: Toast['kind'] = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((list) => [...list.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
    },
    [dismiss],
  )
  return { toasts, push, dismiss }
}

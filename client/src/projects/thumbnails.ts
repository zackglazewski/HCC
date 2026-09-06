import { RefObject, useEffect, useState } from 'react'
import { fetchThumbnailBlob, ServerCard } from '../lib/api'

/**
 * Session cache of thumbnail object URLs keyed by card id + version, so scrolling back and forth
 * (or re-rendering) never refetches. Object URLs are intentionally kept for the page lifetime.
 */
const cache = new Map<string, Promise<string | null>>()

/**
 * Renders produced by the editor during this session, keyed by card id. They're newer than
 * anything the server list knows about, so the explorer prefers them and needs no fetch.
 */
const localRenders = new Map<number, string>()

export function rememberLocalThumbnail(cardId: number, dataUrl: string) {
  localRenders.set(cardId, dataUrl)
}

export function hasLocalRender(cardId: number): boolean {
  return localRenders.has(cardId)
}

export function thumbnailVersion(card: ServerCard): string | null {
  return card.thumbnail?.updated_at ?? null
}

export function loadThumbnail(card: ServerCard, getToken: () => Promise<string | null>): Promise<string | null> {
  const version = thumbnailVersion(card)
  if (!version) return Promise.resolve(null)
  const key = `${card.id}:${version}`
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      const blob = await fetchThumbnailBlob(card.id, version, await getToken())
      return blob ? URL.createObjectURL(blob) : null
    })().catch(() => null)
    cache.set(key, pending)
  }
  return pending
}

/** Becomes true once the element has scrolled near the viewport (and stays true). */
export function useInView<T extends Element>(ref: RefObject<T>, enabled = true, rootMargin = '200px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!enabled || inView) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, enabled, inView, rootMargin])
  return inView
}

/** Object URL for a card's rendered preview, fetched lazily once the tile is on screen. */
export function useThumbnailUrl(card: ServerCard, enabled: boolean, load: ((card: ServerCard) => Promise<string | null>) | undefined, inView: boolean): string | null {
  const version = thumbnailVersion(card)
  const local = localRenders.get(card.id) ?? null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || local || !inView || !version || !load) {
      setUrl(null)
      return
    }
    let cancelled = false
    load(card).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
    // The card object identity changes on every list refresh; only id + version matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, version, enabled, inView, load, local])
  return enabled ? local ?? url : null
}

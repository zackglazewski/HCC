import { useEffect, useRef, useState } from 'react'
import { CanvasSnapshot, EditorCanvas } from '../editor/Canvas'
import type { CustomTheme } from '../editor/CustomThemePanel'
import { DEFAULT_CUSTOM_THEME, customThemeFromServer, revokeCardImages, serverCardToState } from '../editor/serverCard'
import { encodeThumbnail, THUMBNAIL_PX } from '../editor/thumbnail'
import { CardState } from '../editor/types'
import { getCard, putThumbnail, ServerCard } from '../lib/api'
import { rememberLocalThumbnail } from './thumbnails'

const POLL_MS = 200
const MAX_POLLS = 100 // ~20s per card before giving up on it

type Job = { server: ServerCard; card: CardState; theme: CustomTheme | null }

const noop = () => {}

/**
 * Renders previews for cards that don't have one yet, one at a time, using the real editor canvas
 * mounted off-screen. Each finished render is uploaded and handed back so the tile updates at once.
 * Cards that fail (network, broken data) are skipped for this session rather than retried forever.
 */
export function ThumbnailBackfill({
  queue,
  getToken,
  onRendered,
}: {
  /** Cards still missing a preview, highest priority first. */
  queue: ServerCard[]
  getToken: () => Promise<string | null>
  onRendered: (cardId: number, updatedAt: string) => void
}) {
  const [job, setJob] = useState<Job | null>(null)
  const snapshotRef = useRef<CanvasSnapshot | null>(null)
  const attemptedRef = useRef<Set<number>>(new Set())
  const busyRef = useRef(false)
  /** Bumped when a card is skipped without ever becoming a job, so the picker effect re-runs. */
  const [skips, setSkips] = useState(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Pick up the next card whenever we're idle and the queue has something new.
  useEffect(() => {
    if (job || busyRef.current) return
    const next = queue.find((c) => !attemptedRef.current.has(c.id))
    if (!next) return
    attemptedRef.current.add(next.id)
    busyRef.current = true
    ;(async () => {
      try {
        const full = await getCard(next.id, await getToken())
        const card = await serverCardToState(full)
        if (!mountedRef.current) {
          revokeCardImages(card)
          return
        }
        const theme = customThemeFromServer(full) ?? (full.general === 'custom' ? DEFAULT_CUSTOM_THEME : null)
        setJob({ server: full, card, theme })
      } catch {
        // Skip this card and move on to the next one.
        busyRef.current = false
        if (mountedRef.current) setSkips((n) => n + 1)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, job, skips])

  // Once the hidden canvas has finished loading fonts/layers/images, snapshot, upload, move on.
  useEffect(() => {
    if (!job) return
    let polls = 0
    let cancelled = false
    const finish = () => {
      revokeCardImages(job.card)
      busyRef.current = false
      if (!cancelled) setJob(null)
    }
    const tick = async () => {
      if (cancelled) return
      const snapshot = snapshotRef.current?.(THUMBNAIL_PX)
      if (!snapshot) {
        if (++polls < MAX_POLLS) timer = window.setTimeout(tick, POLL_MS)
        else finish()
        return
      }
      const dataUrl = encodeThumbnail(snapshot)
      rememberLocalThumbnail(job.server.id, dataUrl)
      try {
        const saved = await putThumbnail(job.server.id, dataUrl, await getToken())
        if (!cancelled) onRendered(job.server.id, saved.updated_at)
      } catch (e) {
        console.warn('Preview upload failed for card', job.server.id, e)
      }
      finish()
    }
    let timer = window.setTimeout(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      revokeCardImages(job.card) // no-op if finish() already did it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  if (!job) return null
  return (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
      <EditorCanvas card={job.card} selectedId={null} onSelect={noop} onUpdateImage={noop} customTheme={job.theme} snapshotRef={snapshotRef} />
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useCardState } from '../editor/state'
import { TemplateSelector } from '../editor/TemplateSelector'
import type { General } from '../editor/types'
import { EditorCanvas, CanvasSnapshot } from '../editor/Canvas'
import { PowersEditor } from '../editor/PowersEditor'
import { HitboxEditor } from '../editor/HitboxEditor'
import { CustomThemePanel, type CustomTheme } from '../editor/CustomThemePanel'
import { createCard, getCard, patchCard, postImage, postPower, patchPower, patchImage, deleteImageApi, listThemes, createTheme, deleteTheme, putThumbnail } from '../lib/api'
import { SupportLink } from '../lib/support'
import { rememberLocalThumbnail } from '../projects/thumbnails'
import { DEFAULT_CUSTOM_THEME, serverCardToState } from '../editor/serverCard'
import { encodeThumbnail, THUMBNAIL_PX } from '../editor/thumbnail'

/** Wait for edits to settle before snapshotting a preview. */
const THUMBNAIL_DEBOUNCE_MS = 1200
/** The canvas may still be loading fonts/theme layers on open; keep trying for a while. */
const THUMBNAIL_RETRY_MS = 400
const THUMBNAIL_MAX_ATTEMPTS = 40
import { DEFAULT_CARD } from '../editor/types'
import type { HitboxState } from '../editor/types'

/** Serialize hitbox for server: convert local imageId UUIDs → server remoteIds */
function serializeHitbox(hitbox: HitboxState | undefined, images: { id: string; remoteId?: number }[]): string | null {
  if (!hitbox || hitbox.silhouettes.length === 0) return null
  const localToRemote = new Map<string, number>()
  for (const img of images) {
    if (img.remoteId) localToRemote.set(img.id, img.remoteId)
  }
  return JSON.stringify({
    silhouettes: hitbox.silhouettes.map((s) => ({ ...s, imageId: localToRemote.get(s.imageId) ?? s.imageId })),
    losMarkers: (hitbox.losMarkers ?? []).map((m) => ({ ...m, imageId: localToRemote.get(m.imageId) ?? m.imageId })),
  })
}

/** Deserialize hitbox from server: convert server remoteIds → local imageId UUIDs */
type ViewMode = 'both' | 'canvas' | 'panel'

function Header({ saving, title, onTitleChange, general, onGeneralChange, onExport, onSaveToAccount, isAuthenticated: authProp, cardId, viewMode, onViewModeChange, backTo = '/projects' }: {
  saving: boolean
  title: string
  onTitleChange: (title: string) => void
  general: General
  onGeneralChange: (g: General) => void
  onExport: () => void
  onSaveToAccount: () => void
  isAuthenticated: boolean
  cardId: number | null
  viewMode: ViewMode
  onViewModeChange: (m: ViewMode) => void
  /** Where the back arrow goes — the card's folder when it has one. */
  backTo?: string
}) {
  const { isAuthenticated, loginWithRedirect, loginWithPopup, logout, user, isLoading } = useAuth0()
  return (
    <header className="header-glass">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:px-4">
        {/* Left: Back button + Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Link to={backTo} className="text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0" title="Back to Projects">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <input
            className="text-base sm:text-lg font-semibold text-slate-900 outline-none bg-transparent placeholder:text-slate-400 focus:text-blue-600 transition-colors flex-1 min-w-0"
            placeholder="Untitled Card"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>

        {/* Right: compact action buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <SupportLink compact />
          {/* Save status - icon only on mobile */}
          <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
            {saving ? (
              <div className="spinner" style={{ width: 16, height: 16 }}></div>
            ) : (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="hidden sm:inline">{saving ? 'Saving...' : 'Saved'}</span>
          </div>
          <button
            className="btn-icon !p-1.5 sm:!p-2"
            onClick={onExport}
            title="Export as PNG"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {authProp && !cardId && (
            <button
              className="btn-icon !p-1.5 sm:!p-2"
              onClick={onSaveToAccount}
              title="Save to your account"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
          )}
          {!isLoading && isAuthenticated && user?.picture && (
            <div className="relative group">
              <img
                src={user.picture}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-2 ring-slate-200 cursor-pointer hover:ring-blue-400 transition-all"
                alt={user?.name}
                title={user?.name}
              />
              <div className="absolute right-0 top-9 sm:top-10 bg-white rounded-lg shadow-xl border border-slate-200 py-2 px-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px]">
                <div className="text-sm font-medium text-slate-900 mb-1">{user?.name}</div>
                <div className="text-xs text-slate-500 mb-3">{user?.email}</div>
                <button
                  className="w-full text-left text-sm text-red-600 hover:text-red-700 font-medium"
                  onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                >
                  Log out
                </button>
              </div>
            </div>
          )}
          {!isLoading && !isAuthenticated && (
            <button
              className="btn-primary text-xs sm:text-sm py-1.5 px-3"
              onClick={async () => {
                try {
                  await loginWithPopup()
                } catch {
                  try { sessionStorage.setItem('hcc:returnTo', window.location.pathname + window.location.search) } catch {}
                  loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } })
                }
              }}
            >
              Log in
            </button>
          )}
        </div>

        {/* Second row: Template selector + View toggle - full width on mobile */}
        <div className="flex items-center gap-2 w-full">
          <TemplateSelector value={general} onChange={onGeneralChange} />
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg ml-auto">
            <button
              className={`px-2 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ${viewMode==='canvas' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              onClick={() => onViewModeChange('canvas')}
              title="Show Card Only"
              aria-pressed={viewMode==='canvas'}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
              </svg>
              <span className="hidden sm:inline">Card</span>
            </button>
            <button
              className={`px-2 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ${viewMode==='panel' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              onClick={() => onViewModeChange('panel')}
              title="Show Configs Only"
              aria-pressed={viewMode==='panel'}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span className="hidden sm:inline">Configs</span>
            </button>
            <button
              className={`px-2 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ${viewMode==='both' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
              onClick={() => onViewModeChange('both')}
              title="Show Both"
              aria-pressed={viewMode==='both'}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h7v7H4V6zm9 0h7v7h-7V6zM4 15h16v3H4z" />
              </svg>
              <span className="hidden sm:inline">Both</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default function EditorPage() {
  const params = useParams()
  const nav = useNavigate()
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0()
  const { card, saving, setTitle, setGeneral, updateField, addImage, updateImage, deleteImage, setCard, resetToDefaults, updateSilhouette, addLOSMarker, updateLOSMarker, deleteLOSMarker, syncHitboxSilhouettes } = useCardState()
  const location = useLocation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cardId = params.id ? parseInt(params.id) : null
  const [loading, setLoading] = useState<boolean>(!!cardId)
  const [folderId, setFolderId] = useState<number | null>(null)
  const snapshotRef = useRef<CanvasSnapshot | null>(null)
  /** Last thumbnail we sent, so leaving the editor doesn't re-upload an identical render. */
  const lastThumbnailRef = useRef<{ cardId: number; dataUrl: string } | null>(null)
  /** Latest values for the unmount-time snapshot (that effect deliberately has no deps). */
  const thumbnailCtxRef = useRef({ cardId: null as number | null, isAuthenticated: false })
  thumbnailCtxRef.current = { cardId: card.id ?? null, isAuthenticated }
  const [customTheme, setCustomTheme] = useState<CustomTheme>({ primary: '#3080ff', secondary: '#88aacc', background: '#556677' })
  const [activeTab, setActiveTab] = useState<'images' | 'theme' | 'attributes' | 'powers' | 'hitbox'>('images')
  const [savedThemes, setSavedThemes] = useState<{ id: number; name: string; primary_hex: string; secondary_hex: string; background_hex: string }[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(() => window.innerWidth < 768 ? 'panel' : 'both')
  const [removingBg, setRemovingBg] = useState(false)
  const promotionRef = useRef(false)
  const creatingRemoteRef = useRef<Promise<number | undefined> | null>(null)

  // If opening a new guest card, reset local state to defaults
  useEffect(() => {
    if (cardId) return
    if (isAuthenticated) return
    try {
      const params = new URLSearchParams(location.search)
      if (params.has('new')) {
        resetToDefaults()
        localStorage.removeItem('hcc:theme:local')
        // remove the flag to avoid repeated resets on re-render
        params.delete('new')
        const next = params.toString()
        const path = next ? `/editor?${next}` : '/editor'
        // replace history to avoid loops
        nav(path, { replace: true })
      }
    } catch {}
  }, [location.search, cardId, isAuthenticated])

  

  // Load card by id when available and signed in
  useEffect(() => {
    ;(async () => {
      if (!cardId || !isAuthenticated) { setLoading(false); return }
      try {
        const token = await getAccessTokenSilently()
        const server = await getCard(cardId, token)
        setFolderId(server.folder_id ?? null)
        const nextCard = await serverCardToState(server)
        setCard(nextCard)
        // Load custom theme if present on server; otherwise reset to default
        if ((server.general as any) !== 'custom') {
          setCustomTheme(DEFAULT_CUSTOM_THEME)
        } else if ((server.general as any) === 'custom') {
          const fromServer = {
            primary: (server as any).theme_primary_hex || null,
            secondary: (server as any).theme_secondary_hex || null,
            background: (server as any).theme_background_hex || null,
          }
          if (fromServer.primary && fromServer.secondary && fromServer.background) {
            setCustomTheme(fromServer as any)
          } else {
            try {
              const saved = localStorage.getItem(`hcc:theme:${server.id}`)
              if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed && parsed.primary && parsed.secondary && parsed.background) setCustomTheme(parsed)
              }
            } catch {}
          }
        }
      } catch {
        // Token expired or refresh failed — clear stale Auth0 cache
        logout({ openUrl: false })
      } finally {
        setLoading(false)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isAuthenticated])

  // Load saved themes when authenticated
  useEffect(() => {
    ;(async () => {
      if (!isAuthenticated) { setSavedThemes([]); return }
      try {
        const token = await getAccessTokenSilently().catch(() => null)
        const themes = await listThemes(token)
        setSavedThemes(themes)
      } catch { setSavedThemes([]) }
    })()
  }, [isAuthenticated, getAccessTokenSilently])

  // Autosave to API; ensure remote card exists and include theme fields (requires DB migration)
  useEffect(() => {
    let timer: number | null = null
    async function save() {
      if (!isAuthenticated) return
      // Ensure remote card exists so theme can be saved
      let remoteId = card.id
      if (!remoteId) {
        remoteId = await ensureRemoteCard(false)
        if (!remoteId) return
      }
      const token = await getAccessTokenSilently().catch(() => null)
      try {
        const hitboxJson = serializeHitbox(card.hitbox, card.images as any)
        await patchCard(remoteId, {
          title: card.title,
          general: card.general,
          card_name: card.fields.cardName,
          tribe_name: card.fields.tribeName,
          species: card.fields.species,
          uniqueness: card.fields.uniqueness,
          class: card.fields.class,
          personality: card.fields.personality,
          size: card.fields.size,
          life: card.fields.life,
          move: card.fields.move,
          range: card.fields.range,
          attack: card.fields.attack,
          defense: card.fields.defense,
          points: card.fields.points,
          hitbox_json: hitboxJson,
          ...(card.general === 'custom' ? {
            theme_primary_hex: customTheme.primary,
            theme_secondary_hex: customTheme.secondary,
            theme_background_hex: customTheme.background,
          } : {}),
        } as any, token)
      } catch (e) {
        // swallow errors, but keep autosave loop
        console.warn('Autosave failed', e)
      }
    }
    timer = window.setTimeout(save, 1000)
    return () => { if (timer) window.clearTimeout(timer) }
  }, [card, customTheme, isAuthenticated, getAccessTokenSilently])

  // Upload a small rendered preview for the projects explorer once edits settle.
  // Also runs on open (backfilling cards created before previews existed). The canvas can take a
  // moment to become ready after load — fonts, base images, custom-theme recolouring — so a snapshot
  // that isn't available yet is retried instead of silently skipped.
  useEffect(() => {
    if (!isAuthenticated || !card.id) return
    const cardId = card.id
    let cancelled = false
    let attempts = 0
    let timer = window.setTimeout(attempt, THUMBNAIL_DEBOUNCE_MS)
    async function attempt() {
      if (cancelled) return
      const snapshot = snapshotRef.current?.(THUMBNAIL_PX)
      if (!snapshot) {
        if (++attempts < THUMBNAIL_MAX_ATTEMPTS) timer = window.setTimeout(attempt, THUMBNAIL_RETRY_MS)
        return
      }
      const dataUrl = encodeThumbnail(snapshot)
      if (cancelled) return
      void uploadThumbnail(cardId, dataUrl)
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [card, customTheme, isAuthenticated, getAccessTokenSilently])

  async function uploadThumbnail(cardId: number, dataUrl: string) {
    const last = lastThumbnailRef.current
    if (last && last.cardId === cardId && last.dataUrl === dataUrl) return
    lastThumbnailRef.current = { cardId, dataUrl }
    rememberLocalThumbnail(cardId, dataUrl)
    const token = await getAccessTokenSilently().catch(() => null)
    try {
      await putThumbnail(cardId, dataUrl, token)
    } catch (e) {
      console.warn('Thumbnail upload failed', e)
    }
  }
  const uploadThumbnailRef = useRef(uploadThumbnail)
  uploadThumbnailRef.current = uploadThumbnail

  // Leaving the editor quickly (before the debounce fired) should still leave a preview behind.
  useEffect(() => {
    return () => {
      const { cardId, isAuthenticated: authed } = thumbnailCtxRef.current
      if (!authed || !cardId) return
      const snapshot = snapshotRef.current?.(THUMBNAIL_PX)
      if (!snapshot) return
      void uploadThumbnailRef.current(cardId, encodeThumbnail(snapshot))
    }
  }, [])

  // Persist custom theme to localStorage for fast restore and guest mode
  useEffect(() => {
    if (card.general !== 'custom') return
    const key = card.id ? `hcc:theme:${card.id}` : 'hcc:theme:local'
    try {
      localStorage.setItem(key, JSON.stringify(customTheme))
    } catch {}
  }, [customTheme, card.general, card.id])

  async function ensureRemoteCard(navigateToEditor: boolean = true): Promise<number | undefined> {
    if (card.id) return card.id
    if (!isAuthenticated) return undefined
    if (creatingRemoteRef.current) return creatingRemoteRef.current
    const inFlight = (async () => {
      const token = await getAccessTokenSilently().catch(() => null)
      const created = await createCard({ title: card.title, general: card.general }, token)
      setCard((prev) => ({ ...prev, id: created.id }))
      if (navigateToEditor) nav(`/editor/${created.id}`)
      return created.id
    })()
    creatingRemoteRef.current = inFlight
    try {
      return await inFlight
    } finally {
      creatingRemoteRef.current = null
    }
  }

  const handleRemoveBg = useCallback(async () => {
    if (!selectedId || removingBg) return
    const layer = card.images.find((i) => i.id === selectedId)
    if (!layer?.dataUrl) return
    setRemovingBg(true)
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const blob = await removeBackground(layer.dataUrl)
      const newDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      updateImage(selectedId, { dataUrl: newDataUrl })
      // Re-upload to server if authenticated
      if (isAuthenticated && card.id && (layer as any).remoteId) {
        const token = await getAccessTokenSilently().catch(() => null)
        try {
          const oldRemoteId = (layer as any).remoteId
          const created = await postImage(card.id, { ...layer, dataUrl: newDataUrl } as any, token)
          setCard((prev) => ({
            ...prev,
            images: prev.images.map((im) => im.id === selectedId ? { ...im, remoteId: created.id } : im)
          }))
          // Only delete old image after new one is confirmed saved
          try { await deleteImageApi(card.id, oldRemoteId, token) } catch {}
        } catch (e) {
          console.error('Background removal re-upload failed', e)
        }
      }
    } catch (e) {
      console.warn('Background removal failed', e)
    } finally {
      setRemovingBg(false)
    }
  }, [selectedId, removingBg, card.images, card.id, isAuthenticated, getAccessTokenSilently, updateImage, setCard])

  const handleDeleteImage = (id: string) => {
    const layer = card.images.find((i) => i.id === id)
    deleteImage(id)
    if (selectedId === id) setSelectedId(null)
    if (isAuthenticated && card.id && layer && (layer as any).remoteId) {
      ;(async () => {
        const token = await getAccessTokenSilently().catch(() => null)
        try { await deleteImageApi(card.id!, (layer as any).remoteId, token) } catch {}
      })()
    }
  }

  // Promote guest card to a user-owned card on login: create, patch fields, upload images and powers, then navigate.
  useEffect(() => {
    if (!isAuthenticated) return
    if (cardId) return // already on a server-backed card
    if (card.id) return // already promoted
    if (promotionRef.current) return
    promotionRef.current = true
    ;(async () => {
      const remoteId = await ensureRemoteCard(false)
      if (!remoteId) return
      const token = await getAccessTokenSilently().catch(() => null)
      try {
        // Patch all fields immediately
        await patchCard(remoteId, {
          title: card.title,
          general: card.general,
          card_name: card.fields.cardName,
          tribe_name: card.fields.tribeName,
          species: card.fields.species,
          uniqueness: card.fields.uniqueness,
          class: card.fields.class,
          personality: card.fields.personality,
          size: card.fields.size,
          life: card.fields.life,
          move: card.fields.move,
          range: card.fields.range,
          attack: card.fields.attack,
          defense: card.fields.defense,
          points: card.fields.points,
          ...(card.general === 'custom' ? {
            theme_primary_hex: customTheme.primary,
            theme_secondary_hex: customTheme.secondary,
            theme_background_hex: customTheme.background,
          } : {}),
        }, token)
        // Upload images (only those without remoteId)
        const imgs = [...card.images].sort((a,b)=>a.order-b.order)
        await Promise.all(imgs.filter(i => !('remoteId' in i) || !i.remoteId).map(layer => postImage(remoteId, layer as any, token)))
        // Create powers on server to match local
        await Promise.all(card.powers.map(p => postPower(remoteId, { order: p.order, heading: p.heading, body: p.body }, token).catch(()=>null)))
      } catch (e) {
        console.warn('Promotion sync failed', e)
      }
      // Now load from server by navigating; server should have full content
      nav(`/editor/${remoteId}`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  return (
    <div className="md:h-screen md:flex md:flex-col md:overflow-hidden">
      <Header
        saving={saving}
        backTo={folderId != null ? `/projects?folder=${folderId}` : '/projects'}
        title={card.title}
        onTitleChange={(title) => {
          setTitle(title)
          if (isAuthenticated && card.id) {
            ;(async () => {
              const token = await getAccessTokenSilently().catch(() => null)
              try { await patchCard(card.id!, { title }, token) } catch {}
            })()
          }
        }}
        general={card.general}
        onGeneralChange={async (g: General) => {
          setGeneral(g)
          if (isAuthenticated && card.id) {
            const token = await getAccessTokenSilently().catch(() => null)
            try { await patchCard(card.id, { general: g }, token) } catch {}
          }
        }}
        onExport={() => {
          setSelectedId(null)
          requestAnimationFrame(() => {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
            if (!canvas) return
            canvas.toBlob((blob) => {
              if (!blob) return
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `${card.fields.cardName || 'card'}.png`
              a.click()
              URL.revokeObjectURL(a.href)
            })
          })
        }}
        onSaveToAccount={() => { void ensureRemoteCard() }}
        isAuthenticated={isAuthenticated}
        cardId={cardId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="spinner mb-4"></div>
            <p className="text-slate-500">Loading card...</p>
          </div>
        </div>
      ) : (
        <main className="md:flex md:flex-1 md:min-h-0 md:overflow-hidden md:flex-row">
          {/* Canvas area (first on mobile) */}
          <div className={`md:flex-1 md:flex md:flex-col md:min-h-0 bg-slate-50 md:order-2 ${viewMode === 'panel' ? 'hidden' : ''}`}>
            <EditorCanvas
              card={card}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdateImage={(id, patch) => {
                updateImage(id, patch)
                if (!isAuthenticated || !card.id) return
                const layer = card.images.find((i) => i.id === id)
                if (!layer || !(layer as any).remoteId) return
                ;(async () => {
                  const token = await getAccessTokenSilently().catch(() => null)
                  try { await patchImage(card.id!, (layer as any).remoteId, patch as any, token) } catch {}
                })()
              }}
              onDeleteImage={handleDeleteImage}
              customTheme={card.general === 'custom' ? customTheme : null}
              snapshotRef={snapshotRef}
            />
            {/* Bottom hint bar */}
            <div className="hidden sm:block bg-white/80 backdrop-blur-sm border-t border-slate-200 px-4 py-2 text-xs text-slate-500 text-center">
              Click and drag images • Arrow keys to nudge • Shift+arrows for larger steps • Backspace to delete
            </div>
          </div>

          {/* Left: Unified sidebar with tabs (full width on mobile) */}
          <div className={`w-full md:w-[520px] xl:w-[560px] 2xl:w-[600px] md:flex-shrink-0 bg-white border-r border-slate-200 shadow-lg md:flex md:flex-col md:min-h-0 md:order-1 ${viewMode === 'canvas' ? 'hidden' : ''}`}
          >
            {/* Tabs */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200">
              <div className="flex gap-1 px-2 pt-2 pb-1.5 sm:gap-1.5 sm:px-3 sm:pt-3 sm:pb-2 overflow-x-auto">
                <button
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab==='images' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                  onClick={() => setActiveTab('images')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Images
                </button>
                {card.general === 'custom' && (
                  <button
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab==='theme' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                    onClick={() => setActiveTab('theme')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Theme
                  </button>
                )}
                <button
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab==='attributes' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                  onClick={() => setActiveTab('attributes')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Attributes
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab==='powers' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                  onClick={() => setActiveTab('powers')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Powers
                </button>
                <button
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${activeTab==='hitbox' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                  onClick={() => setActiveTab('hitbox')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
                  </svg>
                  Hitbox
                </button>
              </div>
            </div>
            <div className="md:flex-1 md:overflow-y-auto overflow-x-hidden p-3 sm:p-5 space-y-4">
              {/* Images Section */}
              {activeTab === 'images' && (
              <section className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 py-1">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Images
                  </h3>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        const dataUrl = reader.result as string
                        const name = file.name
                        const newId = crypto.randomUUID()
                        addImage(dataUrl, name, newId)
                        setSelectedId(newId)
                        ;(async () => {
                          if (!isAuthenticated) return
                          const ensureId = await ensureRemoteCard(false)
                          if (!ensureId) return
                          const layer = card.images.find((i) => i.id === newId) || { id: newId, name, dataUrl, x: 980, y: 550, scale: 1, rotation: null, order: (card.images.length ? Math.max(...card.images.map(i=>i.order))+1 : 0) } as any
                          const token = await getAccessTokenSilently().catch(() => null)
                          try {
                            const created = await postImage(ensureId, layer as any, token)
                            setCard((prev) => ({
                              ...prev,
                              images: prev.images.map((im) => im.id === newId ? { ...im, order: created.order, remoteId: created.id } : im)
                            }))
                          } catch (e) {
                            console.error('Image upload failed', e)
                          }
                        })()
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                    className="hidden"
                  />
                  <div className="btn-primary w-full text-center cursor-pointer flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Upload Image
                  </div>
                </label>

                {selectedId && (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-blue-900 mb-2">Selected Image Controls</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div></div>
                      <button className="btn-icon text-xs" onClick={() => selectedId && ((id, dx, dy) => {
                        const layer = card.images.find((i) => i.id === id)
                        if (!layer) return
                        const nx = layer.x + dx, ny = layer.y + dy
                        updateImage(id, { x: nx, y: ny })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { x: nx, y: ny }, token) } catch {}
                          })()
                        }
                      })(selectedId, 0, -5)} title="Move up">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <div></div>
                      <button className="btn-icon text-xs" onClick={() => selectedId && ((id, dx, dy) => {
                        const layer = card.images.find((i) => i.id === id)
                        if (!layer) return
                        const nx = layer.x + dx, ny = layer.y + dy
                        updateImage(id, { x: nx, y: ny })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { x: nx, y: ny }, token) } catch {}
                          })()
                        }
                      })(selectedId, -5, 0)} title="Move left">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div className="flex items-center justify-center text-[10px] text-slate-500 font-medium">MOVE</div>
                      <button className="btn-icon text-xs" onClick={() => selectedId && ((id, dx, dy) => {
                        const layer = card.images.find((i) => i.id === id)
                        if (!layer) return
                        const nx = layer.x + dx, ny = layer.y + dy
                        updateImage(id, { x: nx, y: ny })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { x: nx, y: ny }, token) } catch {}
                          })()
                        }
                      })(selectedId, 5, 0)} title="Move right">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div></div>
                      <button className="btn-icon text-xs" onClick={() => selectedId && ((id, dx, dy) => {
                        const layer = card.images.find((i) => i.id === id)
                        if (!layer) return
                        const nx = layer.x + dx, ny = layer.y + dy
                        updateImage(id, { x: nx, y: ny })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { x: nx, y: ny }, token) } catch {}
                          })()
                        }
                      })(selectedId, 0, 5)} title="Move down">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div></div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button className="flex-1 btn-icon text-xs" onClick={() => {
                        const layer = card.images.find((i) => i.id === selectedId)
                        if (!layer) return
                        const next = Math.max(0.05, layer.scale - 0.1)
                        updateImage(selectedId!, { scale: next })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { scale: next }, token) } catch {}
                          })()
                        }
                      }} title="Scale down">
                        <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <div className="text-[10px] text-slate-500 font-medium">SCALE</div>
                      <button className="flex-1 btn-icon text-xs" onClick={() => {
                        const layer = card.images.find((i) => i.id === selectedId)
                        if (!layer) return
                        const next = layer.scale + 0.1
                        updateImage(selectedId!, { scale: next })
                        if (isAuthenticated && card.id && (layer as any).remoteId) {
                          ;(async () => {
                            const token = await getAccessTokenSilently().catch(() => null)
                            try { await patchImage(card.id!, (layer as any).remoteId, { scale: next }, token) } catch {}
                          })()
                        }
                      }} title="Scale up">
                        <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    <button
                      className="w-full btn-secondary text-xs py-1.5 flex items-center justify-center gap-1.5"
                      onClick={handleRemoveBg}
                      disabled={removingBg}
                      title="Remove image background using AI"
                    >
                      {removingBg ? (
                        <>
                          <div className="spinner" style={{ width: 14, height: 14 }}></div>
                          Removing...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Remove Background
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                    Layer Order (drag to reorder)
                  </div>
                  {[...card.images].sort((a, b) => a.order - b.order).length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      No images yet
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {[...card.images].sort((a, b) => a.order - b.order).map((img) => {
                        const dragIdRef = (typeof window !== 'undefined') ? (window as any).__imgDragIdRef || { current: null as string | null } : { current: null as string | null }
                        if ((window as any)) (window as any).__imgDragIdRef = dragIdRef
                        return (
                          <li
                            key={img.id}
                            draggable
                            onDragStart={(e) => {
                              dragIdRef.current = img.id
                              e.dataTransfer.effectAllowed = 'move'
                              try { e.dataTransfer.setData('text/plain', img.id) } catch {}
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const src = ((): string | null => {
                                try { const d = e.dataTransfer.getData('text/plain'); if (d) return d } catch {}
                                return dragIdRef.current
                              })()
                              if (!src || src === img.id) { dragIdRef.current = null; return }
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              const before = e.clientY < rect.top + rect.height / 2
                              const sorted = [...card.images].sort((a,b) => a.order - b.order)
                              const ids = sorted.map(i => i.id)
                              const from = ids.indexOf(src)
                              let to = ids.indexOf(img.id)
                              if (!before) to = to + 1
                              if (from < 0) return
                              ids.splice(from, 1)
                              if (to > ids.length) to = ids.length
                              ids.splice(to, 0, src)
                              const orderMap = new Map<string, number>()
                              ids.forEach((id, idx) => orderMap.set(id, idx))
                              setCard((prev) => ({
                                ...prev,
                                images: prev.images.map((im) => orderMap.has(im.id) ? { ...im, order: orderMap.get(im.id)! } : im)
                              }))
                              if (isAuthenticated && card.id) {
                                ;(async () => {
                                  const token = await getAccessTokenSilently().catch(() => null)
                                  try {
                                    const imagesToPatch = card.images.filter((im) => (im as any).remoteId)
                                    await Promise.all(imagesToPatch.map((im) => patchImage(card.id!, (im as any).remoteId, { order: orderMap.get(im.id) ?? im.order }, token)))
                                  } catch {}
                                })()
                              }
                              dragIdRef.current = null
                            }}
                            className={`${selectedId === img.id ? 'layer-item-selected' : 'layer-item'} p-2.5 cursor-grab active:cursor-grabbing`}
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                              </svg>
                              <button
                                className="text-left flex-1 min-w-0 truncate text-xs font-medium text-slate-900"
                                onClick={() => setSelectedId(img.id)}
                              >
                                {img.name || 'Image'}
                              </button>
                              <button
                                className="text-red-500 hover:text-red-700 p-1"
                                onClick={() => handleDeleteImage(img.id)}
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>
              )}

              {/* Custom Theme Panel */}
              {activeTab === 'theme' && card.general === 'custom' && (
                <>
                  <CustomThemePanel
                    value={customTheme}
                    onChange={setCustomTheme}
                    saved={savedThemes}
                    onApplySaved={(id) => {
                      const t = savedThemes.find((x) => x.id === id)
                      if (!t) return
                      setCustomTheme({ primary: t.primary_hex, secondary: t.secondary_hex, background: t.background_hex })
                      if (card.general !== 'custom') setGeneral('custom')
                    }}
                    onSaveNew={async (name) => {
                      if (!isAuthenticated) return
                      const token = await getAccessTokenSilently().catch(() => null)
                      try {
                        const saved = await createTheme({ name, primary_hex: customTheme.primary, secondary_hex: customTheme.secondary, background_hex: customTheme.background }, token)
                        setSavedThemes((prev) => [saved, ...prev])
                      } catch (e) {
                        console.warn('Save theme failed', e)
                      }
                    }}
                    onDeleteSaved={async (id) => {
                      if (!isAuthenticated) return
                      const token = await getAccessTokenSilently().catch(() => null)
                      try { await deleteTheme(id, token); setSavedThemes((prev) => prev.filter((t) => t.id !== id)) } catch {}
                    }}
                  />
                </>
              )}

              {/* Attributes Section */}
              {activeTab === 'attributes' && (
              <section className="space-y-3">
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 py-1">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Attributes
                  </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['cardName', 'Card Name'],
                    ['tribeName', 'General Name'],
                    ['species', 'Species'],
                    ['uniqueness', 'Uniqueness'],
                    ['class', 'Class'],
                    ['personality', 'Personality'],
                    ['size', 'Size'],
                    ['life', 'Life'],
                    ['move', 'Move'],
                    ['range', 'Range'],
                    ['attack', 'Attack'],
                    ['defense', 'Defense'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className={key === 'cardName' || key === 'tribeName' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <input
                        className="input-modern text-sm"
                        value={card.fields[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        onBlur={async (e) => {
                          if (isAuthenticated && card.id) {
                            const token = await getAccessTokenSilently().catch(() => null)
                            const serverKey =
                              key === 'cardName' ? 'card_name' :
                              key === 'tribeName' ? 'tribe_name' :
                              key
                            try { await patchCard(card.id, { [serverKey]: e.target.value } as any, token) } catch {}
                          }
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Points</label>
                    <input
                      className="input-modern text-sm"
                      value={card.fields.points}
                      onChange={(e) => updateField('points', e.target.value)}
                      onBlur={async (e) => {
                        if (isAuthenticated && card.id) {
                          const token = await getAccessTokenSilently().catch(() => null)
                          try { await patchCard(card.id, { points: e.target.value } as any, token) } catch {}
                        }
                      }}
                    />
                  </div>
                </div>
              </section>
              )}

              {/* Powers Section */}
              {activeTab === 'powers' && (
                <PowersEditor
                  powers={card.powers}
                  onChange={(p) => setCard({ ...card, powers: p })}
                  onCommitPower={async (p) => {
                    if (!isAuthenticated) return
                    const token = await getAccessTokenSilently().catch(() => null)
                    const existing = card.powers.find((x) => x.id === p.id)
                    if (!existing) return
                    if (!card.id) return
                    if ((existing as any).remoteId) {
                      await patchPower(card.id, (existing as any).remoteId, { heading: p.heading, body: p.body }, token)
                    } else {
                      const created = await postPower(card.id, { order: existing.order, heading: p.heading, body: p.body }, token)
                      setCard((prev) => ({
                        ...prev,
                        powers: prev.powers.map((x) => (x.id === p.id ? ({ ...x, remoteId: created.id } as any) : x)),
                      }))
                    }
                  }}
                />
              )}

              {/* Hitbox Section */}
              {activeTab === 'hitbox' && (
                <HitboxEditor
                  card={card}
                  onUpdateSilhouette={updateSilhouette}
                  onAddLOSMarker={addLOSMarker}
                  onUpdateLOSMarker={updateLOSMarker}
                  onDeleteLOSMarker={deleteLOSMarker}
                  onSyncSilhouettes={syncHitboxSilhouettes}
                />
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

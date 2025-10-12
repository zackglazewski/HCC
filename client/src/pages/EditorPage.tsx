import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useCardState } from '../editor/state'
import { TemplateSelector } from '../editor/TemplateSelector'
import type { General } from '../editor/types'
import { EditorCanvas } from '../editor/Canvas'
import { ImageSidebar } from '../editor/ImageSidebar'
import { PowersEditor } from '../editor/PowersEditor'
import { CustomThemePanel, type CustomTheme } from '../editor/CustomThemePanel'
import { createCard, getCard, patchCard, postImage, postPower, patchPower, patchImage, deleteImageApi, listThemes, createTheme, deleteTheme } from '../lib/api'
import { DEFAULT_CARD } from '../editor/types'

function Header({ saving }: { saving: boolean }) {
  const { isAuthenticated, loginWithRedirect, loginWithPopup, logout, user, isLoading } = useAuth0()
  return (
    <header className="header-glass px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/projects" className="flex items-center gap-2 text-slate-900 hover:text-blue-600 transition-colors group">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="font-semibold">Projects</span>
          </Link>
          <div className="h-6 w-px bg-slate-200"></div>
          <div className="flex items-center gap-2">
            {saving ? (
              <>
                <div className="spinner"></div>
                <span className="text-sm text-slate-500">Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-slate-500">All changes saved</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && isAuthenticated && (
            <div className="flex items-center gap-3">
              {user?.picture && (
                <img src={user.picture} className="w-8 h-8 rounded-full ring-2 ring-slate-200" alt={user?.name} />
              )}
              <span className="text-sm font-medium text-slate-700">{user?.name}</span>
              <button
                className="btn-secondary text-sm py-1.5 px-3"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              >
                Log out
              </button>
            </div>
          )}
          {!isLoading && !isAuthenticated && (
            <button
              className="btn-primary text-sm py-1.5 px-4"
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
      </div>
    </header>
  )
}

export default function EditorPage() {
  const params = useParams()
  const nav = useNavigate()
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const { card, saving, setTitle, setGeneral, updateField, addImage, updateImage, deleteImage, reorderImage, setCard, resetToDefaults } = useCardState()
  const location = useLocation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cardId = params.id ? parseInt(params.id) : null
  const [loading, setLoading] = useState<boolean>(!!cardId)
  const [customTheme, setCustomTheme] = useState<CustomTheme>({ primary: '#3080ff', secondary: '#88aacc', background: '#556677' })
  const [savedThemes, setSavedThemes] = useState<{ id: number; name: string; primary_hex: string; secondary_hex: string; background_hex: string }[]>([])
  const promotionRef = useRef(false)

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
        const token = await getAccessTokenSilently().catch(() => null)
        const server = await getCard(cardId, token)
        // Convert server images to object URLs
        const images = (server.images || []).map((im) => {
          let dataUrl = ''
          if (im.blob && Array.isArray(im.blob.data)) {
            const u8 = new Uint8Array(im.blob.data)
            const blob = new Blob([u8])
            dataUrl = URL.createObjectURL(blob)
          }
          return { id: crypto.randomUUID(), name: im.name || undefined, dataUrl, x: im.x, y: im.y, scale: im.scale, rotation: im.rotation ?? null, order: im.order, remoteId: im.id }
        })

        // Merge powers: always provide 4 rows (orders 0..3).
        const serverPowers = (server.powers || []).map((p) => ({ id: String(p.id), order: p.order, heading: p.heading, body: p.body, remoteId: p.id } as any))
        const basePowers = (card.powers && card.powers.length > 0 ? card.powers : DEFAULT_CARD.powers)
        const mergedPowers = [0,1,2,3].map((ord) => {
          const fromServer: any = serverPowers.find((p: any) => p.order === ord)
          if (fromServer) return fromServer
          const fromBase = basePowers.find((p) => p.order === ord)
          return fromBase ? fromBase : ({ id: crypto.randomUUID(), order: ord, heading: '', body: '' } as any)
        })
        const pick = (sv: string | null | undefined, lv: string) => (sv && sv.length ? sv : lv)
        const nextCard = {
          ...card,
          id: server.id,
          title: server.title || card.title,
          general: (server.general as any) || card.general || 'vydar',
          fields: {
            ...card.fields,
            cardName: pick(server.card_name, card.fields.cardName),
            tribeName: pick(server.tribe_name, card.fields.tribeName),
            species: pick(server.species, card.fields.species),
            uniqueness: pick(server.uniqueness, card.fields.uniqueness),
            class: pick(server.class, card.fields.class),
            personality: pick(server.personality, card.fields.personality),
            size: pick(server.size, card.fields.size),
            life: pick(server.life, card.fields.life),
            move: pick(server.move, card.fields.move),
            range: pick(server.range, card.fields.range),
            attack: pick(server.attack, card.fields.attack),
            defense: pick(server.defense, card.fields.defense),
            points: pick(server.points, card.fields.points),
          },
          powers: mergedPowers,
          images,
        }
        setCard(nextCard)
        // Load custom theme if present on server; otherwise fall back to localStorage
        if ((server.general as any) === 'custom') {
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
      } catch (e) {
        // swallow errors, but keep autosave loop
        console.warn('Autosave failed', e)
      }
    }
    timer = window.setTimeout(save, 1000)
    return () => { if (timer) window.clearTimeout(timer) }
  }, [card, customTheme, isAuthenticated, getAccessTokenSilently])

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
    const token = await getAccessTokenSilently().catch(() => null)
    const created = await createCard({ title: card.title, general: card.general }, token)
    setCard({ ...card, id: created.id })
    if (navigateToEditor) nav(`/editor/${created.id}`)
    return created.id
  }

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
    <div className="h-screen flex flex-col overflow-hidden">
      <Header saving={saving} />
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="spinner mb-4"></div>
            <p className="text-slate-500">Loading card...</p>
          </div>
        </div>
      ) : (
        <main className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
              <input
                className="text-2xl font-bold text-slate-900 outline-none flex-1 bg-transparent placeholder:text-slate-400 focus:text-blue-600 transition-colors"
                placeholder="Untitled Card"
                value={card.title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={async (e) => {
                  if (isAuthenticated && card.id) {
                    const token = await getAccessTokenSilently().catch(() => null)
                    try { await patchCard(card.id, { title: e.target.value }, token) } catch {}
                  }
                }}
              />
              <TemplateSelector
                value={card.general}
                onChange={async (g: General) => {
                  setGeneral(g)
                  if (isAuthenticated && card.id) {
                    const token = await getAccessTokenSilently().catch(() => null)
                    try {
                      await patchCard(card.id, { general: g }, token)
                    } catch {}
                  }
                }}
              />
            </div>
            <div className="flex-1 flex min-h-0 overflow-hidden">
              <ImageSidebar
                images={card.images}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                onUpload={(dataUrl, name) => {
                  const newId = crypto.randomUUID()
                  // add locally immediately for responsiveness
                  addImage(dataUrl, name, newId)
                  setSelectedId(newId)
                  // persist to server if signed in
                  ;(async () => {
                    if (!isAuthenticated) return
                    const ensureId = await ensureRemoteCard(false)
                    if (!ensureId) return
                    const layer = card.images.find((i) => i.id === newId) || { id: newId, name, dataUrl, x: 980, y: 550, scale: 1, rotation: null, order: (card.images.length ? Math.max(...card.images.map(i=>i.order))+1 : 0) } as any
                    const token = await getAccessTokenSilently().catch(() => null)
                    try {
                      const created = await postImage(ensureId, layer as any, token)
                      // attach remoteId + canonical order
                      setCard((prev) => ({
                        ...prev,
                        images: prev.images.map((im) => im.id === newId ? { ...im, order: created.order, remoteId: created.id } : im)
                      }))
                    } catch {}
                  })()
                }}
                onDelete={handleDeleteImage}
                onReorderList={(ids) => {
                  // Reassign orders based on new ids sequence
                  const orderMap = new Map<string, number>()
                  ids.forEach((id, idx) => orderMap.set(id, idx))
                  setCard((prev) => ({
                    ...prev,
                    images: prev.images.map((im) => orderMap.has(im.id) ? { ...im, order: orderMap.get(im.id)! } : im)
                  }))
                  // Persist orders when signed in
                  if (isAuthenticated && card.id) {
                    ;(async () => {
                      const token = await getAccessTokenSilently().catch(() => null)
                      try {
                        const imagesToPatch = card.images.filter((im) => (im as any).remoteId)
                        await Promise.all(imagesToPatch.map((im) => patchImage(card.id!, (im as any).remoteId, { order: orderMap.get(im.id) ?? im.order }, token)))
                      } catch {}
                    })()
                  }
                }}
                onScale={(id, delta) => {
                  const layer = card.images.find((i) => i.id === id)
                  if (!layer) return
                  const next = Math.max(0.05, layer.scale + delta)
                  updateImage(id, { scale: next })
                  if (isAuthenticated && card.id && (layer as any).remoteId) {
                    ;(async () => {
                      const token = await getAccessTokenSilently().catch(() => null)
                      try { await patchImage(card.id!, (layer as any).remoteId, { scale: next }, token) } catch {}
                    })()
                  }
                }}
                onNudge={(id, dx, dy) => {
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
                }}
              />
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
              />
              <div className="w-96 sidebar-modern p-6 space-y-6 overflow-y-auto h-full min-h-0">
                {card.general === 'custom' && (
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
                )}
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Attributes
                  </h3>
                  <div className="space-y-3">
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
                      ['points', 'Points'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
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
                  </div>
                </section>
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
                      // attach remoteId using functional update to avoid stale state
                      setCard((prev) => ({
                        ...prev,
                        powers: prev.powers.map((x) => (x.id === p.id ? ({ ...x, remoteId: created.id } as any) : x)),
                      }))
                    }
                  }}
                />
              </div>
            </div>
            <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={() => {
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
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export PNG
                </button>
                {isAuthenticated && !card.id && (
                  <button className="btn-secondary flex items-center gap-2" onClick={() => { void ensureRemoteCard() }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save to Account
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Press arrow keys to nudge selected image • Shift + arrow for larger steps
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

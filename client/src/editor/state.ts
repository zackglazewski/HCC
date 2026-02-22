import { useEffect, useRef, useState } from 'react'
import { CardState, DEFAULT_CARD, ImageLayer, HitboxState, HitboxSilhouette, LOSMarker } from './types'

const LOCAL_KEY = 'hcc:card'

export function useCardState() {
  const [card, setCard] = useState<CardState>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      const parsed = raw ? (JSON.parse(raw) as CardState) : DEFAULT_CARD
      if (!parsed.powers || parsed.powers.length === 0) {
        parsed.powers = [...DEFAULT_CARD.powers]
      }
      return parsed
    } catch {
      return DEFAULT_CARD
    }
  })
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    // Ensure powers exist if legacy saved state lacked them
    if (!card.powers || card.powers.length === 0) {
      setCard((c) => ({ ...c, powers: [...DEFAULT_CARD.powers] }))
      return
    }
    // debounce local save
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setSaving(true)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(card))
      setSaving(false)
    }, 600)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [card])

  function updateField<K extends keyof CardState['fields']>(key: K, value: string) {
    setCard((c) => ({ ...c, fields: { ...c.fields, [key]: value } }))
  }
  function setTitle(title: string) {
    setCard((c) => ({ ...c, title }))
  }
  function setGeneral(general: CardState['general']) {
    setCard((c) => ({ ...c, general }))
  }
  function addImage(dataUrl: string, name?: string, givenId?: string) {
    setCard((c) => {
      const order = c.images.length ? Math.max(...c.images.map((i) => i.order)) + 1 : 0
      const layer: ImageLayer = {
        id: givenId || crypto.randomUUID(),
        name,
        dataUrl,
        x: 980,
        y: 550,
        scale: 1,
        rotation: null,
        order,
      }
      return { ...c, images: [...c.images, layer] }
    })
  }
  function updateImage(id: string, patch: Partial<ImageLayer>) {
    setCard((c) => ({ ...c, images: c.images.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  }
  function deleteImage(id: string) {
    setCard((c) => ({ ...c, images: c.images.filter((i) => i.id !== id) }))
  }
  function reorderImage(id: string, dir: 'up' | 'down') {
    setCard((c) => {
      const sorted = [...c.images].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex((i) => i.id === id)
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return c
      const tmp = sorted[idx].order
      sorted[idx].order = sorted[swapIdx].order
      sorted[swapIdx].order = tmp
      return { ...c, images: sorted }
    })
  }

  function resetToDefaults() {
    const fresh: CardState = JSON.parse(JSON.stringify(DEFAULT_CARD))
    setCard(fresh)
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(fresh)) } catch {}
  }

  const DEFAULT_HITBOX: HitboxState = { silhouettes: [], losMarkers: [] }

  function migrateHitbox(h: any): HitboxState {
    if (!h) return { ...DEFAULT_HITBOX }
    const sils: HitboxSilhouette[] = h.silhouettes || []
    const firstImageId = sils.length > 0 ? sils[0].imageId : ''

    // Migrate legacy single losMarker to losMarkers array
    if ('losMarker' in h && h.losMarker && !h.losMarkers) {
      const old = h.losMarker as { x: number; y: number }
      const firstSil = sils[0]
      const offsetX = firstSil ? old.x - firstSil.x : old.x
      const offsetY = firstSil ? old.y - firstSil.y : old.y
      return { silhouettes: sils, losMarkers: [{ id: crypto.randomUUID(), imageId: firstImageId, offsetX, offsetY, radius: h.losRadius ?? 8 }] }
    }

    // Migrate old losMarkers that lack imageId (absolute x/y → offsets)
    let markers: LOSMarker[] = h.losMarkers || []
    if (markers.length > 0 && !(markers[0] as any).imageId) {
      const firstSil = sils[0]
      markers = markers.map((m: any) => ({
        id: m.id || crypto.randomUUID(),
        imageId: firstImageId,
        offsetX: firstSil ? m.x - firstSil.x : m.x,
        offsetY: firstSil ? m.y - firstSil.y : m.y,
        radius: m.radius ?? 8,
      }))
    }

    // Strip legacy losRadius field
    return { silhouettes: sils, losMarkers: markers }
  }

  function updateHitbox(patch: Partial<HitboxState>) {
    setCard((c) => ({ ...c, hitbox: { ...migrateHitbox(c.hitbox), ...patch } }))
  }

  function updateSilhouette(imageId: string, patch: Partial<HitboxSilhouette>) {
    setCard((c) => {
      const hitbox = migrateHitbox(c.hitbox)
      return {
        ...c,
        hitbox: {
          ...hitbox,
          silhouettes: hitbox.silhouettes.map((s) => (s.imageId === imageId ? { ...s, ...patch } : s)),
        },
      }
    })
  }

  function addLOSMarker(imageId: string, offsetX: number, offsetY: number) {
    setCard((c) => {
      const hitbox = migrateHitbox(c.hitbox)
      const marker: LOSMarker = { id: crypto.randomUUID(), imageId, offsetX, offsetY, radius: 20 }
      return { ...c, hitbox: { ...hitbox, losMarkers: [...hitbox.losMarkers, marker] } }
    })
  }

  function updateLOSMarker(id: string, patch: Partial<LOSMarker>) {
    setCard((c) => {
      const hitbox = migrateHitbox(c.hitbox)
      return { ...c, hitbox: { ...hitbox, losMarkers: hitbox.losMarkers.map((m) => m.id === id ? { ...m, ...patch } : m) } }
    })
  }

  function deleteLOSMarker(id: string) {
    setCard((c) => {
      const hitbox = migrateHitbox(c.hitbox)
      return { ...c, hitbox: { ...hitbox, losMarkers: hitbox.losMarkers.filter((m) => m.id !== id) } }
    })
  }

  // Auto-sync: ensure hitbox silhouettes exist for all images (non-destructive, preserves positions/masks)
  useEffect(() => {
    setCard((c) => {
      if (c.images.length === 0) return c
      const hitbox = migrateHitbox(c.hitbox)
      const imageIds = new Set(c.images.map((i) => i.id))
      const existingIds = new Set(hitbox.silhouettes.map((s) => s.imageId))
      const missing = c.images.filter((i) => !existingIds.has(i.id))
      const stale = hitbox.silhouettes.filter((s) => !imageIds.has(s.imageId))
      if (missing.length === 0 && stale.length === 0) return c
      const kept = hitbox.silhouettes.filter((s) => imageIds.has(s.imageId))
      const added: HitboxSilhouette[] = missing.map((i) => ({ imageId: i.id, x: 250, y: 250, scale: 1, grayMaskDataUrl: null }))
      return { ...c, hitbox: { ...hitbox, silhouettes: [...kept, ...added] } }
    })
  }, [card.images])

  function syncHitboxSilhouettes() {
    setCard((c) => {
      const hitbox = migrateHitbox(c.hitbox)
      const imageIds = new Set(c.images.map((i) => i.id))
      // Keep existing silhouettes that still have images
      const kept = hitbox.silhouettes.filter((s) => imageIds.has(s.imageId))
      const existingIds = new Set(kept.map((s) => s.imageId))
      // Add missing silhouettes
      const added: HitboxSilhouette[] = c.images
        .filter((i) => !existingIds.has(i.id))
        .map((i) => ({ imageId: i.id, x: 250, y: 250, scale: 1, grayMaskDataUrl: null }))
      const all = [...kept, ...added]
      // Auto-arrange positions based on count
      const count = all.length
      if (count === 1) {
        all[0] = { ...all[0], x: 250, y: 250 }
      } else if (count > 1) {
        const padding = 40
        const totalW = 500 - padding * 2
        const step = totalW / count
        all.forEach((s, i) => {
          all[i] = { ...s, x: padding + step * i + step / 2, y: 250 }
        })
      }
      return { ...c, hitbox: { ...hitbox, silhouettes: all } }
    })
  }

  return {
    card,
    saving,
    setTitle,
    setGeneral,
    updateField,
    addImage,
    updateImage,
    deleteImage,
    reorderImage,
    setCard,
    resetToDefaults,
    updateHitbox,
    updateSilhouette,
    addLOSMarker,
    updateLOSMarker,
    deleteLOSMarker,
    syncHitboxSilhouettes,
  }
}

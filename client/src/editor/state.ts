import { useEffect, useRef, useState } from 'react'
import { CardState, DEFAULT_CARD, ImageLayer } from './types'

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
  }
}

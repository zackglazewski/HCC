import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CardState, ImageLayer } from './types'
import { renderText } from './text'
import { drawEmblem } from './emblems'
import { buildUnderlayLayer, buildOverlayLayer, hexToHsv } from './theme'
import type { CustomTheme } from './CustomThemePanel'

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export function EditorCanvas({
  card,
  selectedId,
  onSelect,
  onUpdateImage,
  onDeleteImage,
  customTheme,
}: {
  card: CardState
  selectedId?: string | null
  onSelect: (id: string | null) => void
  onUpdateImage: (id: string, patch: Partial<ImageLayer>) => void
  onDeleteImage?: (id: string) => void
  customTheme?: CustomTheme | null
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [underlay, setUnderlay] = useState<HTMLCanvasElement | null>(null)
  const [overlay, setOverlay] = useState<HTMLCanvasElement | null>(null)
  const underlayRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const cardRef = useRef<CardState>(card)
  const selectedRef = useRef<string | null>(selectedId || null)
  const updateImageRef = useRef(onUpdateImage)
  const deleteImageRef = useRef(onDeleteImage)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  // Live, uncommitted transforms for smooth drag/scale
  const liveOverridesRef = useRef<Map<string, { x?: number; y?: number; scale?: number }>>(new Map())

  const size = 1500
  const [display, setDisplay] = useState(750)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const bgPath = card.general === 'custom' ? '/assets/backgrounds/vydar.png' : `/assets/backgrounds/${card.general}.png`
        const [blank, mask, bg] = await Promise.all([
          loadImage('/assets/bases/blank.jpg'),
          loadImage('/assets/bases/mask.png'),
          loadImage(bgPath),
        ])
        if (canceled) return
        // Build separate underlay (masked background) and overlay (themed frame)
        const customHSV = (card.general === 'custom' && customTheme) ? {
          primary: hexToHsv(customTheme.primary),
          secondary: hexToHsv(customTheme.secondary),
          background: hexToHsv(customTheme.background),
        } : undefined
        const ul = buildUnderlayLayer({ blank, mask, background: bg }, card.general, customHSV as any)
        const ol = buildOverlayLayer({ blank, mask, background: bg }, card.general, customHSV as any)
        if (!canceled) {
          setUnderlay(ul); underlayRef.current = ul
          setOverlay(ol); overlayRef.current = ol
        }
      } catch (e) {
        console.error('theme layer build failed', e)
        if (!canceled) { setUnderlay(null); setOverlay(null); underlayRef.current = null; overlayRef.current = null }
      }
    })()
    return () => { canceled = true }
  }, [card.general, customTheme])

  

  // Ensure fonts are loaded before measuring/drawing
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // @ts-ignore
        if (document.fonts && document.fonts.ready) {
          const families = [
            'ScapeCondensedHeavy',
            'ScapeCondensedMedium',
            'ScapeCondensedBold',
            'ScapeCondensed',
            'ScapeCondensedLight',
            'ScapeBold',
          ]
          await Promise.all(
            families.map((f) =>
              // @ts-ignore
              document.fonts.load(`16px ${f}`)
            )
          )
          // @ts-ignore
          await document.fonts.ready
        }
      } catch {}
      if (mounted) setFontsReady(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  const sortedImages = useMemo(() => [...card.images].sort((a, b) => a.order - b.order), [card.images])
  useEffect(() => { cardRef.current = card }, [card])
  useEffect(() => { selectedRef.current = selectedId || null }, [selectedId])
  useEffect(() => { updateImageRef.current = onUpdateImage }, [onUpdateImage])
  useEffect(() => { deleteImageRef.current = onDeleteImage }, [onDeleteImage])

  const draw = useCallback(() => {
    const canvas = ref.current
    if (!canvas || !fontsReady) return
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    // @ts-ignore
    if (ctx.imageSmoothingQuality) (ctx as any).imageSmoothingQuality = 'high'
    const current = cardRef.current
    ctx.clearRect(0, 0, size, size)
    if (underlayRef.current) ctx.drawImage(underlayRef.current, 0, 0)
    const imgsSorted = [...current.images].sort((a, b) => a.order - b.order)
    for (const layer of imgsSorted) {
      const ov = liveOverridesRef.current.get(layer.id)
      const effX = ov?.x ?? layer.x
      const effY = ov?.y ?? layer.y
      const effScale = ov?.scale ?? layer.scale
      let img = imgCacheRef.current.get(layer.id)
      // if not cached or dataUrl changed, (re)load and cache
      if (!img || img.src !== layer.dataUrl) {
        img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = layer.dataUrl
        img.onload = () => { requestAnimationFrame(draw) }
        imgCacheRef.current.set(layer.id, img)
      }
      if (img.complete && img.naturalWidth > 0) {
        const w = img.naturalWidth * effScale
        const h = img.naturalHeight * effScale
        ctx.drawImage(img, effX - w / 2, effY - h / 2, w, h)
      }
    }
    if (overlayRef.current) ctx.drawImage(overlayRef.current, 0, 0)
    renderText(ctx, current)
    drawEmblem(ctx, current.general)
    // Hasbro trademark/copyright notice (matching reference implementation)
    ctx.save()
    ctx.font = '20px ScapeCondensedLight'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ;(ctx as any).letterSpacing = 0
    ctx.fillStyle = '#666'
    ctx.fillText('HEROSCAPE and all related characters are trademarks of Hasbro. © 2006 Hasbro. All Rights Reserved.', 750, 1495)
    ctx.restore()
    // selection overlay
    const sid = selectedRef.current
    if (sid) {
      const layer = current.images.find((l) => l.id === sid)
      if (layer) {
        const img = imgCacheRef.current.get(layer.id)
        if (img && img.complete && img.naturalWidth > 0) {
          const ov = liveOverridesRef.current.get(layer.id)
          const effX = ov?.x ?? layer.x
          const effY = ov?.y ?? layer.y
          const effScale = ov?.scale ?? layer.scale
          const w = img.naturalWidth * effScale
          const h = img.naturalHeight * effScale
          const x = effX - w / 2
          const y = effY - h / 2
          ctx.save()
          ctx.strokeStyle = 'rgba(0,0,0,0.7)'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.strokeRect(x, y, w, h)
          ctx.setLineDash([])
          const hs = 18
          const handles = [
            { x: x, y: y },
            { x: x + w / 2 - hs / 2, y: y },
            { x: x + w - hs, y: y },
            { x: x + w - hs, y: y + h / 2 - hs / 2 },
            { x: x + w - hs, y: y + h - hs },
            { x: x + w / 2 - hs / 2, y: y + h - hs },
            { x: x, y: y + h - hs },
            { x: x, y: y + h / 2 - hs / 2 },
          ]
          for (const hdl of handles) {
            ctx.fillStyle = '#fff'
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'
            ctx.lineWidth = 2
            ctx.fillRect(hdl.x, hdl.y, hs, hs)
            ctx.strokeRect(hdl.x, hdl.y, hs, hs)
          }
          ctx.restore()
        }
      }
    }
  }, [fontsReady])

  // draw when base/image/text state change
  useEffect(() => { draw() }, [draw, underlay, overlay, card, selectedId])

  // Keyboard nudge for selected image (arrow keys)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const sid = selectedRef.current
      if (!sid) return
      // ignore when typing in inputs
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as any).isContentEditable)) return
      let dx = 0, dy = 0
      const step = e.shiftKey ? 10 : 2
      if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (deleteImageRef.current) deleteImageRef.current(sid)
        onSelect(null)
        return
      }
      else return
      e.preventDefault()
      const current = cardRef.current
      const layer = current.images.find((l) => l.id === sid)
      if (!layer) return
      updateImageRef.current(layer.id, { x: layer.x + dx, y: layer.y + dy })
      requestAnimationFrame(draw)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draw])

  // Drag/move/resize interactions (stable listeners)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let dragging = false
    let resizing: null | { handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'; startScale: number; startDx: number; startDy: number; startR: number } = null
    let startX = 0
    let startY = 0
    let startLayer: ImageLayer | null = null
    const getMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = (e.clientX - rect.left) * (size / display)
      const sy = (e.clientY - rect.top) * (size / display)
      return { x: sx, y: sy }
    }
    const getTouch = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const t = e.touches[0] || e.changedTouches[0]
      const sx = (t.clientX - rect.left) * (size / display)
      const sy = (t.clientY - rect.top) * (size / display)
      return { x: sx, y: sy }
    }
    function hitHandle(layer: ImageLayer, px: number, py: number): null | { handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'; x: number; y: number; w: number; h: number } {
      const img = imgCacheRef.current.get(layer.id)
      if (!img || !img.complete || img.naturalWidth === 0) return null
      const ov = liveOverridesRef.current.get(layer.id)
      const effScale = ov?.scale ?? layer.scale
      const effX = ov?.x ?? layer.x
      const effY = ov?.y ?? layer.y
      const w = img.naturalWidth * effScale
      const h = img.naturalHeight * effScale
      const x = effX - w / 2
      const y = effY - h / 2
      const hs = 18
      const boxes = [
        { handle: 'nw' as const, x: x, y: y },
        { handle: 'n' as const, x: x + w / 2 - hs / 2, y: y },
        { handle: 'ne' as const, x: x + w - hs, y: y },
        { handle: 'e' as const, x: x + w - hs, y: y + h / 2 - hs / 2 },
        { handle: 'se' as const, x: x + w - hs, y: y + h - hs },
        { handle: 's' as const, x: x + w / 2 - hs / 2, y: y + h - hs },
        { handle: 'sw' as const, x: x, y: y + h - hs },
        { handle: 'w' as const, x: x, y: y + h / 2 - hs / 2 },
      ]
      for (const b of boxes) {
        if (px >= b.x && px <= b.x + hs && py >= b.y && py <= b.y + hs) return { handle: b.handle, x: b.x, y: b.y, w: hs, h: hs }
      }
      return null
    }
    function imageBox(layer: ImageLayer) {
      const img = imgCacheRef.current.get(layer.id)
      const ov = liveOverridesRef.current.get(layer.id)
      const effScale = ov?.scale ?? layer.scale
      const effX = ov?.x ?? layer.x
      const effY = ov?.y ?? layer.y
      const w = img && img.complete ? img.naturalWidth * effScale : 0
      const h = img && img.complete ? img.naturalHeight * effScale : 0
      return { x: effX - w / 2, y: effY - h / 2, w, h }
    }
    const onDown = (e: MouseEvent) => {
      const { x, y } = getMouse(e)
      // Prefer resize handles if clicking a selected layer's handle
      if (selectedRef.current) {
        const layer = cardRef.current.images.find((l) => l.id === selectedRef.current)
        if (layer) {
          const hh = hitHandle(layer, x, y)
          if (hh) {
            onSelect(layer.id)
            startX = x
            startY = y
            startLayer = { ...layer }
            const img = imgCacheRef.current.get(layer.id)
            if (img && img.complete) {
              const w = img.naturalWidth * layer.scale
              const h = img.naturalHeight * layer.scale
              const dx = Math.abs(x - layer.x)
              const dy = Math.abs(y - layer.y)
              resizing = { handle: hh.handle, startScale: layer.scale, startDx: Math.max(1, dx), startDy: Math.max(1, dy), startR: Math.sqrt((w/2)*(w/2) + (h/2)*(h/2)) }
              return
            }
          }
        }
      }
      // hit-test images from topmost for move/select
      const layers = [...cardRef.current.images].sort((a,b) => a.order - b.order).reverse()
      let found = false
      for (const layer of layers) {
        const { x: lx, y: ly, w, h } = imageBox(layer)
        if (w > 0 && h > 0 && x >= lx && x <= lx + w && y >= ly && y <= ly + h) {
          onSelect(layer.id)
          dragging = true
          startX = x
          startY = y
          startLayer = { ...layer }
          // seed live override with current position
          liveOverridesRef.current.set(layer.id, { x: layer.x, y: layer.y })
          found = true
          break
        }
      }
      if (!found) onSelect(null)
    }
    const onMove = (e: MouseEvent) => {
      const { x, y } = getMouse(e)
      if (resizing && startLayer) {
        // Uniform scaling; choose axis by handle
        const dx = Math.abs(x - startLayer.x)
        const dy = Math.abs(y - startLayer.y)
        let factor = 1
        switch (resizing.handle) {
          case 'n': case 's':
            factor = dy / Math.max(1, resizing.startDy)
            break
          case 'e': case 'w':
            factor = dx / Math.max(1, resizing.startDx)
            break
          default: {
            const r0 = Math.max(1, resizing.startR)
            const rx = dx
            const ry = dy
            const r = Math.sqrt(rx*rx + ry*ry)
            factor = r / r0
          }
        }
        const newScale = Math.max(0.05, resizing.startScale * factor)
        const ov = liveOverridesRef.current.get(startLayer.id) || {}
        ov.scale = newScale
        liveOverridesRef.current.set(startLayer.id, ov)
        // draw preview without committing to state
        requestAnimationFrame(draw)
        return
      }
      if (dragging && startLayer) {
        const dx = x - startX
        const dy = y - startY
        const ov = liveOverridesRef.current.get(startLayer.id) || {}
        ov.x = startLayer.x + dx
        ov.y = startLayer.y + dy
        liveOverridesRef.current.set(startLayer.id, ov)
        requestAnimationFrame(draw)
      }
    }
    const onUp = () => {
      const sid = startLayer?.id
      const ov = sid ? liveOverridesRef.current.get(sid) : undefined
      if (sid && ov) {
        // commit final values and clear preview
        updateImageRef.current(sid, { ...(ov.x !== undefined ? { x: ov.x } : {}), ...(ov.y !== undefined ? { y: ov.y } : {}), ...(ov.scale !== undefined ? { scale: ov.scale } : {}) })
        liveOverridesRef.current.delete(sid)
      }
      dragging = false
      resizing = null
      startLayer = null
    }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // touch support
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      const { x, y } = getTouch(e)
      // Simulate mousedown logic
      // Prefer handles
      if (selectedRef.current) {
        const layer = cardRef.current.images.find((l) => l.id === selectedRef.current)
        if (layer) {
          const hh = hitHandle(layer, x, y)
          if (hh) {
            onSelect(layer.id)
            startX = x; startY = y; startLayer = { ...layer }
            liveOverridesRef.current.set(layer.id, { x: layer.x, y: layer.y })
            const img = imgCacheRef.current.get(layer.id)
            if (img && img.complete) {
              const w = img.naturalWidth * layer.scale
              const h = img.naturalHeight * layer.scale
              const dx = Math.abs(x - layer.x)
              const dy = Math.abs(y - layer.y)
              resizing = { handle: hh.handle, startScale: layer.scale, startDx: Math.max(1, dx), startDy: Math.max(1, dy), startR: Math.sqrt((w/2)*(w/2) + (h/2)*(h/2)) }
              return
            }
          }
        }
      }
      const layers = [...cardRef.current.images].sort((a,b) => a.order - b.order).reverse()
      let found = false
      for (const layer of layers) {
        const { x: lx, y: ly, w, h } = imageBox(layer)
        if (w > 0 && h > 0 && x >= lx && x <= lx + w && y >= ly && y <= ly + h) {
          onSelect(layer.id)
          dragging = true
          startX = x; startY = y; startLayer = { ...layer }
          found = true
          break
        }
      }
      if (!found) onSelect(null)
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const { x, y } = getTouch(e)
      if (resizing && startLayer) {
        const dx = Math.abs(x - startLayer.x)
        const dy = Math.abs(y - startLayer.y)
        let factor = 1
        switch (resizing.handle) {
          case 'n': case 's': factor = dy / Math.max(1, resizing.startDy); break
          case 'e': case 'w': factor = dx / Math.max(1, resizing.startDx); break
          default: {
            const r0 = Math.max(1, resizing.startR)
            const r = Math.sqrt(dx*dx + dy*dy)
            factor = r / r0
          }
        }
        const newScale = Math.max(0.05, resizing.startScale * factor)
        const ov = liveOverridesRef.current.get(startLayer.id) || {}
        ov.scale = newScale
        liveOverridesRef.current.set(startLayer.id, ov)
        requestAnimationFrame(draw)
        return
      }
      if (dragging && startLayer) {
        const dx = x - startX
        const dy = y - startY
        const ov = liveOverridesRef.current.get(startLayer.id) || {}
        ov.x = startLayer.x + dx
        ov.y = startLayer.y + dy
        liveOverridesRef.current.set(startLayer.id, ov)
        requestAnimationFrame(draw)
      }
    }
    const onTouchEnd = () => {
      const sid = startLayer?.id
      const ov = sid ? liveOverridesRef.current.get(sid) : undefined
      if (sid && ov) {
        updateImageRef.current(sid, { ...(ov.x !== undefined ? { x: ov.x } : {}), ...(ov.y !== undefined ? { y: ov.y } : {}), ...(ov.scale !== undefined ? { scale: ov.scale } : {}) })
        liveOverridesRef.current.delete(sid)
      }
      dragging = false; resizing = null; startLayer = null
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('touchstart', onTouchStart as any)
      window.removeEventListener('touchmove', onTouchMove as any)
      window.removeEventListener('touchend', onTouchEnd as any)
    }
  }, [onSelect, draw])

  // Resize canvas display size to fit available container space
  useEffect(() => {
    function recalc() {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // Fit within the container, keep square, cap at 750px
      const next = Math.max(300, Math.min(750, Math.floor(Math.min(rect.width, rect.height))))
      setDisplay(next)
    }
    recalc()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => recalc())
      ro.observe(containerRef.current)
    } else {
      window.addEventListener('resize', recalc)
    }
    return () => {
      if (ro && containerRef.current) ro.unobserve(containerRef.current)
      window.removeEventListener('resize', recalc)
    }
  }, [])

  return (
    <div ref={containerRef} className="flex-1 flex items-center justify-center bg-neutral-200 min-h-0 overflow-hidden">
      <canvas ref={ref} width={size} height={size} style={{ width: display, height: display, background: '#fff' }} />
    </div>
  )
}

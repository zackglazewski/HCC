import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardState, HitboxSilhouette, LOSMarker } from './types'
import { HITBOX_WORK_SIZE, buildHitboxMask, compositeHitboxSilhouette } from './hitbox'
import type { HitboxMaskInfo } from './hitbox'

type Tool = 'paint' | 'erase' | 'los' | 'move'

const HITBOX_PAD_X = 240
const HITBOX_PAD_Y = 140
const HITBOX_CANVAS_W = HITBOX_WORK_SIZE + 2 * HITBOX_PAD_X
const HITBOX_CANVAS_H = HITBOX_WORK_SIZE + 2 * HITBOX_PAD_Y

function fitDimensions(nw: number, nh: number, cap: number): [number, number] {
  if (nw <= cap && nh <= cap) return [nw, nh]
  const ratio = Math.min(cap / nw, cap / nh)
  return [Math.round(nw * ratio), Math.round(nh * ratio)]
}

export function HitboxEditor({
  card,
  onUpdateSilhouette,
  onAddLOSMarker,
  onUpdateLOSMarker,
  onDeleteLOSMarker,
  onSyncSilhouettes,
}: {
  card: CardState
  onUpdateSilhouette: (imageId: string, patch: Partial<HitboxSilhouette>) => void
  onAddLOSMarker: (imageId: string, offsetX: number, offsetY: number) => void
  onUpdateLOSMarker: (id: string, patch: Partial<LOSMarker>) => void
  onDeleteLOSMarker: (id: string) => void
  onSyncSilhouettes: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [display, setDisplay] = useState(400)
  const [tool, setTool] = useState<Tool>('move')
  const [brushSize, setBrushSize] = useState(20)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [localScale, setLocalScale] = useState(1)
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const maskCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const paintingRef = useRef(false)
  const movingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizingRef = useRef<null | { handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'; startScale: number; startDx: number; startDy: number; startR: number }>(null)
  const losDraggingRef = useRef<{ id: string; startX: number; startY: number; origOffX: number; origOffY: number } | null>(null)
  const [selectedLOSId, setSelectedLOSId] = useState<string | null>(null)
  const hitboxMaskRef = useRef<HitboxMaskInfo | null>(null)
  // Viewport: pan & zoom
  const [vpZoom, setVpZoom] = useState(1)
  const [vpPanX, setVpPanX] = useState(0)
  const [vpPanY, setVpPanY] = useState(0)
  const panningRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number; startDist?: number; origZoom?: number } | null>(null)
  const spaceHeldRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panLock, setPanLock] = useState(false)
  const [showTips, setShowTips] = useState(false)

  const hitbox = card.hitbox || { silhouettes: [], losMarkers: [] }
  const silhouettes = hitbox.silhouettes
  const activeSilhouettes = silhouettes.filter((s) => !s.disabled)
  const losMarkers: LOSMarker[] = hitbox.losMarkers ?? []

  // Track space key for pan override
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { spaceHeldRef.current = true; setSpaceHeld(true) } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceHeldRef.current = false; setSpaceHeld(false) } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Load mask.png and build hitbox mask for editor clipping
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      hitboxMaskRef.current = buildHitboxMask(img)
      draw()
    }
    img.src = '/assets/bases/mask.png'
  }, [])

  // Silhouettes are auto-synced by useCardState when images change

  // Auto-select first active silhouette if none selected
  useEffect(() => {
    if (activeSilhouettes.length > 0 && (!selectedImageId || !activeSilhouettes.find((s) => s.imageId === selectedImageId))) {
      setSelectedImageId(activeSilhouettes[0].imageId)
    }
  }, [activeSilhouettes, selectedImageId])

  // Keep scale slider in sync with selected silhouette
  useEffect(() => {
    if (!selectedImageId) return
    const sil = silhouettes.find((s) => s.imageId === selectedImageId)
    if (sil) setLocalScale(sil.scale)
  }, [selectedImageId, silhouettes])

  // Initialize mask canvases from saved state
  useEffect(() => {
    for (const sil of silhouettes) {
      if (sil.grayMaskDataUrl && !maskCanvasesRef.current.has(sil.imageId)) {
        const img = new Image()
        img.onload = () => {
          const mc = document.createElement('canvas')
          mc.width = img.naturalWidth
          mc.height = img.naturalHeight
          mc.getContext('2d')!.drawImage(img, 0, 0, mc.width, mc.height)
          maskCanvasesRef.current.set(sil.imageId, mc)
          draw()
        }
        img.src = sil.grayMaskDataUrl
      }
    }
  }, [silhouettes])

  // Resize display
  useEffect(() => {
    function recalc() {
      const el = containerRef.current
      if (!el) return
      const w = el.getBoundingClientRect().width
      setDisplay(Math.max(200, Math.min(500, Math.floor(w))))
    }
    recalc()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(recalc)
      ro.observe(containerRef.current)
    }
    return () => { if (ro) ro.disconnect() }
  }, [])

  // Attach native touch listeners with { passive: false } so preventDefault works
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onStart = (e: TouchEvent) => { e.preventDefault(); handlePointerDown(e as unknown as React.TouchEvent) }
    const onMove = (e: TouchEvent) => { e.preventDefault(); handlePointerMove(e as unknown as React.TouchEvent) }
    const onEnd = () => { handlePointerUp() }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.04 : 1 / 1.04
      setVpZoom((z) => Math.max(0.3, Math.min(5, z * factor)))
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('wheel', onWheel)
    }
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, HITBOX_CANVAS_W, HITBOX_CANVAS_H)

    // Black background + viewport transform into work area
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, HITBOX_CANVAS_W, HITBOX_CANVAS_H)
    ctx.save()
    ctx.translate(HITBOX_CANVAS_W / 2, HITBOX_CANVAS_H / 2)
    ctx.scale(vpZoom, vpZoom)
    ctx.translate(-HITBOX_WORK_SIZE / 2 + vpPanX, -HITBOX_WORK_SIZE / 2 + vpPanY)

    // Draw each active silhouette (content only — UI overlays come after mask clip)
    for (const sil of activeSilhouettes) {
      const imgData = card.images.find((i) => i.id === sil.imageId)
      if (!imgData) continue

      let img = imgCacheRef.current.get(sil.imageId)
      if (!img || (img.src !== imgData.dataUrl && !img.src.startsWith('blob:'))) {
        img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = imgData.dataUrl
        img.onload = () => draw()
        imgCacheRef.current.set(sil.imageId, img)
      }
      if (!img.complete || img.naturalWidth === 0) continue

      const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
      const maskCanvas = maskCanvasesRef.current.get(sil.imageId) || null
      const mask = maskCanvas ? ensureMaskCanvas(sil.imageId, fw, fh) : null

      const comp = compositeHitboxSilhouette(img, mask, fw, fh)
      const drawW = fw * sil.scale
      const drawH = fh * sil.scale
      ctx.drawImage(comp, sil.x - drawW / 2, sil.y - drawH / 2, drawW, drawH)
    }

    // Clip to exact mask shape (matches final card)
    const mi = hitboxMaskRef.current
    if (mi) {
      const { bbox, scale: mapScale, mask } = mi
      const bboxW = Math.max(1, bbox.maxX - bbox.minX)
      const bboxH = Math.max(1, bbox.maxY - bbox.minY)
      const mapBaseX = bbox.minX + (bboxW - HITBOX_WORK_SIZE * mapScale) / 2
      const mapBaseY = bbox.minY + (bboxH - HITBOX_WORK_SIZE * mapScale) / 2
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, -mapBaseX / mapScale, -mapBaseY / mapScale, 1500 / mapScale, 1500 / mapScale)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()

    // --- UI overlays (drawn after mask clip so they're always visible) ---
    ctx.save()
    ctx.translate(HITBOX_CANVAS_W / 2, HITBOX_CANVAS_H / 2)
    ctx.scale(vpZoom, vpZoom)
    ctx.translate(-HITBOX_WORK_SIZE / 2 + vpPanX, -HITBOX_WORK_SIZE / 2 + vpPanY)

    for (const sil of activeSilhouettes) {
      if (sil.imageId !== selectedImageId) continue
      const imgData = card.images.find((i) => i.id === sil.imageId)
      if (!imgData) continue
      const img = imgCacheRef.current.get(sil.imageId)
      if (!img || !img.complete || img.naturalWidth === 0) continue
      const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
      const drawW = fw * sil.scale
      const drawH = fh * sil.scale

      ctx.save()
      // Dark outline underneath for contrast
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(sil.x - drawW / 2, sil.y - drawH / 2, drawW, drawH)
      // Bright outline on top
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(sil.x - drawW / 2, sil.y - drawH / 2, drawW, drawH)
      ctx.setLineDash([])
      if (tool === 'move') {
        const hs = 12
        const x = sil.x - drawW / 2
        const y = sil.y - drawH / 2
        const handles = [
          { x: x, y: y },
          { x: x + drawW / 2 - hs / 2, y: y },
          { x: x + drawW - hs, y: y },
          { x: x + drawW - hs, y: y + drawH / 2 - hs / 2 },
          { x: x + drawW - hs, y: y + drawH - hs },
          { x: x + drawW / 2 - hs / 2, y: y + drawH - hs },
          { x: x, y: y + drawH - hs },
          { x: x, y: y + drawH / 2 - hs / 2 },
        ]
        for (const hdl of handles) {
          ctx.shadowColor = 'rgba(0,0,0,0.6)'
          ctx.shadowBlur = 6
          ctx.fillStyle = '#3b82f6'
          ctx.fillRect(hdl.x, hdl.y, hs, hs)
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.strokeRect(hdl.x + 1, hdl.y + 1, hs - 2, hs - 2)
        }
      }
      ctx.restore()
    }

    // LOS markers (only for active silhouettes)
    for (const m of losMarkers) {
      const parent = activeSilhouettes.find((s) => s.imageId === m.imageId)
      if (!parent) continue
      const pScale = parent?.scale ?? 1
      const absX = parent ? parent.x + m.offsetX * pScale : m.offsetX
      const absY = parent ? parent.y + m.offsetY * pScale : m.offsetY
      const r = (m.radius ?? 8) * pScale
      ctx.beginPath()
      ctx.arc(absX, absY, r, 0, Math.PI * 2)
      ctx.fillStyle = '#00cc44'
      ctx.fill()
      if (m.id === selectedLOSId) {
        ctx.beginPath()
        ctx.arc(absX, absY, r + 3, 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [activeSilhouettes, losMarkers, selectedImageId, selectedLOSId, card.images, tool, vpZoom, vpPanX, vpPanY])

  useEffect(() => { draw() }, [draw])

  function getWorkCoords(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = HITBOX_CANVAS_W / rect.width
    const scaleY = HITBOX_CANVAS_H / rect.height
    let clientX: number, clientY: number
    if ('touches' in e) {
      const t = (e as React.TouchEvent).touches[0] || (e as React.TouchEvent).changedTouches[0]
      clientX = t.clientX
      clientY = t.clientY
    } else {
      clientX = (e as React.MouseEvent).clientX
      clientY = (e as React.MouseEvent).clientY
    }
    // Canvas pixel coords (independent scale per axis since display is rectangular)
    const cx = (clientX - rect.left) * scaleX
    const cy = (clientY - rect.top) * scaleY
    // Invert viewport transform: canvas center → zoom → pan → work coords
    const wx = (cx - HITBOX_CANVAS_W / 2) / vpZoom + HITBOX_WORK_SIZE / 2 - vpPanX
    const wy = (cy - HITBOX_CANVAS_H / 2) / vpZoom + HITBOX_WORK_SIZE / 2 - vpPanY
    return { x: wx, y: wy }
  }

  function ensureMaskCanvas(imageId: string, w: number, h: number): HTMLCanvasElement {
    let mc = maskCanvasesRef.current.get(imageId)
    if (!mc) {
      mc = document.createElement('canvas')
      mc.width = w
      mc.height = h
      maskCanvasesRef.current.set(imageId, mc)
      return mc
    }
    if (mc.width !== w || mc.height !== h) {
      const resized = document.createElement('canvas')
      resized.width = w
      resized.height = h
      resized.getContext('2d')!.drawImage(mc, 0, 0, w, h)
      maskCanvasesRef.current.set(imageId, resized)
      return resized
    }
    return mc
  }

  function paintAt(x: number, y: number) {
    if (!selectedImageId) return
    const sil = silhouettes.find((s) => s.imageId === selectedImageId)
    if (!sil) return

    const imgData = card.images.find((i) => i.id === selectedImageId)
    if (!imgData) return
    const img = imgCacheRef.current.get(selectedImageId)
    if (!img || !img.complete || img.naturalWidth === 0) return
    const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
    const drawW = fw * sil.scale
    const drawH = fh * sil.scale
    const localX = (x - (sil.x - drawW / 2)) / sil.scale
    const localY = (y - (sil.y - drawH / 2)) / sil.scale
    if (localX < 0 || localY < 0 || localX > fw || localY > fh) return

    const mc = ensureMaskCanvas(selectedImageId, fw, fh)
    const mctx = mc.getContext('2d')!

    if (tool === 'paint') {
      mctx.globalCompositeOperation = 'source-over'
      mctx.fillStyle = '#888888'
    } else {
      mctx.globalCompositeOperation = 'destination-out'
      mctx.fillStyle = '#000'
    }

    mctx.beginPath()
    mctx.arc(localX, localY, brushSize / Math.max(0.05, sil.scale), 0, Math.PI * 2)
    mctx.fill()
    mctx.globalCompositeOperation = 'source-over'
    draw()
  }

  function commitMask() {
    if (!selectedImageId) return
    const mc = maskCanvasesRef.current.get(selectedImageId)
    if (!mc) return
    const dataUrl = mc.toDataURL('image/png')
    onUpdateSilhouette(selectedImageId, { grayMaskDataUrl: dataUrl })
  }

  function hitHandle(sil: HitboxSilhouette, px: number, py: number): null | { handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'; x: number; y: number; w: number; h: number } {
    const imgData = card.images.find((i) => i.id === sil.imageId)
    if (!imgData) return null
    const img = imgCacheRef.current.get(sil.imageId)
    if (!img || !img.complete || img.naturalWidth === 0) return null
    const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
    const w = fw * sil.scale
    const h = fh * sil.scale
    const x = sil.x - w / 2
    const y = sil.y - h / 2
    const hs = 14
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

  function hitLOSMarker(px: number, py: number): LOSMarker | null {
    // Check in reverse so topmost wins (only active silhouettes)
    for (let i = losMarkers.length - 1; i >= 0; i--) {
      const m = losMarkers[i]
      const parent = activeSilhouettes.find((s) => s.imageId === m.imageId)
      if (!parent) continue
      const pScale = parent?.scale ?? 1
      const absX = parent ? parent.x + m.offsetX * pScale : m.offsetX
      const absY = parent ? parent.y + m.offsetY * pScale : m.offsetY
      const r = (m.radius ?? 8) * pScale
      const dx = px - absX
      const dy = py - absY
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return m
    }
    return null
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    // Space+click, middle-click, alt+click, or panLock to pan viewport
    if ('button' in e && (e.button === 1 || (e.button === 0 && (e.altKey || spaceHeldRef.current || panLock)))) {
      e.preventDefault()
      panningRef.current = { startX: e.clientX, startY: e.clientY, origPanX: vpPanX, origPanY: vpPanY }
      return
    }
    // Pan lock for single-finger touch
    if (panLock && 'touches' in e && (e as React.TouchEvent).touches.length === 1) {
      const t = (e as React.TouchEvent).touches[0]
      panningRef.current = { startX: t.clientX, startY: t.clientY, origPanX: vpPanX, origPanY: vpPanY }
      return
    }
    // Two-finger touch: pinch-to-zoom + pan
    if ('touches' in e && (e as React.TouchEvent).touches.length === 2) {
      const t = (e as React.TouchEvent).touches
      const mx = (t[0].clientX + t[1].clientX) / 2
      const my = (t[0].clientY + t[1].clientY) / 2
      const dist = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
      panningRef.current = { startX: mx, startY: my, origPanX: vpPanX, origPanY: vpPanY, startDist: dist, origZoom: vpZoom }
      return
    }

    const { x, y } = getWorkCoords(e)

    if (tool === 'los') {
      // Check if clicking on an existing marker to select/drag it
      const hit = hitLOSMarker(x, y)
      if (hit) {
        setSelectedLOSId(hit.id)
        losDraggingRef.current = { id: hit.id, startX: x, startY: y, origOffX: hit.offsetX, origOffY: hit.offsetY }
        return
      }
      // Otherwise add a new marker attached to selectedImageId
      if (!selectedImageId) return
      const sil = silhouettes.find((s) => s.imageId === selectedImageId)
      if (!sil) return
      // Normalize offset by silhouette scale so dots scale with parent
      const offsetX = (x - sil.x) / sil.scale
      const offsetY = (y - sil.y) / sil.scale
      onAddLOSMarker(selectedImageId, offsetX, offsetY)
      // Auto-select the new dot (will be the last marker after state updates)
      setSelectedLOSId(null) // clear; we'll select after re-render via effect
      return
    }

    if (tool === 'move') {
      if (selectedImageId) {
        const sel = silhouettes.find((s) => s.imageId === selectedImageId)
        if (sel) {
          const hh = hitHandle(sel, x, y)
          if (hh) {
            const img = imgCacheRef.current.get(sel.imageId)
            if (img && img.complete && img.naturalWidth > 0) {
              const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
              const w = fw * sel.scale
              const h = fh * sel.scale
              const dx = Math.abs(x - sel.x)
              const dy = Math.abs(y - sel.y)
              resizingRef.current = {
                handle: hh.handle,
                startScale: sel.scale,
                startDx: Math.max(1, dx),
                startDy: Math.max(1, dy),
                startR: Math.sqrt((w / 2) * (w / 2) + (h / 2) * (h / 2)),
              }
              return
            }
          }
        }
      }
      // Find silhouette under cursor (active only)
      for (let i = activeSilhouettes.length - 1; i >= 0; i--) {
        const sil = activeSilhouettes[i]
        const imgData = card.images.find((im) => im.id === sil.imageId)
        if (!imgData) continue
        const img = imgCacheRef.current.get(sil.imageId)
        if (!img || !img.complete || img.naturalWidth === 0) continue
        const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
        const dw = fw * sil.scale
        const dh = fh * sil.scale
        if (x >= sil.x - dw / 2 && x <= sil.x + dw / 2 && y >= sil.y - dh / 2 && y <= sil.y + dh / 2) {
          setSelectedImageId(sil.imageId)
          movingRef.current = { startX: x, startY: y, origX: sil.x, origY: sil.y }
          return
        }
      }
      // Clicked empty space on move tool — start viewport pan
      if ('clientX' in e) {
        panningRef.current = { startX: (e as React.MouseEvent).clientX, startY: (e as React.MouseEvent).clientY, origPanX: vpPanX, origPanY: vpPanY }
      } else if ('touches' in e) {
        const t = (e as React.TouchEvent).touches[0]
        panningRef.current = { startX: t.clientX, startY: t.clientY, origPanX: vpPanX, origPanY: vpPanY }
      }
      return
    }

    // Paint or erase
    paintingRef.current = true
    paintAt(x, y)
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    // Viewport panning + pinch-to-zoom
    if (panningRef.current) {
      let clientX: number
      let clientY: number
      let currentZoom = vpZoom
      if ('touches' in e) {
        const touches = (e as React.TouchEvent).touches
        if (touches.length === 2) {
          clientX = (touches[0].clientX + touches[1].clientX) / 2
          clientY = (touches[0].clientY + touches[1].clientY) / 2
          // Pinch-to-zoom
          if (panningRef.current.startDist && panningRef.current.origZoom) {
            const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY)
            const ratio = dist / panningRef.current.startDist
            currentZoom = Math.max(0.3, Math.min(5, panningRef.current.origZoom * ratio))
            setVpZoom(currentZoom)
          }
        } else if (touches.length === 1) {
          clientX = touches[0].clientX
          clientY = touches[0].clientY
        } else {
          return
        }
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX
        clientY = (e as React.MouseEvent).clientY
      } else {
        return
      }
      const rect = canvasRef.current!.getBoundingClientRect()
      const dx = (clientX! - panningRef.current.startX) * (HITBOX_CANVAS_W / rect.width) / currentZoom
      const dy = (clientY! - panningRef.current.startY) * (HITBOX_CANVAS_H / rect.height) / currentZoom
      const panLimit = HITBOX_WORK_SIZE / 2
      setVpPanX(Math.max(-panLimit, Math.min(panLimit, panningRef.current.origPanX + dx)))
      setVpPanY(Math.max(-panLimit, Math.min(panLimit, panningRef.current.origPanY + dy)))
      return
    }

    // LOS drag
    if (tool === 'los' && losDraggingRef.current) {
      const { x, y } = getWorkCoords(e)
      const dx = x - losDraggingRef.current.startX
      const dy = y - losDraggingRef.current.startY
      // Find parent scale to normalize the delta
      const marker = losMarkers.find((m) => m.id === losDraggingRef.current!.id)
      const parent = marker ? activeSilhouettes.find((s) => s.imageId === marker.imageId) : null
      const pScale = parent?.scale ?? 1
      onUpdateLOSMarker(losDraggingRef.current.id, {
        offsetX: losDraggingRef.current.origOffX + dx / pScale,
        offsetY: losDraggingRef.current.origOffY + dy / pScale,
      })
      return
    }

    if (tool === 'move' && resizingRef.current && selectedImageId) {
      const { x, y } = getWorkCoords(e)
      const sil = silhouettes.find((s) => s.imageId === selectedImageId)
      if (!sil) return
      const dx = Math.abs(x - sil.x)
      const dy = Math.abs(y - sil.y)
      let factor = 1
      switch (resizingRef.current.handle) {
        case 'n': case 's':
          factor = dy / Math.max(1, resizingRef.current.startDy)
          break
        case 'e': case 'w':
          factor = dx / Math.max(1, resizingRef.current.startDx)
          break
        default: {
          const r0 = Math.max(1, resizingRef.current.startR)
          const r = Math.sqrt(dx * dx + dy * dy)
          factor = r / r0
        }
      }
      const newScale = Math.max(0.05, resizingRef.current.startScale * factor)
      setLocalScale(newScale)
      onUpdateSilhouette(selectedImageId, { scale: newScale })
      return
    }
    if (tool === 'move' && movingRef.current && selectedImageId) {
      const { x, y } = getWorkCoords(e)
      const dx = x - movingRef.current.startX
      const dy = y - movingRef.current.startY
      onUpdateSilhouette(selectedImageId, {
        x: movingRef.current.origX + dx,
        y: movingRef.current.origY + dy,
      })
      return
    }

    if (paintingRef.current && (tool === 'paint' || tool === 'erase')) {
      const { x, y } = getWorkCoords(e)
      paintAt(x, y)
    }
  }

  function handlePointerUp(e?: React.MouseEvent | React.TouchEvent) {
    if (paintingRef.current) {
      paintingRef.current = false
      commitMask()
    }
    // If LOS tool and we weren't dragging, and clicked empty space, deselect
    if (tool === 'los' && !losDraggingRef.current && e) {
      // deselect handled: if we didn't hit a marker and didn't add one, deselect
    }
    movingRef.current = null
    resizingRef.current = null
    losDraggingRef.current = null
    panningRef.current = null
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (tool !== 'los') return
    e.preventDefault()
    const { x, y } = getWorkCoords(e)
    const hit = hitLOSMarker(x, y)
    if (hit) onDeleteLOSMarker(hit.id)
  }

  const toolBtn = (t: Tool, label: string, icon: string) => (
    <button
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
        tool === t ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      }`}
      onClick={() => setTool(t)}
      title={label}
    >
      <span dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  if (card.images.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Upload images in the Images tab first.
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 py-1">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Hitbox Editor
        <div className="ml-auto relative">
          <button
            className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
            onClick={() => setShowTips((v) => !v)}
            onBlur={() => setTimeout(() => setShowTips(false), 150)}
            title="Usage tips"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {showTips && (
            <div className="absolute right-0 top-7 z-50 w-64 text-[11px] leading-relaxed text-slate-400 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 px-3 py-2.5 space-y-0.5">
              <p><b className="text-slate-500">Move</b> &mdash; drag to reposition, handles to resize</p>
              <p><b className="text-slate-500">Paint / Erase</b> &mdash; paint gray areas on silhouettes</p>
              <p><b className="text-slate-500">LOS</b> &mdash; click to place, tap to select &amp; adjust</p>
              <p><b className="text-slate-500">Pan</b> &mdash; Space+drag or Pan button</p>
              <p><b className="text-slate-500">Zoom</b> &mdash; scroll, pinch, or +/&minus; buttons</p>
              <p>Checkboxes below toggle images in the hitbox.</p>
            </div>
          )}
        </div>
      </h3>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {toolBtn('move', 'Move', '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>')}
        {toolBtn('paint', 'Paint Gray', '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>')}
        {toolBtn('erase', 'Erase', '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>')}
        {toolBtn('los', 'Place LOS', '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>')}
        <div className="w-px h-5 bg-slate-200 mx-0.5" />
        <button
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            panLock ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
          onClick={() => setPanLock((p) => !p)}
          title="Pan mode (hold Space on desktop)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3" /></svg>
          <span className="hidden sm:inline">Pan</span>
        </button>
      </div>

      {/* Brush size (only for paint/erase) */}
      {(tool === 'paint' || tool === 'erase') && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">Brush: {brushSize}px</label>
          <input
            type="range"
            min={4}
            max={60}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
        </div>
      )}

      {/* LOS hint */}
      {tool === 'los' && (
        <div className="text-xs text-slate-400">
          Click to add dots. Tap dot to select. Drag to reposition.
          {losMarkers.length > 0 && <span className="ml-1">({losMarkers.length} dot{losMarkers.length !== 1 ? 's' : ''})</span>}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="w-full">
        <canvas
          ref={canvasRef}
          width={HITBOX_CANVAS_W}
          height={HITBOX_CANVAS_H}
          style={{
            width: display,
            height: Math.round(display * (HITBOX_CANVAS_H / HITBOX_CANVAS_W)),
            cursor: spaceHeld || panLock ? 'grab' : tool === 'paint' || tool === 'erase' ? 'crosshair' : tool === 'los' ? 'crosshair' : 'grab',
            touchAction: 'none',
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Zoom / pan controls */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
          onClick={() => setVpZoom((z) => Math.max(0.3, z / 1.25))}
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <button
          className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 tabular-nums"
          onClick={() => { setVpZoom(1); setVpPanX(0); setVpPanY(0) }}
          title="Reset view"
        >
          {Math.round(vpZoom * 100)}%
        </button>
        <button
          className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
          onClick={() => setVpZoom((z) => Math.min(5, z * 1.25))}
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      {/* Selected LOS dot controls (below canvas so it doesn't shift layout) */}
      {tool === 'los' && selectedLOSId && (() => {
        const sel = losMarkers.find((m) => m.id === selectedLOSId)
        if (!sel) return null
        return (
          <div className="bg-green-50/50 border border-green-200 rounded-lg p-2.5 space-y-2 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-green-900">Selected Dot</div>
              <button
                className="text-xs text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100"
                onClick={() => setSelectedLOSId(null)}
              >
                Done
              </button>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-xs text-slate-500 whitespace-nowrap">Radius: {sel.radius}px</label>
              <input
                type="range"
                min={3}
                max={30}
                value={sel.radius}
                onChange={(e) => onUpdateLOSMarker(sel.id, { radius: Number(e.target.value) })}
                className="flex-1 min-w-0 accent-green-600"
              />
            </div>
            <button
              className="w-full text-xs text-red-600 hover:text-red-700 font-medium py-1.5 rounded-md hover:bg-red-50 border border-red-200 flex items-center justify-center gap-1.5"
              onClick={() => { onDeleteLOSMarker(sel.id); setSelectedLOSId(null) }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Dot
            </button>
          </div>
        )
      })()}

      {/* Silhouette list */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-600">Silhouettes</div>
        {silhouettes.map((sil) => {
          const imgLayer = card.images.find((i) => i.id === sil.imageId)
          const isActive = !sil.disabled
          return (
            <div
              key={sil.imageId}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                selectedImageId === sil.imageId && isActive
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
                  : sil.disabled ? 'text-slate-400' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isActive}
                onChange={() => onUpdateSilhouette(sil.imageId, { disabled: !sil.disabled })}
                className="accent-blue-600 rounded"
                title={isActive ? 'Disable in hitbox' : 'Enable in hitbox'}
              />
              <button
                className="flex-1 text-left truncate"
                onClick={() => { if (isActive) setSelectedImageId(sil.imageId) }}
                disabled={sil.disabled}
              >
                {imgLayer?.name || 'Image'}
                {sil.grayMaskDataUrl && <span className="ml-1.5 text-slate-400">(painted)</span>}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import type { HitboxState } from './types'

export const HITBOX_WORK_SIZE = 500

// Right hex zone clip path on the 1500x1500 canvas (approximate polygon)
export const RIGHT_HEX_CLIP: [number, number][] = [
  [1140, 55],
  [1440, 200],
  [1440, 490],
  [1140, 625],
  [840, 490],
  [840, 200],
]

export type HitboxMaskInfo = {
  mask: HTMLCanvasElement
  center: { x: number; y: number }
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  scale: number
}

/**
 * Build a mask for the transparent (blue=0) region in mask.png.
 * Also returns center/scale for mapping work coords onto the card.
 */
export function buildHitboxMask(maskImg: HTMLImageElement): HitboxMaskInfo | null {
  const size = 1500
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.drawImage(maskImg, 0, 0)
  const imgData = ctx.getImageData(0, 0, size, size)
  const data = imgData.data
  const maskData = ctx.createImageData(size, size)
  const m = maskData.data

  const total = size * size
  const idxArr = new Uint8Array(total)

  // Map palette colors to indices (mask.png is palette-based)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    let idx = 0
    if (r === 0 && g === 128 && b === 64) idx = 0
    else if (r === 128 && g === 0 && b === 128) idx = 1
    else if (r === 0 && g === 0 && b === 0) idx = 2
    else if (r === 0 && g === 0 && b === 255) idx = 3
    idxArr[p] = idx
  }

  const visited = new Uint8Array(total)
  const q = new Int32Array(total)
  const minArea = 50000
  const maxArea = 200000
  const minW = 180
  const minH = 180
  let best: { seed: number; idx: number; count: number; centroidX: number; bbox: { minX: number; minY: number; maxX: number; maxY: number } } | null = null

  for (let i = 0; i < total; i++) {
    if (visited[i]) continue
    const idx = idxArr[i]
    let head = 0
    let tail = 0
    q[tail++] = i
    visited[i] = 1
    let count = 0
    let sumX = 0
    let sumY = 0
    let minX = size
    let minY = size
    let maxX = -1
    let maxY = -1
    while (head < tail) {
      const cur = q[head++]
      count++
      const x = cur % size
      const y = (cur / size) | 0
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      const left = cur - 1
      const right = cur + 1
      const up = cur - size
      const down = cur + size
      if (x > 0 && !visited[left] && idxArr[left] === idx) { visited[left] = 1; q[tail++] = left }
      if (x < size - 1 && !visited[right] && idxArr[right] === idx) { visited[right] = 1; q[tail++] = right }
      if (y > 0 && !visited[up] && idxArr[up] === idx) { visited[up] = 1; q[tail++] = up }
      if (y < size - 1 && !visited[down] && idxArr[down] === idx) { visited[down] = 1; q[tail++] = down }
    }
    const w = maxX - minX
    const h = maxY - minY
    if (count >= minArea && count <= maxArea && w >= minW && h >= minH) {
      const centroidX = sumX / count
      if (!best || centroidX > best.centroidX) {
        best = { seed: i, idx, count, centroidX, bbox: { minX, minY, maxX, maxY } }
      }
    }
  }

  // Fallback: use the black (blue=0) region if no candidate found
  if (!best) {
    const fallbackIdx = 2
    for (let i = 0; i < total; i++) {
      if (idxArr[i] === fallbackIdx) {
        best = { seed: i, idx: fallbackIdx, count: 0, centroidX: 0, bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
        break
      }
    }
  }
  if (!best) return null

  const visited2 = new Uint8Array(total)
  let head = 0
  let tail = 0
  q[tail++] = best.seed
  visited2[best.seed] = 1
  let minX = size
  let minY = size
  let maxX = -1
  let maxY = -1
  let sumX = 0
  let sumY = 0
  let count = 0
  const rowMin = new Array<number>(size).fill(size)
  const rowMax = new Array<number>(size).fill(-1)

  while (head < tail) {
    const cur = q[head++]
    const x = cur % size
    const y = (cur / size) | 0
    count++
    sumX += x
    sumY += y
    const i = cur * 4
    m[i] = 255
    m[i + 1] = 255
    m[i + 2] = 255
    m[i + 3] = 255
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (x < rowMin[y]) rowMin[y] = x
    if (x > rowMax[y]) rowMax[y] = x
    const left = cur - 1
    const right = cur + 1
    const up = cur - size
    const down = cur + size
    if (x > 0 && !visited2[left] && idxArr[left] === best.idx) { visited2[left] = 1; q[tail++] = left }
    if (x < size - 1 && !visited2[right] && idxArr[right] === best.idx) { visited2[right] = 1; q[tail++] = right }
    if (y > 0 && !visited2[up] && idxArr[up] === best.idx) { visited2[up] = 1; q[tail++] = up }
    if (y < size - 1 && !visited2[down] && idxArr[down] === best.idx) { visited2[down] = 1; q[tail++] = down }
  }

  if (!count) return null
  ctx.putImageData(maskData, 0, 0)

  // Compute a stable center from the widest row(s)
  let maxWidth = -1
  for (let y = 0; y < size; y++) {
    if (rowMax[y] >= 0) {
      const w = rowMax[y] - rowMin[y]
      if (w > maxWidth) maxWidth = w
    }
  }
  let centerX = sumX / count
  let centerY = sumY / count
  if (maxWidth > 0) {
    let cxSum = 0
    let cySum = 0
    let rows = 0
    for (let y = 0; y < size; y++) {
      if (rowMax[y] >= 0 && rowMax[y] - rowMin[y] === maxWidth) {
        cxSum += (rowMin[y] + rowMax[y]) / 2
        cySum += y
        rows++
      }
    }
    if (rows > 0) {
      centerX = cxSum / rows
      centerY = cySum / rows
    }
  }

  const regionW = Math.max(1, maxX - minX)
  const regionH = Math.max(1, maxY - minY)
  const scale = Math.min(regionW, regionH) / HITBOX_WORK_SIZE

  return {
    mask: c,
    center: { x: centerX, y: centerY },
    bbox: { minX, minY, maxX, maxY },
    scale,
  }
}

/** Replace all non-transparent pixels with a solid color, no alpha variation. */
export function generateSilhouette(
  img: HTMLImageElement,
  color: string,
  w: number,
  h: number,
): HTMLCanvasElement {
  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const wctx = work.getContext('2d')!
  wctx.clearRect(0, 0, w, h)
  // Light blur to smooth jagged cutouts before thresholding
  wctx.filter = 'blur(0.8px)'
  wctx.drawImage(img, 0, 0, w, h)
  wctx.filter = 'none'

  const imgData = wctx.getImageData(0, 0, w, h)
  const data = imgData.data
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  const alphaThreshold = 12

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a > alphaThreshold) {
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    } else {
      data[i + 3] = 0
    }
  }
  wctx.putImageData(imgData, 0, 0)
  return work
}

/** Generate a composited silhouette: red base + gray mask overlay using source-atop. */
export function compositeHitboxSilhouette(
  img: HTMLImageElement,
  grayMaskCanvas: HTMLCanvasElement | null,
  w: number,
  h: number,
): HTMLCanvasElement {
  // Start with red silhouette
  const result = generateSilhouette(img, '#cc2222', w, h)
  if (!grayMaskCanvas) return result
  const ctx = result.getContext('2d')!
  // Gray mask only within the silhouette shape
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(grayMaskCanvas, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  return result
}

/** Load a data URL into an HTMLImageElement (async). */
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Compute scaled dimensions with max dimension capped at `cap`. */
function fitDimensions(nw: number, nh: number, cap: number): [number, number] {
  if (nw <= cap && nh <= cap) return [nw, nh]
  const ratio = Math.min(cap / nw, cap / nh)
  return [Math.round(nw * ratio), Math.round(nh * ratio)]
}

/**
 * Render the full hitbox onto an offscreen 1500x1500 canvas.
 * Returns null if no hitbox state exists.
 */
export async function renderHitboxToCanvas(
  hitbox: HitboxState | undefined,
  images: { id: string; dataUrl: string }[],
  imgCache: Map<string, HTMLImageElement>,
  maskInfo?: HitboxMaskInfo | null,
): Promise<HTMLCanvasElement | null> {
  if (!hitbox || hitbox.silhouettes.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = 1500
  canvas.height = 1500
  const ctx = canvas.getContext('2d')!

  const bbox = maskInfo?.bbox
  const mapScale = maskInfo?.scale ?? (Math.min(1440 - 840, 625 - 55) / HITBOX_WORK_SIZE)
  const bboxW = bbox ? Math.max(1, bbox.maxX - bbox.minX) : (1440 - 840)
  const bboxH = bbox ? Math.max(1, bbox.maxY - bbox.minY) : (625 - 55)
  const mapBaseX = bbox
    ? bbox.minX + (bboxW - HITBOX_WORK_SIZE * mapScale) / 2
    : (840 + 1440) / 2 - (HITBOX_WORK_SIZE * mapScale) / 2
  const mapBaseY = bbox
    ? bbox.minY + (bboxH - HITBOX_WORK_SIZE * mapScale) / 2
    : (55 + 625) / 2 - (HITBOX_WORK_SIZE * mapScale) / 2

  // Black background (masked later if we have a mask)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 1500, 1500)

  for (const sil of hitbox.silhouettes) {
    if (sil.disabled) continue
    const imgData = images.find((i) => i.id === sil.imageId)
    if (!imgData) continue

    let img = imgCache.get(sil.imageId)
    if (!img || img.src !== imgData.dataUrl) {
      try {
        img = await loadImg(imgData.dataUrl)
        imgCache.set(sil.imageId, img)
      } catch {
        continue
      }
    }

    const [fw, fh] = fitDimensions(img.naturalWidth, img.naturalHeight, 512)
    // Load gray mask if present
    let maskCanvas: HTMLCanvasElement | null = null
    if (sil.grayMaskDataUrl) {
      try {
        const maskImg = await loadImg(sil.grayMaskDataUrl)
        maskCanvas = document.createElement('canvas')
        maskCanvas.width = fw
        maskCanvas.height = fh
        const mctx = maskCanvas.getContext('2d')!
        mctx.drawImage(maskImg, 0, 0, fw, fh)
      } catch {}
    }

    const comp = compositeHitboxSilhouette(img, maskCanvas, fw, fh)

    // Map from work coordinates to card coordinates
    const drawW = fw * sil.scale * mapScale
    const drawH = fh * sil.scale * mapScale
    const drawX = mapBaseX + sil.x * mapScale - drawW / 2
    const drawY = mapBaseY + sil.y * mapScale - drawH / 2

    ctx.drawImage(comp, drawX, drawY, drawW, drawH)
  }

  // LOS markers (only for active silhouettes)
  const markers = hitbox.losMarkers ?? []
  for (const m of markers) {
    const parent = hitbox.silhouettes.find((s) => s.imageId === (m as any).imageId && !s.disabled)
    if (!parent) continue
    const pScale = parent?.scale ?? 1
    const absX = parent ? parent.x + (m as any).offsetX * pScale : ((m as any).offsetX ?? (m as any).x ?? 0)
    const absY = parent ? parent.y + (m as any).offsetY * pScale : ((m as any).offsetY ?? (m as any).y ?? 0)
    const lx = mapBaseX + absX * mapScale
    const ly = mapBaseY + absY * mapScale
    const r = (m.radius ?? 8) * pScale * mapScale
    ctx.beginPath()
    ctx.arc(lx, ly, r, 0, Math.PI * 2)
    ctx.fillStyle = '#00cc44'
    ctx.fill()
  }

  if (maskInfo?.mask) {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskInfo.mask, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    RIGHT_HEX_CLIP.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  return canvas
}

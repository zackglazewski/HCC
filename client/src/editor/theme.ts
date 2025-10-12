import { General } from './types'

type Images = { mask: HTMLImageElement; blank: HTMLImageElement; background: HTMLImageElement }
export type CustomThemeHSV = {
  primary: { h: number; s: number; v: number }
  secondary: { h: number; s: number; v: number }
  background: { h: number; s: number; v: number }
}

export function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return { h, s, v }
}

export function hsvToRgb(h: number, s: number, v: number) {
  h = ((h % 1) + 1) % 1
  s = Math.max(0, Math.min(1, s))
  v = Math.max(0, Math.min(1, v))
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

const templatePrimary: Record<General, {hue:number; sat:number; val:number; constantSat:boolean}> = {
  aquilla: { hue: 46/360, sat: 0.75, val: 0.77, constantSat: false },
  einar:   { hue: 310/360, sat: 0.83, val: 0.22, constantSat: false },
  jandar:  { hue: 142/360, sat: -0.02, val: 0.95, constantSat: true },
  ullar:   { hue: 29/360,  sat: 0.68, val: 0.40, constantSat: false },
  utgar:   { hue: 25/360,  sat: 0.47, val: 0.14, constantSat: false },
  vydar:   { hue: 15/360,  sat: 0.07, val: 0.39, constantSat: false },
  valkrill:{ hue: 28/360,  sat: 0.57, val: 0.54, constantSat: false },
}

const templateSecondary: Record<General, {hue:number; sat:number; val:number; invert:boolean}> = {
  aquilla: { hue: 224/360, sat: 1.00, val: 0.08, invert: true },
  einar:   { hue: 27/360,  sat: 0.71, val: 0.61, invert: false },
  jandar:  { hue: 211/360, sat: 0.67, val: 0.67, invert: false },
  ullar:   { hue: 151/360, sat: 1.00, val: 0.27, invert: true },
  utgar:   { hue: 356/360, sat: 0.77, val: 0.46, invert: false },
  vydar:   { hue: 198/360, sat: 0.39, val: 0.59, invert: false },
  valkrill:{ hue: 41/360,  sat: 0.57, val: 0.56, invert: true },
}

export function buildThemedBase(images: Images, general: General): HTMLCanvasElement {
  return internalBuildThemedBase(images, general)
}

function internalBuildThemedBase(images: Images, general: General, custom?: CustomThemeHSV): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1500; canvas.height = 1500
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(images.mask, 0, 0)
  const maskPixels = ctx.getImageData(0,0,1500,1500).data

  ctx.clearRect(0,0,1500,1500)
  ctx.drawImage(images.blank, 0, 0)
  const pixelData = ctx.getImageData(0,0,1500,1500)
  const pixels = pixelData.data

  const basePri = templatePrimary['vydar']
  const baseSec = templateSecondary['vydar']
  const usePri = general === 'custom' && custom ? { h: custom.primary.h, s: custom.primary.s, v: custom.primary.v } : templatePrimary[general]
  const useSec = general === 'custom' && custom ? { h: custom.secondary.h, s: custom.secondary.s, v: custom.secondary.v, invert: false } : templateSecondary[general]
  const pri = {
    hue: usePri.h ?? usePri.hue,
    sat: usePri.s ?? usePri.sat,
    valDiff: (usePri.v ?? usePri.val) - basePri.val,
  }
  const sec = {
    hueDiff: (useSec.h ?? useSec.hue) - baseSec.hue,
    satDiff: (useSec.s ?? useSec.sat) - baseSec.sat,
    valDiff: (useSec.v ?? useSec.val) - baseSec.val,
    val: (useSec.v ?? useSec.val),
    invert: (useSec as any).invert ?? false,
  }

  for (let i=0,l=pixels.length;i<l;i+=4){
    const code = maskPixels[i+2]
    if (code === 0){
      // transparent mini-bg area; let background show through
      pixels[i+3] = 0
      continue
    }
    if (code === 128){
      // primary recolor: map V only to general color
      const val = Math.max(pixels[i], pixels[i+1], pixels[i+2]) / 255
      const rgb = hsvToRgb(pri.hue, pri.sat, val + pri.valDiff)
      pixels[i]=rgb.r; pixels[i+1]=rgb.g; pixels[i+2]=rgb.b
      continue
    }
    if (code === 255){
      // secondary recolor of inset
      let hsv = rgbToHsv(pixels[i], pixels[i+1], pixels[i+2])
      hsv.h += sec.hueDiff
      hsv.s += sec.satDiff
      hsv.v += sec.valDiff

      if (sec.invert){
        const over = hsv.v - sec.val
        if (over > -0.05){
          hsv.v -= 2*over
        }else{
          // simple shadow detection per reference
          let shadow = false
          const j = i - (13*1500 - 9)*4
          if (j>=0 && maskPixels[j+2]===128) shadow = true
          else if (maskPixels[i+2 + 4*4] !== 64 && maskPixels[i+2 + 20*4]===64 && maskPixels[i+2 + 20*1500*4] !== 128) shadow = true
          else if (maskPixels[i+2 - 1500*9*4]===128) shadow = true
          if (shadow) hsv.v += 0.10
          else hsv.v -= 2*over
        }
      }
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
      pixels[i]=rgb.r; pixels[i+1]=rgb.g; pixels[i+2]=rgb.b
      continue
    }
    // mask 64 -> leave as-is
  }
  ctx.putImageData(pixelData,0,0)
  return canvas
}

export function buildThemeLayer(images: Images, general: General): HTMLCanvasElement {
  // Compose masked background + themed base into a single canvas to swap atomically
  const out = document.createElement('canvas')
  out.width = 1500; out.height = 1500
  const octx = out.getContext('2d')!

  // 1) Masked background
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = 1500; bgCanvas.height = 1500
  const bgctx = bgCanvas.getContext('2d')!
  bgctx.drawImage(images.background, 0, 0)
  bgctx.globalCompositeOperation = 'destination-in'
  bgctx.drawImage(images.mask, 0, 0)
  octx.drawImage(bgCanvas, 0, 0)

  // 2) Themed base on top (recolored blank)
  const themed = internalBuildThemedBase(images, general)
  octx.drawImage(themed, 0, 0)
  return out
}

// Build only the masked background underlay layer
export function buildUnderlayLayer(images: Images, general?: General, custom?: CustomThemeHSV): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = 1500; out.height = 1500
  const octx = out.getContext('2d')!
  // Draw background (recolor for custom using Vydar base formula)
  if (general === 'custom' && custom) {
    const base = templateSecondary['vydar']
    const bgCanvas = document.createElement('canvas')
    bgCanvas.width = 1500; bgCanvas.height = 1500
    const bgctx = bgCanvas.getContext('2d')!
    bgctx.drawImage(images.background, 0, 0)
    const imgData = bgctx.getImageData(0,0,1500,1500)
    const data = imgData.data
    const dh = custom.background.h - base.hue
    const ds = custom.background.s - base.sat
    const dv = custom.background.v - base.val
    for (let i=0;i<data.length;i+=4){
      const hsv = rgbToHsv(data[i], data[i+1], data[i+2])
      hsv.h += dh; hsv.s += ds; hsv.v += dv
      const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
      data[i]=rgb.r; data[i+1]=rgb.g; data[i+2]=rgb.b
    }
    bgctx.putImageData(imgData,0,0)
    octx.drawImage(bgCanvas, 0, 0)
  } else {
    octx.drawImage(images.background, 0, 0)
  }
  octx.globalCompositeOperation = 'destination-in'
  octx.drawImage(images.mask, 0, 0)
  return out
}

// Build the themed blank overlay (foreground frame), recolored for the general
export function buildOverlayLayer(images: Images, general: General, custom?: CustomThemeHSV): HTMLCanvasElement {
  return internalBuildThemedBase(images, general, custom)
}

// Helpers to parse hex to HSV
export function hexToHsv(hex: string) {
  const h = hex.replace('#','')
  const r = parseInt(h.substring(0,2),16)
  const g = parseInt(h.substring(2,4),16)
  const b = parseInt(h.substring(4,6),16)
  return rgbToHsv(r,g,b)
}

// Empirical mapping for background picker -> theme HSV target.
// The background recolor behaves differently from a direct HSV target,
// so we rotate hue and dampen saturation/value to better match the reference.
export function mapBackgroundPickerHexToThemeHSV(hex: string) {
  const { h, s, v } = hexToHsv(hex)
  const hueRotate = 157 / 360 // tuned to match reference behavior (e.g. 13DD2B -> A661BD)
  const h2 = (h + hueRotate) % 1
  const s2 = Math.max(0, Math.min(1, s * 0.60))
  const v2 = Math.max(0, Math.min(1, v * 0.85))
  return { h: h2, s: s2, v: v2 }
}

import { CardState } from './types'

// Debug logging removed
const DEBUG_WRAP = 0
function dbg(_level: number, _message: string, _data?: any) {}

type Align = 'left' | 'center' | 'right'

function patchLetterSpacing(ctx: CanvasRenderingContext2D) {
  if ((ctx as any)._ls_patched) return
  ;(ctx as any)._ls_patched = true
  const origFillText = ctx.fillText.bind(ctx)
  const origMeasureText = ctx.measureText.bind(ctx)
  ;(ctx as any).letterSpacing = 0
  ctx.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
    const ls = parseFloat(((ctx as any).letterSpacing || 0) as any)
    if (!ls) return origFillText(text, x, y, maxWidth as any)
    let total = 0
    for (let i = 0; i < text.length; i++) total += origMeasureText(text[i]).width
    total += Math.max(0, text.length - 1) * ls
    let startX = x
    if (ctx.textAlign === 'center') startX = x - total / 2
    else if (ctx.textAlign === 'right') startX = x - total
    let cx = startX
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      origFillText(ch, cx, y)
      cx += origMeasureText(ch).width + ls
    }
  } as any
  ctx.measureText = function (text: string) {
    const ls = parseFloat(((ctx as any).letterSpacing || 0) as any)
    const w = origMeasureText(text).width
    return { width: w + Math.max(0, text.length - 1) * (ls || 0) } as TextMetrics
  } as any
}

function setFont(ctx: CanvasRenderingContext2D, size: number, family: string) {
  ctx.font = `${size}px ${family}`
  ctx.textBaseline = 'alphabetic'
}

function measureWithSpacing(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  const base = ctx.measureText(text).width
  const extra = Math.max(0, text.length - 1) * letterSpacing
  return base + extra
}

// Reference-style helpers
type TextSpec = {
  fontFamily: string
  fontSize: number
  baseline: number
  fontColor: string
  alignment: Align
  letterSpacing: number
  lineHeight: number
  spacingBefore: number
}

type RectSpec = { box: { left: number; top: number; width: number; height: number; leftPad?: number; rightPad?: number; topPad?: number; followContour?: boolean } }

function drawTextRef(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, family: string, size: number, color: string, alignment: Align, spacing: number) {
  drawTextSpaced(ctx, text, x, y, family, size, color, alignment, spacing)
}

function measureWord(ctx: CanvasRenderingContext2D, text: string, textSpec: TextSpec) {
  const saveFont = ctx.font
  const saveLS = (ctx as any).letterSpacing
  setFont(ctx, textSpec.fontSize, textSpec.fontFamily)
  patchLetterSpacing(ctx)
  ;(ctx as any).letterSpacing = textSpec.letterSpacing
  const result = ctx.measureText(text).width
  ctx.font = saveFont
  ;(ctx as any).letterSpacing = saveLS
  return result
}

// Precomputed contour pads per 10px row within the powers box (from reference)
const contour: [number, number][] = [
  [10,65],[10,65],[10,50],[10,44],[10,40],[10,40],[10,33],[10,33],[10,28],[10,28],[10,22],[10,22],[10,18],[10,18],[10,15],[10,15],[10,12],[10,12],[10,10],[10,10],[10,10],[10,10],[10,10],[10,10],[10,10],[10,10],[10,10],[10,10],[10,12],[10,12],[10,15],[10,15],[10,18],[10,18],[10,21],[10,21],[10,25],[10,25],[10,29],[10,29],[10,34],[10,34],[10,38],[10,38],[10,30],[10,30],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,14],[10,28],[10,45],[10,62],[10,80],[10,97],[10,115],[25,132],[42,150],[59,167],[77,185],[94,202],[111,220],[128,237],[145,255]
]

function calcStartEnd(passedY: number, textSpec: TextSpec, specs: RectSpec) {
  const y = passedY - specs.box.top
  if (!specs.box.followContour) {
    if (y < specs.box.height) return { start: specs.box.leftPad ?? 0, end: specs.box.width - (specs.box.rightPad ?? 0) }
    return { start: -1, end: -1 }
  }
  const rowLimit = contour.length
  const CONTOUR_Y_BIAS = -4 // px; small upward bias to match reference baselines
  const yb = y + CONTOUR_Y_BIAS
  if (Math.ceil((yb + 0.1 * textSpec.fontSize) / 10) >= rowLimit) return { start: -1, end: -1 }
  const minY = Math.floor((yb - 0.8 * textSpec.fontSize) / 10)
  const maxY = Math.floor((yb + 0.1 * textSpec.fontSize) / 10)
  const clamp = (v: number) => Math.max(0, Math.min(rowLimit - 1, v))
  let leftPad = contour[clamp(minY)][0]
  let rightPad = contour[clamp(minY)][1]
  for (let i = clamp(minY) + 1; i <= clamp(maxY); i++) {
    leftPad = Math.max(leftPad, contour[i][0])
    rightPad = Math.max(rightPad, contour[i][1])
  }
  leftPad += specs.box.leftPad ?? 0
  // Slight easing on right contour near bottom to avoid overly tight last lines
  const CONTOUR_RIGHT_EASE = 8 // base ease
  let easedRight = Math.max(0, rightPad - CONTOUR_RIGHT_EASE)
  const yRel = y
  if (yRel >= (specs.box.height - 80)) easedRight = Math.max(0, easedRight - 4)
  if (yRel >= (specs.box.height - 40)) easedRight = Math.max(0, easedRight - 4)
  rightPad = easedRight + (specs.box.rightPad ?? 0)
  return { start: leftPad, end: specs.box.width - rightPad }
}

function drawMultiline(ctx: CanvasRenderingContext2D, text: string, textSpec: TextSpec, spec: RectSpec) {
  let x = spec.box.left
  if (textSpec.alignment === 'center') x += spec.box.width / 2
  else if (textSpec.alignment === 'right') x += spec.box.width
  let y = spec.box.top
  const totalWidth = measureWord(ctx, text, textSpec)
  if (totalWidth <= spec.box.width) {
    const spacingBefore = (spec.box.height - textSpec.fontSize) / 2
    y += spacingBefore + textSpec.baseline * textSpec.fontSize
    drawTextRef(ctx, text, x, y, textSpec.fontFamily, textSpec.fontSize, textSpec.fontColor, textSpec.alignment, textSpec.letterSpacing)
  } else {
    const candidates: any[] = []
    const words = text.split(' ')
    const num = words.length - 1
    for (let i = 0; i < num; i++) candidates[i] = {}
    for (let i = 0; i < num; i++) {
      if (i === 0) {
        candidates[i].first = words[0]
        candidates[num - 1].second = words[num]
      } else {
        candidates[i].first = candidates[i - 1].first + ' ' + words[i]
        candidates[num - i - 1].second = words[num - i] + ' ' + candidates[num - i].second
      }
    }
    let minDiff = 999999
    let best = -1
    for (let i = 0; i < num; i++) {
      candidates[i].firstWidth = measureWord(ctx, candidates[i].first, textSpec)
      candidates[i].secondWidth = measureWord(ctx, candidates[i].second, textSpec)
      candidates[i].diff = Math.abs(candidates[i].firstWidth - candidates[i].secondWidth)
      if (candidates[i].firstWidth <= spec.box.width && candidates[i].secondWidth <= spec.box.width && candidates[i].diff <= minDiff) {
        minDiff = candidates[i].diff
        best = i
      }
    }
    const fixed: TextSpec = JSON.parse(JSON.stringify(textSpec))
    if (best === -1) {
      let minAdjust = 999999
      for (let i = 0; i < num; i++) {
        const firstAdjust = (candidates[i].firstWidth - spec.box.width) / (candidates[i].first.length - 1)
        const secondAdjust = (candidates[i].secondWidth - spec.box.width) / (candidates[i].second.length - 1)
        const needed = Math.max(firstAdjust, secondAdjust)
        if (needed < minAdjust) { minAdjust = needed; best = i }
      }
      fixed.letterSpacing -= minAdjust
    }
    const spacingBefore = (spec.box.height - fixed.fontSize - (fixed.fontSize * fixed.lineHeight)) / 2
    y += spacingBefore + fixed.baseline * fixed.fontSize
    drawTextRef(ctx, candidates[best].first, x, y, fixed.fontFamily, fixed.fontSize, fixed.fontColor, fixed.alignment, fixed.letterSpacing)
    y += fixed.fontSize * fixed.lineHeight
    drawTextRef(ctx, candidates[best].second, x, y, fixed.fontFamily, fixed.fontSize, fixed.fontColor, fixed.alignment, fixed.letterSpacing)
  }
  return y
}

type LineInfo = { y: number; width: number; start: number; end: number; text: string }

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  top: number,
  textSpec: TextSpec,
  spec: RectSpec,
  draw: boolean = true,
  onLine?: (info: LineInfo) => void
) {
  function cleanString(input: string) {
    return (input || '')
      .replace(/^\s+|\s+$/g, '')
      .replace(/[ \f\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff][ \f\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ')
      .replace(' \n', '\n')
      .replace('\n ', '\n')
      .replace(/[\n][\n]+/g, '\n')
      .replace('\n', ' \n ')
      .replace("'", '’')
      .replace('20 sided', '20-sided')
      .trim()
  }
  const words = cleanString(text).split(' ')
  let x = 0
  let bounds: any = {}
  let startNewLine = true
  let y = top + textSpec.spacingBefore
  let line = ''
  dbg(2, 'paragraph start', { top, font: textSpec.fontFamily, size: textSpec.fontSize, ls: textSpec.letterSpacing, lh: textSpec.lineHeight, box: spec.box })
  let currentAllowedWidth = 0
  let currentStart = 0
  let currentEnd = 0
  for (let i = 0; i < words.length; i++) {
    if (startNewLine) {
      y += textSpec.fontSize * textSpec.lineHeight
      bounds = calcStartEnd(y, textSpec, spec)
      x = bounds.start
      if (x === -1) return false as any
      startNewLine = false
      currentAllowedWidth = (bounds.end - bounds.start)
      currentStart = bounds.start
      currentEnd = bounds.end
      dbg(2, 'newLine', { baselineY: +y.toFixed(2), start: +bounds.start.toFixed(2), end: +bounds.end.toFixed(2), width: +(bounds.end - bounds.start).toFixed(2) })
    }
    let word = words[i]
    if (word === '\n') {
      startNewLine = true
    } else {
      if (x !== bounds.start) word = ' ' + word
      const wordWidth = measureWord(ctx, word, textSpec)
      const fullWidth = measureWord(ctx, line + word, textSpec)
      const lineWidth = (bounds.end - bounds.start)
      dbg(3, 'tryWord', { word, wordWidth: +wordWidth.toFixed(2), fullWidth: +fullWidth.toFixed(2), lineWidth: +lineWidth.toFixed(2) })
      if (fullWidth > lineWidth) {
        startNewLine = true
        i--
      } else {
        line += word
        x += wordWidth + textSpec.letterSpacing
      }
    }
    if (startNewLine || i === words.length - 1) {
      if (line !== '') {
        if (draw) drawTextRef(ctx, line, spec.box.left + bounds.start, y, textSpec.fontFamily, textSpec.fontSize, textSpec.fontColor, textSpec.alignment, textSpec.letterSpacing)
        dbg(2, 'lineOut', { y: +y.toFixed(2), text: line, width: +measureWord(ctx, line, textSpec).toFixed(2) })
        if (onLine) onLine({ y, width: currentAllowedWidth, start: currentStart, end: currentEnd, text: line })
        line = ''
      }
    }
  }
  return y
}

function drawTextSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  family: string,
  size: number,
  color: string,
  align: Align,
  letterSpacing = 0
) {
  setFont(ctx, size, family)
  patchLetterSpacing(ctx)
  ctx.fillStyle = color
  ctx.textAlign = align
  ;(ctx as any).letterSpacing = letterSpacing || 0
  if (!text) return
  ctx.fillText(text, x, y)
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  family: string,
  size: number,
  color: string,
  align: Align,
  maxWidth: number
) {
  setFont(ctx, size, family)
  const width = ctx.measureText(text).width
  let spacing = 0
  if (text.length > 1 && width > maxWidth) {
    spacing = -(width - maxWidth) / (text.length - 1)
  }
  drawTextSpaced(ctx, text, x, y, family, size, color, align, spacing)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  family: string,
  size: number,
  color: string,
  letterSpacing = 0
) {
  setFont(ctx, size, family)
  const words = text.split(/\s+/)
  let line = ''
  let curY = y
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i]
    const w = measureWithSpacing(ctx, test, letterSpacing)
    if (w > width && line) {
      drawTextSpaced(ctx, line, x, curY, family, size, color, 'left', letterSpacing)
      line = words[i]
      curY += lineHeight
    } else {
      line = test
    }
  }
  if (line) drawTextSpaced(ctx, line, x, curY, family, size, color, 'left', letterSpacing)
  return curY
}

export function renderText(ctx: CanvasRenderingContext2D, card: CardState) {
  // Title and general name
  const title = (card.fields.cardName || '').toUpperCase()
  const general = (card.fields.tribeName || card.general || '').toUpperCase()
  // Title uses reference drawMultiline profile to center within the box,
  // and general sits just below based on returned baseline
  const titleSpec: TextSpec = { fontFamily: 'ScapeCondensedHeavy', fontSize: 42.7, baseline: 0.9, fontColor: '#fff', alignment: 'center', letterSpacing: 0, lineHeight: 1.03, spacingBefore: 0 }
  const titleArea: RectSpec = { box: { left: 333, top: 269, width: 320, height: 124 - 29.2 } }
  const lastY = drawMultiline(ctx, title, titleSpec, titleArea)
  fitText(ctx, general, 493, lastY + 29.2, 'ScapeCondensedMedium', 29.2, '#fff', 'center', 320)

  // Attributes block (right aligned)
  const species = (card.fields.species || '').toUpperCase()
  const uniqueness = (card.fields.uniqueness || '').toUpperCase()
  const klass = (card.fields.class || '').toUpperCase()
  const personality = (card.fields.personality || '').toUpperCase()
  const size = (card.fields.size || '').toUpperCase()
  // Do not clear; we redraw the entire frame in the renderer
  fitText(ctx, species, 290, 644, 'ScapeCondensedBold', 29.2, '#fff', 'right', 119)
  fitText(ctx, uniqueness, 290, 695, 'ScapeCondensedBold', 29.2, '#fff', 'right', 187)
  fitText(ctx, klass, 290, 745, 'ScapeCondensedBold', 29.2, '#fff', 'right', 214)
  fitText(ctx, personality, 290, 796, 'ScapeCondensedBold', 29.2, '#fff', 'right', 214)
  fitText(ctx, size, 290, 865, 'ScapeCondensedBold', 41.7, '#fff', 'right', 181)

  // Specs (life/move/range/attack/defense/points)
  const life = card.fields.life || ''
  const move = card.fields.move || ''
  const range = card.fields.range || ''
  const attack = card.fields.attack || ''
  const defense = card.fields.defense || ''
  const points = card.fields.points || ''

  // Do not clear; avoid punching holes in the base image
  // MRAD labels
  drawTextSpaced(ctx, 'MOVE', 800 + 128, 841 + 0 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17)
  drawTextSpaced(ctx, 'RANGE', 800 + 128, 841 + 1 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17)
  drawTextSpaced(ctx, 'ATTACK', 800 + 128, 841 + 2 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17)
  drawTextSpaced(ctx, 'DEFENSE', 800 + 128, 841 + 3 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17)
  // MRAD values
  drawTextSpaced(ctx, move, 800 + 288, 841 + 0 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0)
  drawTextSpaced(ctx, range, 800 + 288, 841 + 1 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0)
  drawTextSpaced(ctx, attack, 800 + 288, 841 + 2 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0)
  drawTextSpaced(ctx, defense, 800 + 288, 841 + 3 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0)
  // MRAD units (pluralization)
  const mu = move === '1' ? 'SPACE' : 'SPACES'
  const ru = range === '1' ? 'SPACE' : 'SPACES'
  const au = attack === '1' ? 'DIE' : 'DICE'
  const du = defense === '1' ? 'DIE' : 'DICE'
  drawTextSpaced(ctx, mu, 800 + 288, 841 + 0 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417)
  drawTextSpaced(ctx, ru, 800 + 288, 841 + 1 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417)
  drawTextSpaced(ctx, au, 800 + 288, 841 + 2 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417)
  drawTextSpaced(ctx, du, 800 + 288, 841 + 3 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417)

  // Life
  drawTextSpaced(ctx, life, 775 + 195, 716 + 70, 'ScapeBold', 58, '#fff', 'center', 0)
  drawTextSpaced(ctx, 'LIFE', 775 + 195, 716 + 105, 'ScapeCondensedBold', 29.2, '#d5d8d7', 'center', 0.416)

  // Points (color depends on general)
  const generalUpper = (card.general || '').toUpperCase()
  const ptsColor = generalUpper === 'JANDAR' || generalUpper === 'VALKRILL' ? '#121212' : '#d5d8d8'
  drawTextSpaced(ctx, points, 775 + 194, 716 + 558, 'ScapeBold', 50, ptsColor, 'center', 0)
  drawTextSpaced(ctx, 'POINTS', 775 + 194, 716 + 589, 'ScapeCondensedMedium', 25, ptsColor, 'center', 0)

  // Restarted powers rendering: exact two-pass port of the reference spSpecs
  function makeSpecs() {
    const baseBox = { followContour: false, top: 396, left: 325, width: 447, height: 900, leftPad: 20, rightPad: 53, topPad: -6.66 }
    const sp: any[] = []
    sp.push({
      box: { ...baseBox },
      header: { fontFamily: 'ScapeCondensedBold', fontSize: 33.3, baseline: 0.9, fontColor: '#121212', alignment: 'left', letterSpacing: -0.313, lineHeight: 1.1, spacingBefore: 26 },
      text:   { fontFamily: 'ScapeCondensed',      fontSize: 30.4, baseline: 0.9, fontColor: '#121212', alignment: 'left', letterSpacing: 0.75,  lineHeight: 1.16, spacingBefore: 0 },
    })
    // 1: follow contour, taller, tighter pads
    let t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.box.followContour = true; t.box.height = 980; t.box.leftPad = 10; t.box.rightPad = 10; sp.push(t)
    // 2: smaller
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.header.fontSize = 31.6; t.text.fontSize = t.header.fontSize - 2.9; t.text.letterSpacing = 0.72; sp.push(t)
    // 3: smaller
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.header.fontSize = 29.8; t.text.fontSize = t.header.fontSize - 2.9; t.text.letterSpacing = 0.67; sp.push(t)
    // 4: more small
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.header.fontSize = 28.1; t.text.fontSize = t.header.fontSize - 2.9; t.text.letterSpacing = 0.625; sp.push(t)
    // 5: repulsors
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.box.topPad = 4 - 6.66; t.header.fontSize = 26.0; t.header.lineHeight = 1.06; t.header.spacingBefore = 16; t.text.fontSize = t.header.fontSize - 2.9; t.text.lineHeight = 1.26; t.text.letterSpacing = 0.625; sp.push(t)
    // 6: reduce margins
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.box.leftPad = 3; t.box.rightPad = 0; t.box.topPad = -7 - 6.66; sp.push(t)
    // 7: crunch vertically
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.text.lineHeight = 1.1; sp.push(t)
    // 8: crunch horizontally
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.text.letterSpacing = 0.3; sp.push(t)
    // 9: tiny red warning (still kept for behavior)
    t = JSON.parse(JSON.stringify(sp[sp.length - 1]))
    t.box.leftPad = 1; t.box.rightPad = -2; t.box.topPad = -9 - 6.66; t.header.fontSize = 24.0; t.header.fontColor = 'red'; t.text.fontSize = t.header.fontSize - 2.9; t.text.fontColor = 'red'; sp.push(t)
    return sp
  }

  function trySpec(draw: boolean, spec: any) {
    let yTop = spec.box.top + (spec.box.topPad || 0)
    const boxRect = { box: spec.box }
    const powers = [...card.powers].sort((a, b) => a.order - b.order)
    let minHeaderWidth = Infinity
    for (const p of powers) {
      const head = (p.heading || '').toUpperCase().trim()
      const body = (p.body || '').trim()
      if (!head && !body) continue
      const y1: any = drawParagraph(ctx, head, yTop, {
        fontFamily: spec.header.fontFamily,
        fontSize: spec.header.fontSize,
        baseline: spec.header.baseline,
        fontColor: spec.header.fontColor,
        alignment: spec.header.alignment,
        letterSpacing: spec.header.letterSpacing,
        lineHeight: spec.header.lineHeight,
        spacingBefore: spec.header.spacingBefore,
      }, boxRect, draw, (info) => { minHeaderWidth = Math.min(minHeaderWidth, info.width) })
      if (!y1) return false
      const y2: any = drawParagraph(ctx, body, y1, {
        fontFamily: spec.text.fontFamily,
        fontSize: spec.text.fontSize,
        baseline: spec.text.baseline,
        fontColor: spec.text.fontColor,
        alignment: spec.text.alignment,
        letterSpacing: spec.text.letterSpacing,
        lineHeight: spec.text.lineHeight,
        spacingBefore: spec.text.spacingBefore,
      }, boxRect, draw)
      if (!y2) return false
      yTop = y2
    }
    // Enforce minimum headline width near the bottom to avoid overly narrow headings
    const MIN_HEADER_WIDTH = 240
    if (!draw && minHeaderWidth < MIN_HEADER_WIDTH) return false
    return true
  }

  const specs = makeSpecs()
  let chosenIdx = -1
  for (let i = 0; i < specs.length; i++) {
    if (trySpec(false, specs[i])) { chosenIdx = i; break }
  }
  if (chosenIdx === -1) chosenIdx = specs.length - 1
  trySpec(true, specs[chosenIdx])
}

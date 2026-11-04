import { phoneLayout, teaserWords } from './settings'

export interface Line {
  text: string
  size: number
  x: number
  y: number
  advance: number
  left: number
  right: number
  ascent: number
  descent: number
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface TextBlock {
  lines: Line[]
  font: string
  size: number
  ink: Rect
}
export interface Layout { width: number; height: number; word: TextBlock; teaser: TextBlock; lineHeight: number }

const scratch = document.createElement('canvas').getContext('2d')!
const mobile = matchMedia(phoneLayout)
const safe = document.querySelector<HTMLElement>('#safe')!
const title = document.querySelector<HTMLElement>('#title')!
const h1 = title.querySelector('h1')!
const p = title.querySelector('p')!
const wordSpans = Array.from(h1.querySelectorAll('span'))
const teaserSpans = Array.from(p.querySelectorAll('span'))
const wordText = ['Martin', '&', 'Martin']

export function textStyle(ctx: CanvasRenderingContext2D, font: string, size: number) {
  ctx.font = `${size}px ${font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fontKerning = 'none'
}

const metrics = (text: string) => scratch.measureText(text)
const inkWidth = (m: TextMetrics) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight
const widthOf = (lines: readonly string[]) => Math.max(...lines.map(t => inkWidth(metrics(t))))
const baseline = (element: Element) => element.querySelector('i')!.getBoundingClientRect().top

function block(lines: readonly string[], baselines: number[], font: string, size: number, center: number,
  scales: readonly number[] = []): TextBlock {
  const shaped = lines.map((text, i): Line => {
    const lineSize = size * (scales[i] ?? 1)
    textStyle(scratch, font, lineSize)
    const m = metrics(text)
    return { text, size: lineSize, x: center + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, y: baselines[i],
      advance: m.width, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent }
  })
  const x = Math.min(...shaped.map(l => l.x - l.left))
  const y = Math.min(...shaped.map(l => l.y - l.ascent))
  const right = Math.max(...shaped.map(l => l.x + l.right))
  const bottom = Math.max(...shaped.map(l => l.y + l.descent))
  return { lines: shaped, size, font, ink: { x, y, width: right - x, height: bottom - y } }
}

export function fit(canvas: HTMLCanvasElement, family: string | null): Layout {
  const font = family ? `"${family}"` : 'ui-monospace, monospace'
  const { width, height } = canvas.getBoundingClientRect()
  // A hidden canvas still has a layout box. Use the padded content box for safe areas.
  const area = safe.getBoundingClientRect()
  const center = area.left + area.width / 2
  const limitWidth = Math.max(1, Math.min(width * .9, area.width))
  const limitHeight = Math.max(1, Math.min(height * .8, area.height))
  const isMobile = mobile.matches
  const teaserText = isMobile ? teaserWords : [teaserWords.join(' ')]
  textStyle(scratch, font, 1000)
  const wordEm = widthOf(wordText) / 1000
  const teaserEm = widthOf(teaserText) / 1000
  const ratio = wordEm / teaserEm
  const wordSize = Math.min(limitWidth / wordEm, limitHeight / (3 * .95 + .24 + teaserText.length * ratio * 1.14))
  const teaserSize = wordSize * ratio
  const lineHeight = wordSize * .95
  title.style.setProperty('--word-size', `${wordSize}px`)
  title.style.setProperty('--teaser-size', `${teaserSize}px`)
  title.style.transform = ''
  const wordBaselines = wordSpans.map(baseline)
  const teaserBaselines = isMobile ? teaserSpans.map(baseline) : [baseline(teaserSpans[1])]
  const word = block(wordText, wordBaselines, font, wordSize, center, [1, .9, 1])
  const teaser = block(teaserText, teaserBaselines, font, teaserSize, center)
  const top = word.ink.y
  const bottom = teaser.ink.y + teaser.ink.height
  const dy = area.top + area.height / 2 - (top + bottom) / 2
  title.style.transform = `translateY(${dy}px)`
  for (const group of [word, teaser]) {
    group.ink.y += dy
    for (const line of group.lines) line.y += dy
  }
  const align = (element: HTMLElement, line: Line) => {
    element.style.position = 'relative'
    element.style.left = `${line.x - center}px`
  }
  wordSpans.forEach((el, i) => align(el, word.lines[i]))
  p.style.left = ''
  teaserSpans.forEach(el => { el.style.left = '' })
  if (isMobile) teaserSpans.forEach((el, i) => align(el, teaser.lines[i]))
  else align(p, teaser.lines[0])
  return { width, height, word, teaser, lineHeight }
}

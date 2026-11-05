import './review.css'
import type { Controls, Setup } from './app'
import { defaults, clamp, type Settings, type Style, type WaterLook } from './settings'
import { smooth } from './split/smooth'
import { snapped } from './split/snapped'
import { splintered } from './split/splintered'

const strategies = { splintered, smooth, snapped }
const styles = Object.keys(strategies) as Style[]
const styleNames: Record<Style, string> = { splintered: 'Splintered cells', smooth: 'Smooth slide', snapped: 'Pixel-snapped' }
const waterNames: Record<WaterLook, string> = { quiet: 'Quiet Black Pool', reflective: 'Reflective Liquid' }
type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]
type Range = readonly [NumberKey, string, number, number, number, string]
const sections: readonly [string, Range[]][] = [
  ['Plates', [
    ['split', 'Maximum split', 0, 15, .1, '%'],
    ['cyan', 'Cyan depth', 0, 1.5, .01, ''],
    ['magenta', 'Magenta depth', 0, 1.5, .01, ''],
    ['yellow', 'Yellow depth', 0, 1.5, .01, ''],
    ['fan', 'Plate fan', 0, 120, 1, '°'],
    ['variation', 'Cell depth variation', 0, 100, 1, '%'],
    ['lag', 'Cursor lag', 0, 600, 10, ' ms'],
  ]],
  ['Rain', [
    ['dropMin', 'Time between drops · min', .25, 6, .05, ' s'],
    ['dropMax', 'Time between drops · max', .25, 6, .05, ' s'],
    ['lifetime', 'Wave lifetime', 1, 5, .1, ' s'],
    ['bend', 'Text bend at crest', 0, 5, .1, '%'],
    ['shimmer', 'CMY refraction', 0, 50, 1, '%'],
    ['highlight', 'Surface reflections', 0, 25, 1, '%'],
    ['teaserRipple', 'Teaser ripple strength', 0, 100, 1, '%'],
  ]],
]

function fromURL(params: URLSearchParams): Settings {
  const settings = { ...defaults }
  if (!params.has('tune') || params.get('v') !== '1') return settings
  let saved: Partial<Settings>
  try { saved = JSON.parse(params.get('settings') ?? '{}') ?? {} } catch { return settings }
  if (styles.includes(saved.style as Style)) settings.style = saved.style!
  if (saved.waterLook === 'quiet' || saved.waterLook === 'reflective') settings.waterLook = saved.waterLook
  if (typeof saved.background === 'string' && /^#[0-9a-f]{6}$/i.test(saved.background)) settings.background = saved.background
  for (const [, ranges] of sections) for (const [key, , min, max] of ranges) {
    const value = saved[key]
    if (typeof value === 'number' && Number.isFinite(value)) settings[key] = clamp(value, min, max)
  }
  if (settings.dropMin > settings.dropMax) settings.dropMax = settings.dropMin
  return settings
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function panel(settings: Settings, api: Controls) {
  const root = el('aside')
  root.id = 'tuning'
  root.setAttribute('aria-label', 'Motion tuning')
  const head = el('header')
  const title = el('h2', 'Motion tuning')
  const hide = el('button', 'Hide')
  hide.title = 'Hide panel (H)'
  head.append(title, hide)
  const detail = el('p', 'Preview only · 1–3 change style · H toggles panel')
  detail.className = 'tune-detail'

  function choice<T extends string>(name: string, options: readonly T[], text: (option: T) => string,
    value: T, onChange: (option: T) => void) {
    const group = el('fieldset')
    const labels = el('div')
    labels.className = 'tune-choices'
    const controls = new Map<T, { input: HTMLInputElement; caption: HTMLElement }>()
    for (const option of options) {
      const label = el('label')
      const input = el('input')
      const caption = el('span', text(option))
      input.type = 'radio'
      input.name = name
      input.value = option
      input.checked = option === value
      input.onchange = () => { if (input.checked) onChange(option) }
      controls.set(option, { input, caption })
      label.append(input, caption)
      labels.append(label)
    }
    group.append(el('legend', name), labels)
    root.append(group)
    return controls
  }

  root.append(head, detail)
  const style = (value: Style) => {
    settings.style = value
    styleChoice.get(value)!.input.checked = true
    api.refresh()
  }
  const styleChoice = choice('Split style', styles, s => styleNames[s], settings.style, style)
  choice<WaterLook>('Water surface', ['quiet', 'reflective'], s => waterNames[s], settings.waterLook,
    value => {
      settings.waterLook = value
      api.refresh()
    })

  const sync = new Map<NumberKey, () => void>()
  for (const [heading, ranges] of sections) {
    const group = el('fieldset')
    group.append(el('legend', heading))
    for (const [key, name, min, max, step, unit] of ranges) {
      const label = el('label')
      const input = el('input')
      const output = el('output')
      const caption = el('span', name)
      input.type = 'range'
      input.min = String(min); input.max = String(max); input.step = String(step)
      input.setAttribute('aria-label', name)
      label.className = 'tune-range'
      const reflect = () => { input.value = String(settings[key]); output.value = settings[key] + unit }
      sync.set(key, reflect)
      reflect()
      input.oninput = () => {
        settings[key] = Number(input.value)
        if (key === 'dropMin' && settings.dropMin > settings.dropMax) {
          settings.dropMax = settings.dropMin
          sync.get('dropMax')?.()
        }
        if (key === 'dropMax' && settings.dropMax < settings.dropMin) {
          settings.dropMin = settings.dropMax
          sync.get('dropMin')?.()
        }
        reflect()
        api.refresh()
      }
      label.append(caption, output, input)
      group.append(label)
    }
    root.append(group)
  }

  const bg = el('label', 'Background')
  const color = el('input')
  color.type = 'color'
  color.value = settings.background
  color.oninput = () => { settings.background = color.value; api.refresh() }
  bg.append(color)
  const actions = el('div')
  actions.className = 'tune-actions'
  const replay = el('button', 'Replay opening')
  replay.onclick = () => api.replay()
  const copy = el('button', 'Copy link')
  const status = el('div')
  status.className = 'tune-status'
  status.setAttribute('role', 'status')
  const manual = el('input')
  manual.readOnly = true
  manual.hidden = true
  manual.setAttribute('aria-label', 'Shareable preview URL')
  copy.onclick = async () => {
    const url = new URL(location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('tune', '')
    url.searchParams.set('v', '1')
    url.searchParams.set('settings', JSON.stringify(settings))
    try {
      await navigator.clipboard.writeText(url.href)
      manual.hidden = true
      status.textContent = 'Link copied.'
    } catch {
      status.textContent = 'Select and copy this link:'
      manual.value = url.href
      manual.hidden = false
      manual.select()
    }
  }
  actions.append(replay, copy)
  root.append(bg, actions, status, manual)
  hide.onclick = () => { root.hidden = true }
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
    if (e.target instanceof Element && e.target.matches('input:not([type=radio]), textarea, [contenteditable]')) return
    if (e.key.toLowerCase() === 'h') root.hidden = !root.hidden
    if (e.key === '1' || e.key === '2' || e.key === '3') style(styles[Number(e.key) - 1])
  })
  document.body.append(root)
}

export const setup: Setup = api => {
  const params = new URLSearchParams(location.search)
  const settings = fromURL(params)
  if (params.has('tune')) panel(settings, api)
  return { settings, strategy: () => strategies[settings.style] }
}

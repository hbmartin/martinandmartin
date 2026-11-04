import fonts from './font-assets.json'

export type Shape = keyof typeof fonts
export const shapes = Object.keys(fonts) as Shape[]
export type Vec = readonly [number, number]
export type Style = 'splintered' | 'smooth' | 'snapped'
export interface Settings {
  style: Style
  shape: Shape | 'random'
  split: number
  cyan: number
  magenta: number
  yellow: number
  fan: number
  variation: number
  lag: number
  dropMin: number
  dropMax: number
  lifetime: number
  bend: number
  shimmer: number
  highlight: number
  teaserRipple: number
  background: string
}

export const defaults: Readonly<Settings> = {
  style: 'splintered', shape: 'random', split: 6, cyan: 1, magenta: .7, yellow: .45,
  fan: 120, variation: 40, lag: 200, dropMin: 1.5, dropMax: 3.5, lifetime: 2.5,
  bend: 1.5, shimmer: 15, highlight: 8, teaserRipple: 40, background: '#0a0a0a',
}
export const ZERO: Vec = [0, 0]
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export const phoneLayout = '(max-width: 600px), (pointer: coarse) and (max-height: 600px)'
export const teaserWords = ['Coming soon to a', 'supply chain near you.'] as const

export interface Boot {
  start: number
  shape: Shape
  ready: Promise<string | null>
  load(shape: Shape): Promise<string>
  randomShape(): Shape
}
declare global { interface Window { mmBoot: Boot } }

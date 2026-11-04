export type Vec = readonly [number, number]
export type Style = 'splintered' | 'smooth' | 'snapped'
export type WaterLook = 'quiet' | 'reflective'
export interface Settings {
  style: Style
  shape: 'circle'
  waterLook: WaterLook
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
  style: 'smooth', shape: 'circle', waterLook: 'quiet', split: 4.5, cyan: 1, magenta: .7, yellow: .45,
  fan: 120, variation: 40, lag: 250, dropMin: 2.5, dropMax: 5, lifetime: 4.5,
  bend: 1.5, shimmer: 15, highlight: 8, teaserRipple: 20, background: '#0a0a0a',
}
export const ZERO: Vec = [0, 0]
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export const phoneLayout = '(max-width: 600px), (pointer: coarse) and (max-height: 600px)'
export const teaserWords = ['Coming soon to a', 'supply chain near you.'] as const

export interface Boot {
  start: number
  ready: Promise<string | null>
}
declare global { interface Window { mmBoot: Boot } }

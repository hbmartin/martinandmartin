import { fit, type Layout } from './layout'
import { getGL, Renderer, MAX_RINGS, type Ring } from './renderer'
import type { Strategy } from './plates'
import { ZERO, clamp, type Settings, type Shape, type Vec } from './settings'

export interface Controls {
  refresh(): void
  replay(): void
  setShape(shape: Settings['shape']): Promise<boolean>
  shape(): Shape
}
export type Setup = (controls: Controls) => {
  settings: Readonly<Settings>
  strategy: () => Strategy
}

const root = document.documentElement
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const coarse = matchMedia('(pointer: coarse)')
const ease = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x) }
const fade = (time: number, from: number, to: number) => ease((time - from) / (to - from))

export async function start(setup: Setup) {
  const boot = window.mmBoot
  if (!boot) return
  let shape = boot.shape
  let family: string | null = null
  let fontRevision = 0
  let layout: Layout | undefined
  let renderer: Renderer | undefined
  let frame = 0
  let needsLayout = false
  let redraw = true
  let permanentlyStatic = false
  let lossTimer = 0
  let densityStep = 0
  let slowWindows = 0, sampleMs = 0, samples = 0
  const scales = [1, .75, .5]

  let clock = 0, previous: number | undefined, introStart = 0, introDuration = 2600
  let openingRain = false, nextDrop = 0
  const drops: Ring[] = []
  let pointer: Vec = ZERO, mouse: Vec = ZERO, touch: Vec = ZERO
  let touchMode = coarse.matches
  let touchHeld = false
  let driftAfter = 0, driftStart = 0
  const contacts = new Set<number>()
  let press: { id: number; x: number; y: number; dragged: boolean } | undefined
  let pinching = false

  const config = setup({
    refresh() {
      root.style.setProperty('--background', config.settings.background)
      renderer?.invalidate()
      redraw = true
      if (openingRain) nextDrop = clock + delay()
      schedule()
    },
    replay() {
      if (!renderer) return
      introStart = clock
      introDuration = 2600
      resetRain()
      pointer = ZERO
      redraw = true
      schedule()
    },
    async setShape(requested) {
      await boot.ready
      const selected = requested === 'random' ? boot.randomShape() : requested
      const revision = ++fontRevision
      try {
        const loaded = await boot.load(selected)
        if (revision !== fontRevision) return false
        shape = selected
        family = loaded
        root.style.setProperty('--type', `"${family}"`)
        root.dataset.font = 'selected'
        resize()
        return true
      } catch { return false }
    },
    shape: () => shape,
  })
  const { settings } = config
  root.style.setProperty('--background', settings.background)

  function resetRain() {
    openingRain = false
    drops.length = 0
    nextDrop = 0
    driftStart = clock + introDuration
  }
  function delay() { return (settings.dropMin + Math.random() * (settings.dropMax - settings.dropMin)) * 1000 }
  function addDrop(x: number, y: number) {
    if (!renderer) return
    if (drops.length === MAX_RINGS) drops.shift()
    drops.push({ x, y, born: clock })
    redraw = true
  }
  function randomDrop() {
    if (!layout) return
    const box = Math.random() < .7 ? layout.word.ink : { x: 0, y: 0, width: layout.width, height: layout.height }
    addDrop(box.x + box.width * Math.random(), box.y + box.height * Math.random())
  }
  function normalize(x: number, y: number): Vec {
    const rect = canvas.getBoundingClientRect()
    const dx = x - rect.left - rect.width / 2, dy = y - rect.top - rect.height / 2
    const length = Math.hypot(dx, dy)
    if (length === 0) return ZERO
    const amount = Math.min(1, Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2)))
    return [dx / length * amount, dy / length * amount]
  }
  function panelTarget(e: Event) { return e.target instanceof Element && !!e.target.closest('#tuning') }
  addEventListener('pointermove', e => {
    if (panelTarget(e)) return
    if (e.pointerType !== 'touch') {
      touchMode = false
      mouse = normalize(e.clientX, e.clientY)
    }
    if (press?.id === e.pointerId) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) press.dragged = true
      if (e.pointerType === 'touch' && press.dragged && !pinching) {
        touchHeld = true
        touch = normalize(e.clientX, e.clientY)
      }
    }
  }, { passive: true })
  addEventListener('pointerdown', e => {
    if (panelTarget(e)) return
    if (e.pointerType === 'touch') {
      touchMode = true
      contacts.add(e.pointerId)
      if (contacts.size > 1) {
        press = undefined
        touchHeld = false
        pinching = true
        driftAfter = clock + 1000
        return
      }
    }
    if (e.isPrimary && e.button === 0 && !pinching) press = { id: e.pointerId, x: e.clientX, y: e.clientY, dragged: false }
  }, { passive: true })
  const release = (e: PointerEvent, canceled: boolean) => {
    if (press?.id === e.pointerId) {
      if (!canceled && !panelTarget(e) && !pinching && !press.dragged
          && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 8) {
        const rect = canvas.getBoundingClientRect()
        addDrop(e.clientX - rect.left, e.clientY - rect.top)
      }
      if (e.pointerType === 'touch' && touchHeld) driftAfter = clock + 1000
      touchHeld = false
      press = undefined
    }
    contacts.delete(e.pointerId)
    if (!contacts.size) pinching = false
  }
  addEventListener('pointerup', e => release(e, false), { passive: true })
  addEventListener('pointercancel', e => release(e, true), { passive: true })
  addEventListener('pointerout', e => {
    if (e.pointerType !== 'touch' && !e.relatedTarget) mouse = ZERO
  }, { passive: true })
  addEventListener('blur', () => { mouse = ZERO; press = undefined; touchHeld = false; contacts.clear(); pinching = false })

  function resize() {
    needsLayout = true
    if (renderer) schedule()
    else if (root.dataset.font) { layout = fit(canvas, family); needsLayout = false }
  }
  addEventListener('resize', resize, { passive: true })
  new ResizeObserver(resize).observe(canvas)

  function stopLoop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    previous = undefined
    sampleMs = samples = slowWindows = 0
  }
  function showStatic(permanent: boolean) {
    stopLoop()
    if (permanent) {
      permanentlyStatic = true
      renderer?.dispose()
    }
    renderer = undefined
    root.dataset.view = 'static'
  }
  reduce.addEventListener('change', () => { if (reduce.matches && root.dataset.font) showStatic(true) })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop()
    else schedule()
  })
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    showStatic(false)
    lossTimer = window.setTimeout(() => { permanentlyStatic = true }, 2000)
  })
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(lossTimer)
    if (permanentlyStatic || reduce.matches || !family) return
    // The old drawing resources belonged to the lost context.
    introStart = clock - introDuration
    resetRain()
    activate(true)
  })

  function schedule() {
    if (!frame && renderer && !document.hidden) frame = requestAnimationFrame(tick)
  }

  function render(dt: number) {
    if (!renderer || !layout) return
    const progress = (clock - introStart) * 2600 / introDuration
    const wordOpacity = fade(progress, 0, 900)
    const teaserOpacity = fade(progress, 1400, 2200)
    const splitOpacity = fade(progress, 2200, 2600)
    if (progress >= 900 && (!openingRain || clock >= nextDrop)) {
      randomDrop()
      openingRain = true
      nextDrop = clock + delay()
    }
    const hadRings = drops.length > 0
    for (let i = drops.length - 1; i >= 0; i--) {
      if (clock - drops[i].born >= settings.lifetime * 1000) drops.splice(i, 1)
    }
    let target = mouse
    if (touchMode) {
      const phase = (clock - driftStart) * Math.PI * 2 / 24000
      target = touchHeld || clock < driftAfter ? touch : [Math.sin(phase) * .26, Math.sin(phase * .68) * .17]
    }
    const follow = settings.lag === 0 ? 1 : 1 - Math.exp(-dt / settings.lag)
    const dx = target[0] * splitOpacity - pointer[0], dy = target[1] * splitOpacity - pointer[1]
    const next: Vec = Math.hypot(dx, dy) < .0004
      ? [target[0] * splitOpacity, target[1] * splitOpacity]
      : [pointer[0] + dx * follow, pointer[1] + dy * follow]
    const moving = next[0] !== pointer[0] || next[1] !== pointer[1]
    pointer = next
    if (redraw || progress < 2600 || moving || hadRings || drops.length) {
      renderer.draw(pointer, settings, shape, config.strategy(), wordOpacity, teaserOpacity, clock, drops)
      redraw = progress < 2600
    }
  }

  function tick(timestamp: number) {
    frame = 0
    if (!renderer || document.hidden) return
    try {
      const dt = previous === undefined ? 0 : Math.max(0, timestamp - previous)
      previous = timestamp
      clock += dt
      if (needsLayout) {
        layout = fit(canvas, family)
        renderer.resize(layout, scales[densityStep])
        needsLayout = false
        redraw = true
        sampleMs = samples = slowWindows = 0
      } else if (dt) {
        sampleMs += dt
        samples++
        if (sampleMs >= 1800) {
          slowWindows = sampleMs / samples > 21 ? slowWindows + 1 : 0
          sampleMs = samples = 0
          if (slowWindows >= 2) {
            densityStep++
            if (densityStep === scales.length) return showStatic(true)
            needsLayout = true
          }
        }
      }
      render(Math.min(dt, 100))
      schedule()
    } catch (error) {
      console.error('Martin & Martin rendering unavailable', error)
      showStatic(true)
    }
  }

  function activate(restored = false) {
    if (!layout || permanentlyStatic) return
    try {
      const gl = getGL(canvas)
      if (!gl || gl.isContextLost()) return showStatic(true)
      renderer = new Renderer(canvas, gl)
      renderer.resize(layout, scales[densityStep])
      needsLayout = false
      if (!restored) {
        introDuration = Math.min(2600, 2965 - (performance.now() - boot.start))
        if (introDuration <= 50 || root.dataset.view !== 'pending') return showStatic(true)
        resetRain()
      }
      redraw = true
      render(0)
      root.dataset.view = 'canvas'
      schedule()
    } catch (error) {
      console.error('Martin & Martin rendering unavailable', error)
      showStatic(true)
    }
  }

  const original = await boot.ready
  if (fontRevision === 0) family = original
  layout = fit(canvas, family)
  if (!family || reduce.matches || permanentlyStatic) return showStatic(true)
  activate()
}

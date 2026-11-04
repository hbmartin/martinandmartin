import { test, expect, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

// Drive the real built renderer at exact times without a test API in the app.
// The shader, drop scheduler, input handling and compositing all run unchanged.
async function controlled(page: Page, settings: object = {}) {
  await page.addInitScript(() => {
    let seed = 17, timestamp = 0, id = 0
    const callbacks = new Map<number, FrameRequestCallback>()
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id }
    window.cancelAnimationFrame = key => { callbacks.delete(key) }
    Object.defineProperty(window, 'advanceWaterFrames', { value: (duration: number, step: number) => {
      const tick = () => {
        const batch = [...callbacks.values()]
        callbacks.clear()
        for (const callback of batch) callback(timestamp)
      }
      if (duration === 0) { tick(); return }
      const end = timestamp + duration
      while (timestamp < end) {
        timestamp = Math.min(end, timestamp + step)
        tick()
      }
    } })
  })
  await page.goto('/?' + new URLSearchParams({ tune: '', v: '1', shape: 'line', settings: JSON.stringify({
    split: 0, lag: 0, dropMin: 6, dropMax: 6, lifetime: 1, ...settings,
  }) }))
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
  await page.getByRole('button', { name: 'Hide', exact: true }).click()
  await advance(page, 16)
  await advance(page, 3000)
}

async function advance(page: Page, duration: number, step = 16) {
  await page.evaluate(({ duration, step }) => {
    (window as unknown as { advanceWaterFrames: (duration: number, step: number) => void })
      .advanceWaterFrames(duration, step)
  }, { duration, step })
}

async function restart(page: Page, step = 16) {
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
  await page.getByRole('button', { name: 'Hide', exact: true }).click()
  await advance(page, step, step)
  await advance(page, 3000, step)
}

const takingScreenshot = new WeakSet<Page>()
async function frame(page: Page) {
  takingScreenshot.add(page)
  try { return PNG.sync.read(await page.locator('#stage').screenshot()) }
  finally { takingScreenshot.delete(page) }
}

function renderingErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() !== 'error') return
    // Playwright's WebKit screenshot synchronizer inserts a temporary `body {}`
    // stylesheet. Our CSP correctly blocks it. Exclude only that diagnostic
    // during capture; keep all page-load and application errors actionable.
    const screenshotStyle = page.context().browser()?.browserType().name() === 'webkit'
      && takingScreenshot.has(page)
      && message.text() === "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy."
    if (!screenshotStyle) errors.push(message.text())
  })
  return errors
}
function difference(a: PNG, b: PNG) {
  let changed = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[i + channel] - b.data[i + channel]))) > 2) changed++
  }
  return changed
}

test('water is elapsed-time deterministic, refracts CMY, and settles completely', async ({ page }, testInfo) => {
  const errors = renderingErrors(page)
  await controlled(page)
  const still = await frame(page)
  await page.mouse.click(550, 250)
  await advance(page, 480, 16)
  const slow = await frame(page)
  expect(difference(still, slow)).toBeGreaterThan(150)
  let colored = 0
  for (let i = 0; i < slow.data.length; i += 4) {
    const rgb = [...slow.data.subarray(i, i + 3)]
    if (Math.max(...rgb) - Math.min(...rgb) > 25) colored++
  }
  expect(colored).toBeGreaterThan(25)
  await testInfo.attach('quiet-wave', { body: PNG.sync.write(slow), contentType: 'image/png' })
  await advance(page, 528)
  expect(difference(still, await frame(page))).toBe(0)

  await restart(page, 8)
  await page.mouse.click(550, 250)
  await advance(page, 480, 8)
  expect(difference(slow, await frame(page))).toBe(0)
  expect(errors).toEqual([])
})

test('both looks share refraction, overlapping drops change the surface, and repeated taps stay bounded', async ({ page }, testInfo) => {
  await controlled(page, { highlight: 0 })
  await page.mouse.click(550, 250)
  await advance(page, 480)
  const single = await frame(page)
  await restart(page)
  await page.mouse.click(550, 250)
  await advance(page, 320)
  await page.mouse.click(590, 280)
  await advance(page, 160)
  const overlap = await frame(page)
  expect(difference(single, overlap)).toBeGreaterThan(150)
  await page.keyboard.press('h')
  await page.getByRole('radio', { name: 'Reflective Liquid' }).check()
  await page.keyboard.press('h')
  // A zero-time redraw proves that the treatments share exactly the same
  // refraction when their only difference (surface reflections) is disabled.
  await advance(page, 0)
  expect(difference(overlap, await frame(page))).toBe(0)
  for (let i = 0; i < 20; i++) await page.mouse.click(560 + i * 2, 260 + i)
  await advance(page, 320)
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
  await testInfo.attach('overlapping-waves', { body: PNG.sync.write(await frame(page)), contentType: 'image/png' })
  await advance(page, 1100)
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
})

test('switching water treatments preserves the next rain event', async ({ page }) => {
  await controlled(page, { highlight: 0 })
  await advance(page, 4200)
  const uninterrupted = await frame(page)
  await restart(page)
  await page.keyboard.press('h')
  await page.getByRole('radio', { name: 'Reflective Liquid' }).check()
  await page.keyboard.press('h')
  await advance(page, 4200)
  expect(difference(uninterrupted, await frame(page))).toBe(0)
})

test('all review split styles support the smaller Circle ampersand', async ({ page }) => {
  const errors = renderingErrors(page)
  await controlled(page, { split: 3 })
  await page.mouse.move(1350, 750)
  for (const style of ['1', '2', '3']) {
    await page.keyboard.press(style)
    await advance(page, 16)
    await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
    const image = await frame(page)
    let colored = 0
    for (let i = 0; i < image.data.length; i += 4) {
      const rgb = [...image.data.subarray(i, i + 3)]
      if (Math.max(...rgb) - Math.min(...rgb) > 50) colored++
    }
    expect(colored).toBeGreaterThan(100)
  }
  expect(errors).toEqual([])
})

test('reflective lighting, invalid look fallback, resize and Circle composition', async ({ page }, testInfo) => {
  await controlled(page, { waterLook: 'unknown', lifetime: 4.5 })
  await page.keyboard.press('h')
  await expect(page.getByRole('radio', { name: 'Quiet Black Pool' })).toBeChecked()
  await page.keyboard.press('h')
  await page.mouse.click(550, 250)
  await advance(page, 480)
  const quiet = await frame(page)
  await page.keyboard.press('h')
  await page.getByRole('radio', { name: 'Reflective Liquid' }).check()
  await page.keyboard.press('h')
  await advance(page, 0)
  expect(difference(quiet, await frame(page))).toBeGreaterThan(150)
  await testInfo.attach('reflective-wave', { body: PNG.sync.write(await frame(page)), contentType: 'image/png' })
  const proportions = await page.locator('h1 span').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)))
  expect(proportions[1] / proportions[0]).toBeCloseTo(.9, 4)
  await page.setViewportSize({ width: 375, height: 667 })
  await advance(page, 16)
  const sizes = await page.locator('#stage').evaluate(el => [el.getAttribute('width'), el.getAttribute('height')])
  expect(sizes).toEqual(['375', '667'])
  await testInfo.attach('reflective-mobile', { body: PNG.sync.write(await frame(page)), contentType: 'image/png' })
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0])
})

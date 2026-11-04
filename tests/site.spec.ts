import { test, expect, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

const qa = { dropMin: 6, dropMax: 6, lifetime: 1, bend: 0, shimmer: 0, highlight: 0, lag: 0 }
function url(settings: object = {}, shape = 'square') {
  return '/?' + new URLSearchParams({ tune: '', v: '1', shape, settings: JSON.stringify({ ...qa, ...settings }) })
}
async function stage(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-view', 'canvas')
}
async function pixels(page: Page) {
  const { data } = PNG.sync.read(await page.screenshot())
  const count = { white: 0, cyan: 0, magenta: 0, yellow: 0, red: 0, green: 0, blue: 0, lit: 0 }
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    if (Math.max(r, g, b) > 20) count.lit++
    if (r > 220 && g > 220 && b > 220) count.white++
    if (r < 65 && g > 170 && b > 170) count.cyan++
    if (g < 65 && r > 170 && b > 170) count.magenta++
    if (b < 65 && r > 170 && g > 170) count.yellow++
    if (r > 170 && g < 65 && b < 65) count.red++
    if (g > 170 && r < 65 && b < 65) count.green++
    if (b > 170 && r < 65 && g < 65) count.blue++
  }
  return count
}

test('clean review preview loads a single font with a valid CSP and no external requests', async ({ page, context }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const response = await page.goto('/')
  expect(response?.headers()['x-robots-tag']).toBe('noindex')
  await stage(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Martin & Martin')
  await expect(page.locator('main p')).toHaveText('Coming soon to a supply chain near you.')
  await expect(page.locator('#tuning')).toHaveCount(0)
  expect(requests.filter(request => request.endsWith('.woff2'))).toHaveLength(1)
  expect(requests.every(request => request.startsWith('http://127.0.0.1:4173/'))).toBe(true)
  expect(await context.cookies()).toEqual([])
  expect(errors).toEqual([])
})

test('opening starts dark, reveals both lines and exposes only CMY at the edge', async ({ page }) => {
  await page.goto(url(), { waitUntil: 'domcontentloaded' })
  await stage(page)
  await page.getByRole('button', { name: 'Hide', exact: true }).click()
  await page.waitForTimeout(2900)
  const aligned = await pixels(page)
  expect(aligned.white).toBeGreaterThan(16000)
  expect(aligned.cyan + aligned.magenta + aligned.yellow).toBe(0)
  await page.mouse.move(1300, 770)
  await expect.poll(async () => (await pixels(page)).cyan).toBeGreaterThan(150)
  const split = await pixels(page)
  expect(split.magenta).toBeGreaterThan(150)
  expect(split.yellow).toBeGreaterThan(150)
  expect(split.red + split.green + split.blue).toBe(0)
  await page.mouse.move(720, 450)
  await expect.poll(async () => {
    const p = await pixels(page)
    return p.cyan + p.magenta + p.yellow
  }).toBe(0)
  await page.mouse.move(1400, 700)
  await expect.poll(async () => (await pixels(page)).cyan).toBeGreaterThan(150)
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' })))
  await expect.poll(async () => (await pixels(page)).cyan).toBe(0)
  await page.keyboard.press('h')
  await page.getByRole('button', { name: 'Replay opening' }).click()
  await page.getByRole('button', { name: 'Hide', exact: true }).click()
  expect((await pixels(page)).white).toBeLessThan(100)
  await expect.poll(async () => (await pixels(page)).white, { timeout: 3000 }).toBeGreaterThan(16000)
})

test('review settings, shortcuts and resolved font round-trip through a copied URL', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(url({ split: 999, dropMin: 5, dropMax: 2 }, 'triangle'))
  await stage(page)
  await expect(page.getByRole('slider', { name: 'Maximum split' })).toHaveValue('15')
  await expect(page.getByRole('slider', { name: 'Time between drops · max' })).toHaveValue('5')
  await page.keyboard.press('3')
  await expect(page.getByRole('radio', { name: 'Pixel-snapped' })).toBeChecked()
  await page.getByText('Line', { exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('--type', '"Geist Pixel line"')
  await page.keyboard.press('h')
  await expect(page.locator('#tuning')).toBeHidden()
  await page.keyboard.press('h')
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.locator('.tune-status')).toHaveText('Link copied.')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  await page.goto(copied)
  await expect(page.getByRole('radio', { name: 'Pixel-snapped' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Line', exact: true })).toBeChecked()
  await expect(page.getByRole('slider', { name: 'Maximum split' })).toHaveValue('15')
})

test('touch tap creates a ring; dragging changes the split without a tap and the page stays in bounds', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })
  try {
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4173' + url({ style: 'smooth', split: 0, highlight: 22 }))
    await stage(page)
    await page.getByRole('button', { name: 'Hide', exact: true }).tap()
    await page.waitForTimeout(3000)
    const before = await pixels(page)
    await page.touchscreen.tap(45, 42)
    await expect.poll(async () => (await pixels(page)).lit).toBeGreaterThan(before.lit + 50)
    const spans = await page.locator('main p span').evaluateAll(els => els.map(el => el.getBoundingClientRect().top))
    expect(spans[1]).toBeGreaterThan(spans[0])
    expect(await page.locator('#stage').evaluate(el => getComputedStyle(el).touchAction)).toContain('pinch-zoom')
    await page.goto('http://127.0.0.1:4173' + url({ style: 'smooth' }))
    await stage(page)
    await page.getByRole('button', { name: 'Hide', exact: true }).tap()
    await page.waitForTimeout(2900)
    const client = await context.newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 335 }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 595 }] })
    await expect.poll(async () => (await pixels(page)).cyan).toBeGreaterThan(50)
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0])
  } finally { await context.close() }
})

test('production ignores tuning parameters, preserves fallback HTML and serves launch metadata', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  const response = await page.goto('http://127.0.0.1:4174' + url({ background: '#ffffff' }, 'line'))
  await expect(page.locator('html')).toHaveAttribute('data-view', 'static')
  await expect(page.locator('html')).toHaveAttribute('data-font', 'selected')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('#tuning')).toHaveCount(0)
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://martinandmartin.tech/')
  expect(response?.headers()['strict-transport-security']).toContain('max-age=')
  expect(response?.headers()['x-content-type-options']).toBe('nosniff')
  expect(response?.headers()['x-robots-tag']).toBeUndefined()
  await context.close()
})

test('JavaScript off uses Square; denied WebGL uses the selected font; a slow font stays monospace', async ({ browser }) => {
  const address = 'http://127.0.0.1:4173'
  const noJS = await browser.newContext({ javaScriptEnabled: false })
  const page = await noJS.newPage()
  const square = page.waitForResponse(/geist-pixel-square-.*woff2/)
  await page.goto(address)
  expect((await square).ok()).toBe(true)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await noJS.close()

  const denied = await browser.newContext()
  await denied.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : Reflect.apply(get, this, [type, ...args])
    } as typeof get
  })
  const noGL = await denied.newPage()
  await noGL.goto(address + url({}, 'circle'))
  await expect(noGL.locator('html')).toHaveAttribute('data-view', 'static')
  await expect(noGL.locator('html')).toHaveCSS('--type', '"Geist Pixel circle"')
  await denied.close()

  const slow = await browser.newContext()
  const slowPage = await slow.newPage()
  await slowPage.route('**/*.woff2', async route => {
    await new Promise(resolve => setTimeout(resolve, 2400))
    await route.continue()
  })
  await slowPage.goto(address, { waitUntil: 'domcontentloaded' })
  await expect(slowPage.locator('html')).toHaveAttribute('data-view', 'static')
  await slowPage.waitForLoadState('networkidle')
  await expect(slowPage.locator('html')).toHaveAttribute('data-font', 'system')
  await expect(slowPage.locator('html')).toHaveCSS('--type', 'ui-monospace')
  await slow.close()
})

test('a transient context loss shows static type, then resumes the canvas', async ({ page }) => {
  await page.goto('/')
  await stage(page)
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    canvas.addEventListener('webglcontextlost', () => { setTimeout(() => extension.restoreContext(), 350) }, { once: true })
    extension.loseContext()
  })
  await expect(page.locator('html')).toHaveAttribute('data-view', 'static')
  await stage(page)
})

test('sustained slow frames reduce render resolution twice, then reveal HTML', async ({ page }) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = callback => raf(time => callback(time * 3))
  })
  await page.goto('/')
  await stage(page)
  const canvas = page.locator('#stage')
  await expect(canvas).toHaveAttribute('width', '1440')
  await expect(canvas).toHaveAttribute('width', '1080')
  await expect(canvas).toHaveAttribute('width', '720')
  await expect(page.locator('html')).toHaveAttribute('data-view', 'static')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a hidden tab stops drawing and resumes after it becomes visible', async ({ page }) => {
  await page.addInitScript(() => {
    const count = { value: 0 }
    Object.defineProperty(window, 'drawCount', { value: count })
    const draw = WebGL2RenderingContext.prototype.drawArrays
    WebGL2RenderingContext.prototype.drawArrays = function (mode, first, vertexCount) {
      count.value++
      return draw.call(this, mode, first, vertexCount)
    }
  })
  await page.goto('/')
  await stage(page)
  const getCount = () => page.evaluate(() => (window as unknown as { drawCount: { value: number } }).drawCount.value)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const stopped = await getCount()
  await page.waitForTimeout(220)
  expect(await getCount()).toBe(stopped)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(getCount).toBeGreaterThan(stopped)
})

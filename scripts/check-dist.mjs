import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const base = new URL('../dist/', import.meta.url)
const read = name => readFileSync(new URL(name, base))
const gz = bytes => gzipSync(bytes, { level: 9 }).byteLength
const html = read('index.html')
const assets = readdirSync(new URL('assets/', base))
const js = assets.filter(name => name.endsWith('.js')).map(name => read('assets/' + name))
const css = assets.filter(name => name.endsWith('.css')).map(name => read('assets/' + name))
const fonts = assets.filter(name => name.endsWith('.woff2')).map(name => read('assets/' + name))
const inline = html.toString().match(/<script id="font-bootstrap">([\s\S]*?)<\/script>/)?.[1]
const icon = read('favicon.ico')
assert(html.includes('href="/favicon.svg" sizes="any" type="image/svg+xml"'))
assert(html.includes('href="/favicon.ico" sizes="16x16 32x32 48x48" type="image/x-icon"'))
assert.equal(icon.readUInt16LE(0), 0)
assert.equal(icon.readUInt16LE(2), 1)
assert.equal(icon.readUInt16LE(4), 3)
assert.deepEqual([0, 1, 2].map(i => [icon[6 + i * 16], icon[7 + i * 16]]), [[16, 16], [32, 32], [48, 48]])
assert(inline)
const hash = createHash('sha256').update(inline).digest('base64')
assert(read('_headers').includes(`'sha256-${hash}'`))
assert.equal(fonts.length, 1)
assert(assets.filter(name => name.endsWith('.woff2')).every(name => name.startsWith('geist-pixel-circle-')))
const script = js.map(String).join('') + inline
assert(!/Copy link|Motion tuning|URLSearchParams|tune-range/.test(script + css.map(String).join('')))
assert(!/randomShape|geist-pixel-(square|grid|triangle|line)-/.test(script + css.map(String).join('')))
const release = JSON.parse(readFileSync(new URL('../src/release.json', import.meta.url), 'utf8'))
assert.equal(script.includes('drawArraysInstanced'), release.settings.style === 'splintered')
const jsSize = js.reduce((sum, b) => sum + gz(b), gz(Buffer.from(inline)))
const coldSize = gz(html) + js.reduce((sum, b) => sum + gz(b), 0)
  + css.reduce((sum, b) => sum + gz(b), 0) + Math.max(...fonts.map(b => b.byteLength))
  + Math.max(gz(read('favicon.svg')), icon.byteLength)
assert(jsSize < 30000, `JavaScript exceeds budget: ${jsSize} bytes`)
assert(coldSize < 100000, `Cold load exceeds budget: ${coldSize} bytes`)
console.log(`Production budgets: ${jsSize} bytes JavaScript gzip; ${coldSize} bytes cold load with largest WOFF2.`)

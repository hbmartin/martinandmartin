import { readFileSync } from 'node:fs'

const release = JSON.parse(readFileSync(new URL('../src/release.json', import.meta.url), 'utf8'))
if (!release.approved) {
  console.error('Production deployment is disabled until the preview has been reviewed and a release preset approved.')
  process.exit(1)
}
const { style, shape, waterLook } = release.settings
if (!['splintered', 'smooth', 'snapped'].includes(style) || shape !== 'circle'
    || !['quiet', 'reflective'].includes(waterLook)) {
  console.error('Production requires a selected split strategy, Circle type, and a valid water treatment.')
  process.exit(1)
}

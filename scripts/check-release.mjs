import { readFileSync } from 'node:fs'

const release = JSON.parse(readFileSync(new URL('../src/release.json', import.meta.url), 'utf8'))
if (!release.approved) {
  console.error('Production deployment is disabled until the preview has been reviewed and a release preset approved.')
  process.exit(1)
}
const { style, shape } = release.settings
if (!['splintered', 'smooth', 'snapped'].includes(style) || shape !== 'random') {
  console.error('Production must import only the selected split strategy and keep shape selection random.')
  process.exit(1)
}

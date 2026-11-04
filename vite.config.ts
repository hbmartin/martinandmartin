import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import fonts from './src/font-assets.json' with { type: 'json' }
import release from './src/release.json' with { type: 'json' }

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const origin = 'https://martinandmartin.tech'
const meta = `<link rel="canonical" href="${origin}/">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${origin}/">
    <meta property="og:title" content="Martin &amp; Martin">
    <meta property="og:description" content="Coming soon to a supply chain near you.">
    <meta property="og:image" content="${origin}/share.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Martin &amp; Martin in white pixel type with subtle cyan, magenta and yellow edges.">
    <meta name="twitter:card" content="summary_large_image">`
const reviewOverride = `const params = new URLSearchParams(location.search);
  const requested = params.get('shape');
  if (params.has('tune') && params.get('v') === '1' && shapes.includes(requested)) shape = requested;`

export default defineConfig(({ mode }) => {
  const review = mode === 'review'
  const boot = readFileSync(path('./src/bootstrap.js'), 'utf8').trim()
    .replace('/*FONTS*/ {}', JSON.stringify(fonts))
    .replace('/*SHAPE_OVERRIDE*/', review ? reviewOverride : '')
  return {
    build: {
      outDir: review ? 'dist-review' : 'dist',
      target: ['es2022', 'safari16'],
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
    },
    resolve: { alias: { 'virtual:landing-entry': path(review ? './src/review.ts' : './src/production.ts') } },
    plugins: [{
      name: 'landing-static-assets',
      resolveId(id) {
        if (id === 'virtual:landing-font') return '\0landing-font.css'
        if (id === 'virtual:production-strategy') return '\0production-strategy'
      },
      load(id) {
        if (id === '\0production-strategy') {
          const style = release.settings.style
          if (!['splintered', 'smooth', 'snapped'].includes(style)) this.error('Invalid production split style')
          return `export { ${style} as productionStrategy } from '/src/split/${style}.ts'`
        }
        if (id === '\0landing-font.css') return `@font-face{font-family:"Static Square";src:url("${fonts.square}") format("woff2");font-display:block}`
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace('<!--BOOTSTRAP-->', `<script id="font-bootstrap">${boot}</script>`)
            .replace('<!--METADATA-->', review ? '<meta name="robots" content="noindex">' : meta)
        },
      },
      generateBundle() {
        const hash = createHash('sha256').update(boot).digest('base64')
        const csp = `default-src 'none'; script-src 'self' 'sha256-${hash}'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
        const headers = `/*\n  Content-Security-Policy: ${csp}\n  Strict-Transport-Security: max-age=31536000\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n${review ? '  X-Robots-Tag: noindex\n' : ''}\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`
        this.emitFile({ type: 'asset', fileName: '_headers', source: headers })
        this.emitFile({
          type: 'asset', fileName: 'robots.txt',
          source: `User-agent: *\nAllow: /\n${review ? '' : `Sitemap: ${origin}/sitemap.xml\n`}`,
        })
        if (!review) this.emitFile({
          type: 'asset', fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`,
        })
      },
    }],
  }
})

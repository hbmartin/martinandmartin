import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

async function serve(folder, port) {
  const directory = resolve(folder)
  const headerFile = await readFile(resolve(directory, '_headers'), 'utf8')
  const defaultHeaders = Object.fromEntries(headerFile.split('\n\n')[0].split('\n').slice(1).filter(Boolean)
    .map(line => { const index = line.indexOf(':'); return [line.slice(0, index).trim(), line.slice(index + 1).trim()] }))
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const path = resolve(directory, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)))
      if (!path.startsWith(directory + sep) || url.pathname === '/_headers') throw new Error('Not found')
      const content = await readFile(path)
      res.writeHead(200, { ...defaultHeaders, 'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch {
      res.writeHead(404, { ...defaultHeaders, 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
  }).listen(port, '127.0.0.1', () => console.log(`Serving ${folder} at http://127.0.0.1:${port}`))
}

const mode = process.argv[2]
if (mode !== 'production') await serve('dist-review', 4173)
if (mode !== 'review') await serve('dist', 4174)

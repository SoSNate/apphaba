import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const MIME = {
  html:  'text/html; charset=utf-8',
  js:    'application/javascript',
  css:   'text/css',
  json:  'application/json',
  svg:   'image/svg+xml',
  png:   'image/png',
  jpg:   'image/jpeg',
  ico:   'image/x-icon',
  woff2: 'font/woff2',
  woff:  'font/woff',
  ttf:   'font/ttf',
  map:   'application/json',
}

function getMime(filePath) {
  const ext = filePath.split('.').pop() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

// Cache index path per slug to avoid repeated recursive searches
const indexCache = {}

async function findIndexHtml(storagePath) {
  const { data: files } = await supabase.storage
    .from('app-files')
    .list(storagePath, { limit: 100 })
  if (!files) return null
  for (const f of files) {
    if (f.name === 'index.html' && f.id !== null) return `${storagePath}${f.name}`
    if (f.id === null) {
      const found = await findIndexHtml(`${storagePath}${f.name}/`)
      if (found) return found
    }
  }
  return null
}

export default async function handler(req, res) {
  const { slug, path: pathParts } = req.query
  const filePath = pathParts ? pathParts.join('/') : null

  // Get app record
  const { data: app } = await supabase
    .from('apps')
    .select('storage_path, is_public')
    .eq('slug', slug)
    .single()

  if (!app) return res.status(404).send('App not found')
  if (!app.is_public) return res.status(403).send('App is private')
  if (!app.storage_path) return res.status(404).send('No files uploaded')

  // Find index.html once and cache the base directory
  if (!indexCache[slug]) {
    const indexPath = await findIndexHtml(app.storage_path)
    if (!indexPath) return res.status(404).send('index.html not found')
    indexCache[slug] = indexPath.replace(/index\.html$/, '')
  }
  const baseDir = indexCache[slug]

  let storagePath = filePath ? `${baseDir}${filePath}` : `${baseDir}index.html`

  const { data, error } = await supabase.storage
    .from('app-files')
    .download(storagePath)

  if (error || !data) return res.status(404).send('File not found: ' + storagePath)

  const buffer = Buffer.from(await data.arrayBuffer())
  const mime = getMime(storagePath)

  // For HTML: rewrite absolute paths to go through this proxy
  if (mime.includes('text/html')) {
    let html = buffer.toString('utf-8')

    // Detect the base prefix used by Vite (e.g. "/physicsistica/")
    // by finding the first absolute path in src/href attributes
    const baseMatch = html.match(/(?:src|href)="(\/[^"]+?\/assets\/)/)
    const viteBase = baseMatch ? baseMatch[1].replace(/assets\/$/, '') : '/'

    // Rewrite all absolute paths:
    // /physicsistica/assets/foo.js → /api/app/slug/assets/foo.js
    html = html.replace(/(src|href)="(\/[^"]*?)"/g, (_, attr, path) => {
      if (path.startsWith('//')) return `${attr}="${path}"`
      // Strip the vite base prefix, then prepend our proxy path
      const stripped = viteBase !== '/' ? path.replace(viteBase, '/') : path
      return `${attr}="/api/app/${slug}${stripped}"`
    })

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.send(html)
  }

  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.send(buffer)
}

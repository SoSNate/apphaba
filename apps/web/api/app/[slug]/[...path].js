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
  const filePath = pathParts
    ? (Array.isArray(pathParts) ? pathParts.join('/') : pathParts)
    : null

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

    // Detect if project was built with an absolute base (e.g. "/physicsistica/")
    // vs relative base ("./") — relative paths work fine, absolute ones don't
    const absoluteBaseMatch = html.match(/(?:src|href)="(\/[a-zA-Z0-9_-]+\/assets\/)/)
    if (absoluteBaseMatch) {
      // Project was built with an absolute Vite base — cannot serve correctly
      const detectedBase = absoluteBaseMatch[1].replace(/assets\/$/, '')
      const errorHtml = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Build Configuration Required</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; border-radius: 16px; padding: 32px; max-width: 480px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
  h2 { color: #111827; margin: 0 0 8px; font-size: 18px; }
  p { color: #6b7280; font-size: 14px; margin: 0 0 20px; line-height: 1.6; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 10px; font-size: 13px; overflow-x: auto; }
  .label { color: #6366f1; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
  .highlight { color: #86efac; }
</style>
</head>
<body>
<div class="card">
  <h2>⚙️ Build Configuration Required</h2>
  <p>Your project was built with <strong>base: '${detectedBase}'</strong> in vite.config. AppAba requires a relative base so assets load correctly from any URL.</p>
  <p>Add this to your <strong>vite.config.ts</strong> and rebuild:</p>
  <div class="label">vite.config.ts</div>
  <pre>export default defineConfig({
  <span class="highlight">base: './',</span>  // ← add this line
  // ... rest of your config
})</pre>
  <p style="margin-top:16px;margin-bottom:0">Then run <strong>npm run build</strong> and upload the <strong>dist/</strong> folder again.</p>
</div>
</body>
</html>`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(errorHtml)
    }

    // Rewrite relative paths (./assets/...) to absolute proxy paths
    // Only replace ./ prefixed paths — do NOT touch already-absolute paths
    html = html.replace(/(src|href)="\.\//g, `$1="/api/app/${slug}/`)

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

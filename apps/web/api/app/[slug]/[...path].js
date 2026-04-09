import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const MIME = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript',
  css:  'text/css',
  json: 'application/json',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
  ico:  'image/x-icon',
  woff2:'font/woff2',
  woff: 'font/woff',
  ttf:  'font/ttf',
  map:  'application/json',
}

function getMime(filePath) {
  const ext = filePath.split('.').pop() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

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

  let storagePath

  if (!filePath) {
    // Serving index.html — find it recursively
    storagePath = await findIndexHtml(app.storage_path)
    if (!storagePath) return res.status(404).send('index.html not found')
  } else {
    // Serving a specific file — find base dir first
    const indexPath = await findIndexHtml(app.storage_path)
    if (!indexPath) return res.status(404).send('App not found')
    const baseDir = indexPath.replace(/index\.html$/, '')
    storagePath = `${baseDir}${filePath}`
  }

  const { data, error } = await supabase.storage
    .from('app-files')
    .download(storagePath)

  if (error || !data) return res.status(404).send('File not found')

  const buffer = Buffer.from(await data.arrayBuffer())

  res.setHeader('Content-Type', getMime(storagePath))
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.send(buffer)
}

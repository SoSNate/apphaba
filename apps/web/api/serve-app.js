import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
}

function getMime(path) {
  const ext = path.match(/\.[^.]+$/)?.[0] ?? ''
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

export default async function handler(req, res) {
  // URL pattern: /api/serve-app?slug=xxx&file=assets/main.js
  const { slug, file = 'index.html' } = req.query

  if (!slug) return res.status(400).send('Missing slug')

  // Get app record
  const { data: app } = await supabase
    .from('apps')
    .select('storage_path, is_public')
    .eq('slug', slug)
    .single()

  if (!app) return res.status(404).send('App not found')
  if (!app.is_public) return res.status(403).send('App is private')
  if (!app.storage_path) return res.status(404).send('No files uploaded')

  const filePath = `${app.storage_path}${file}`

  const { data, error } = await supabase.storage
    .from('app-files')
    .download(filePath)

  if (error || !data) return res.status(404).send('File not found')

  const buffer = Buffer.from(await data.arrayBuffer())
  res.setHeader('Content-Type', getMime(file))
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.send(buffer)
}

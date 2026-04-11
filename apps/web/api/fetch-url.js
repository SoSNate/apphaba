export const config = { runtime: 'edge', maxDuration: 15 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function corsResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: { ...CORS, ...(init.headers ?? {}) },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsResponse(null)

  let body
  try { body = await req.json() } catch { return corsResponse('Invalid JSON', { status: 400 }) }

  const { url } = body ?? {}
  if (!url || typeof url !== 'string') return corsResponse('Missing url', { status: 400 })

  // Basic URL validation
  let parsed
  try { parsed = new URL(url) } catch { return corsResponse('Invalid URL', { status: 400 }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return corsResponse('Only http/https URLs allowed', { status: 400 })
  }

  // Block private/internal IPs
  const host = parsed.hostname
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return corsResponse('Private URLs not allowed', { status: 403 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AppAba/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      redirect: 'follow',
    })

    if (!res.ok) return corsResponse(`Upstream returned ${res.status}`, { status: 502 })

    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()

    return corsResponse(JSON.stringify({ content: text, contentType }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return corsResponse('Fetch failed: ' + err.message, { status: 502 })
  }
}

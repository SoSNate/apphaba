export const config = { runtime: 'edge', maxDuration: 10 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function corsResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: { ...CORS, ...(init.headers ?? {}) },
  })
}

const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function uint8ToBase64url(bytes) {
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0
    result += BASE64URL_CHARS[b0 >> 2]
    result += BASE64URL_CHARS[((b0 & 3) << 4) | (b1 >> 4)]
    result += i + 1 < bytes.length ? BASE64URL_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : ''
    result += i + 2 < bytes.length ? BASE64URL_CHARS[b2 & 63] : ''
  }
  return result
}

function base64urlToUint8(str) {
  const len = str.length
  const out = new Uint8Array(Math.floor(len * 3 / 4))
  let i = 0, j = 0
  while (i < len) {
    const c0 = BASE64URL_CHARS.indexOf(str[i++])
    const c1 = BASE64URL_CHARS.indexOf(str[i++])
    const c2 = i < len ? BASE64URL_CHARS.indexOf(str[i++]) : -1
    const c3 = i < len ? BASE64URL_CHARS.indexOf(str[i++]) : -1
    out[j++] = (c0 << 2) | (c1 >> 4)
    if (c2 >= 0) out[j++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (c3 >= 0) out[j++] = ((c2 & 3) << 6) | c3
  }
  return out.slice(0, j)
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsResponse(null)

  const url = new URL(req.url)

  // ── GET /p?d=<base64url> — decode and serve HTML ─────────────────────────
  if (req.method === 'GET') {
    const d = url.searchParams.get('d')
    if (!d) return new Response('Missing d param', { status: 400 })

    let html
    try {
      const bytes = base64urlToUint8(d)
      const ds = new DecompressionStream('deflate-raw')
      const writer = ds.writable.getWriter()
      writer.write(bytes)
      writer.close()
      const decompressed = await new Response(ds.readable).arrayBuffer()
      html = new TextDecoder().decode(decompressed)
    } catch (e) {
      return new Response('Invalid preview data: ' + e.message, { status: 400 })
    }

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; img-src * data: blob:; connect-src *;",
        ...CORS,
      },
    })
  }

  // ── POST /p { html } — compress and return share URL ─────────────────────
  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch { return corsResponse('Invalid JSON', { status: 400 }) }

    const { html } = body
    if (!html || typeof html !== 'string') return corsResponse('Missing html', { status: 400 })
    if (html.length > 80000) return corsResponse('HTML too large (max 80KB)', { status: 413 })

    let encoded
    try {
      const bytes = new TextEncoder().encode(html)
      const cs = new CompressionStream('deflate-raw')
      const writer = cs.writable.getWriter()
      writer.write(bytes)
      writer.close()
      const compressed = await new Response(cs.readable).arrayBuffer()
      encoded = uint8ToBase64url(new Uint8Array(compressed))
    } catch (e) {
      return corsResponse('Compression failed: ' + e.message, { status: 500 })
    }

    if (encoded.length > 7000) return corsResponse('Compressed HTML too large to share via URL', { status: 413 })

    const origin = url.origin
    const shareUrl = `${origin}/p?d=${encoded}`

    return corsResponse(JSON.stringify({ url: shareUrl }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return corsResponse('Method not allowed', { status: 405 })
}

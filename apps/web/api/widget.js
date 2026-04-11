export const config = { runtime: 'edge', maxDuration: 30 }

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

const WIDGET_SYSTEM_PROMPT = `You are a widget designer for AppAba. Given an app name, return a JSON widget layout that summarizes the app on an Android home screen widget.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.

Output schema:
{"background":"<hex>","rows":[{"type":"text","value":"...","size":<number>,"bold":<bool>,"color":"<hex>"}]}

Rules:
- 2–4 rows only
- background: very dark color — use #000000, #0f172a, or #1e293b
- Row 1: app name or main label, bold true, size 14, color #ffffff
- Row 2–4: short key data points, size 11–13, bold false
- Colors: #ffffff primary, #94a3b8 secondary, #22c55e positive, #ef4444 negative/alert
- Values must be very short — widget is ~160×80px on screen
- Nothing aesthetic: minimal, clean, no emojis

Example output for a "Crypto Tracker" app:
{"background":"#000000","rows":[{"type":"text","value":"Crypto Tracker","size":14,"bold":true,"color":"#ffffff"},{"type":"text","value":"BTC · $64,200","size":13,"bold":false,"color":"#ffffff"},{"type":"text","value":"+2.4% today","size":11,"bold":false,"color":"#22c55e"}]}`

function extractJson(text) {
  // Strip markdown fences
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Find first { ... } block
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1)
  }
  return JSON.parse(s)
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return corsResponse(null)

  let body
  try {
    body = await req.json()
  } catch {
    return corsResponse('Invalid JSON', { status: 400 })
  }

  const { appName, provider = 'anthropic', apiKey, model } = body

  if (!appName) return corsResponse('Missing appName', { status: 400 })
  if (!apiKey)  return corsResponse('Missing API key', { status: 401 })

  const userMessage = `Create a home screen widget for an app called "${appName}".`

  if (provider === 'openai') {
    return callOpenAI(apiKey, userMessage, model)
  } else if (provider === 'gemini') {
    return callGemini(apiKey, userMessage, model)
  } else {
    return callAnthropic(apiKey, userMessage, model)
  }
}

async function callAnthropic(apiKey, userMessage, model = 'claude-haiku-4-5-20251001') {
  let res
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: WIDGET_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
  } catch (err) {
    return corsResponse('Failed to reach Anthropic API: ' + err.message, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text()
    return corsResponse('Anthropic error: ' + errText, { status: res.status })
  }

  const json = await res.json()
  const text = json.content?.[0]?.text ?? ''
  return parseAndRespond(text)
}

async function callOpenAI(apiKey, userMessage, model = 'gpt-4o-mini') {
  let res
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [
          { role: 'system', content: WIDGET_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    })
  } catch (err) {
    return corsResponse('Failed to reach OpenAI API: ' + err.message, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text()
    return corsResponse('OpenAI error: ' + errText, { status: res.status })
  }

  const json = await res.json()
  const text = json.choices?.[0]?.message?.content ?? ''
  return parseAndRespond(text)
}

async function callGemini(apiKey, userMessage, model = 'gemini-2.0-flash') {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: WIDGET_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 512 },
      }),
    })
  } catch (err) {
    return corsResponse('Failed to reach Gemini API: ' + err.message, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text()
    return corsResponse('Gemini error: ' + errText, { status: res.status })
  }

  const json = await res.json()
  const parts = json.candidates?.[0]?.content?.parts ?? []
  const textPart = parts.find(p => !p.thought && p.text) ?? parts[parts.length - 1]
  const text = textPart?.text ?? ''
  return parseAndRespond(text)
}

function parseAndRespond(text) {
  try {
    const layout = extractJson(text)
    return corsResponse(JSON.stringify({ layout }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return corsResponse('AI returned invalid JSON: ' + text, { status: 502 })
  }
}

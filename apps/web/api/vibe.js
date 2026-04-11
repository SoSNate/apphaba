export const config = { runtime: 'edge', maxDuration: 60 }

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

const SYSTEM_PROMPT = `You are AppAba's elite mobile app generator. Your job is to produce COMPLETE, PRODUCTION-QUALITY mobile apps as a single HTML file.

## NON-NEGOTIABLE OUTPUT RULES
1. Return ONLY raw HTML starting with <!doctype html> — zero markdown, zero explanation, zero code fences
2. The app must be FULLY FUNCTIONAL — every button works, every feature is implemented
3. Minimum 200 lines of meaningful code — no skeleton apps, no placeholders
4. Multiple screens/views with smooth navigation between them
5. Real data with CRUD operations using AppAba.Preferences for persistence

## REQUIRED HEAD TAGS (always include both)
<script src="https://cdn.tailwindcss.com"></script>
<script src="appaba-sdk.js"></script>

## ARCHITECTURE — always use this pattern
<script type="module">
  // 1. State object
  let state = { screen: 'home', items: [], ... }

  // 2. Render function that redraws based on state
  function render() {
    document.getElementById('app').innerHTML = screens[state.screen]()
    bindEvents()
  }

  // 3. Screen functions that return HTML strings
  const screens = {
    home: () => \`<div>...</div>\`,
    detail: () => \`<div>...</div>\`,
  }

  // 4. Event binding after each render
  function bindEvents() { ... }

  // 5. Init
  await loadFromStorage()
  render()
</script>

## APPABA SDK — USE FOR ALL DEVICE ACCESS
\`\`\`js
// GPS
await AppAba.Geolocation.requestPermissions()
const pos = await AppAba.Geolocation.getCurrentPosition({ enableHighAccuracy: true })

// Camera
const photo = await AppAba.Camera.getPhoto({ quality: 85, resultType: 'base64', source: 'CAMERA' })
document.getElementById('img').src = 'data:image/jpeg;base64,' + photo.base64String

// Haptics — add to EVERY button
await AppAba.Haptics.impact('MEDIUM')  // LIGHT | MEDIUM | HEAVY

// Toast — use instead of alert()
await AppAba.Toast.show({ text: 'Saved!', duration: 'short', position: 'bottom' })

// Storage — NEVER use localStorage
await AppAba.Preferences.set('key', JSON.stringify(data))
const raw = await AppAba.Preferences.get('key')
const data = raw ? JSON.parse(raw) : defaultValue

// Share
await AppAba.Share.share({ title: 'Title', text: 'Text', url: 'https://...' })

// Clipboard
await AppAba.Clipboard.write({ string: 'text' })

// Network
const { connected } = await AppAba.Network.getStatus()

// Device
const { batteryLevel, isCharging } = await AppAba.Device.getBatteryInfo()
\`\`\`

## DESIGN SYSTEM (follow exactly)
Background: bg-gray-950  |  Cards: bg-gray-900 rounded-2xl p-4  |  Borders: border-gray-800
Primary: bg-indigo-600 hover:bg-indigo-500  |  Danger: bg-red-600  |  Success: bg-green-600
Text: text-white / text-gray-400 / text-gray-600
Buttons: w-full h-12 rounded-2xl font-semibold active:scale-95 transition-transform
Inputs: bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white w-full focus:border-indigo-500 outline-none
Bottom nav: fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex pb-6 pt-2
List items: bg-gray-900 rounded-2xl p-4 mb-3 flex items-center gap-3 active:bg-gray-800
Touch targets: minimum h-12 (48px) on all tappable elements
Safe areas: pt-12 top, pb-24 bottom for scrollable content

## WHAT MAKES A GREAT APP
✅ Bottom navigation bar with 3-4 tabs (Home, Add, History, Settings)
✅ List views with real items, swipe-to-delete or long-press context menu
✅ Forms with validation (required fields, format checks)
✅ Empty states with illustration emoji and call-to-action
✅ Loading states while async ops run
✅ Confirmation dialogs before destructive actions (implemented as custom modals, NOT confirm())
✅ Stats/summary cards at the top of home screen
✅ Search/filter functionality for lists
✅ Smooth CSS transitions between screens

## ERROR HANDLING (MANDATORY everywhere)
\`\`\`js
try {
  const result = await AppAba.Something.method()
} catch (err) {
  await AppAba.Toast.show({ text: '❌ ' + err.message, duration: 'long' })
}
\`\`\`

## ABSOLUTELY FORBIDDEN
- localStorage / sessionStorage → AppAba.Preferences
- navigator.geolocation → AppAba.Geolocation
- getUserMedia → AppAba.Camera
- alert() / confirm() / prompt() → custom modals or AppAba.Toast
- npm imports → esm.sh CDN only (e.g. https://esm.sh/preact/compat)
- Placeholders, TODOs, "coming soon" → implement everything fully
- Single-screen apps for complex requests → use multi-screen architecture
- Hardcoded data that should be user-generated → use AppAba.Preferences
- Comments like "add more items here" → generate real content`

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return corsResponse(null)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return corsResponse('Invalid JSON', { status: 400 })
  }

  const { prompt, apiKey, provider = 'anthropic', history = [], currentCode, stream = true } = body

  if (!prompt) return corsResponse('Missing prompt', { status: 400 })
  if (!apiKey) return corsResponse('Missing API key', { status: 401 })

  const messages = []

  // Include chat history (last 6 for context)
  for (const msg of history.slice(-6)) {
    if (msg.role && msg.content) {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  // If there's existing code (iteration or heal), include it
  if (currentCode) {
    messages.push({ role: 'assistant', content: currentCode })
  }

  messages.push({ role: 'user', content: prompt })

  // ── Route to correct provider ──────────────────────────────────────────────

  if (provider === 'openai') {
    return callOpenAI(apiKey, messages, stream)
  } else if (provider === 'gemini') {
    return callGemini(apiKey, messages, stream)
  } else {
    return callAnthropic(apiKey, messages, stream)
  }
}

async function callAnthropic(apiKey, messages, stream = true) {
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
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        stream,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })
  } catch (err) {
    return corsResponse('Failed to reach Anthropic API: ' + err.message, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text()
    return corsResponse('Anthropic error: ' + errText, { status: res.status })
  }

  if (!stream) {
    const json = await res.json()
    const text = json.content?.[0]?.text ?? ''
    return corsResponse(JSON.stringify({ html: text }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return corsResponse(res.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

async function callOpenAI(apiKey, messages, stream = true) {
  let res
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 16000,
        stream,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
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

  if (!stream) {
    const json = await res.json()
    const text = json.choices?.[0]?.message?.content ?? ''
    return corsResponse(JSON.stringify({ html: text }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return corsResponse(res.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

async function callGemini(apiKey, messages, stream = true) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const endpoint = stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?key=${apiKey}&alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`

  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 16000 },
      }),
    })
  } catch (err) {
    return corsResponse('Failed to reach Gemini API: ' + err.message, { status: 502 })
  }

  if (!res.ok) {
    const errText = await res.text()
    return corsResponse('Gemini error: ' + errText, { status: res.status })
  }

  if (!stream) {
    const json = await res.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return corsResponse(JSON.stringify({ html: text }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return corsResponse(res.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Send, Zap, RotateCcw, Copy, Upload, FileInput, Link, ClipboardPaste, X, Code2, ChevronDown } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Geolocation } from '@capacitor/geolocation'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { Clipboard } from '@capacitor/clipboard'
import { Toast } from '@capacitor/toast'
import { Device } from '@capacitor/device'
import { Network } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { supabase } from '../lib/supabase'

// Full plugin registry — every method exposed to mini-apps via postMessage bridge
const PLUGIN_REGISTRY: Record<string, Record<string, (...args: any[]) => Promise<any>>> = {
  Geolocation: {
    getCurrentPosition: (opts?: any) => Geolocation.getCurrentPosition(opts),
    checkPermissions: () => Geolocation.checkPermissions(),
    requestPermissions: () => Geolocation.requestPermissions(),
  },
  Camera: {
    getPhoto: (opts: any) => Camera.getPhoto({
      ...opts,
      resultType: opts?.resultType === 'uri' ? CameraResultType.Uri
        : opts?.resultType === 'dataUrl' ? CameraResultType.DataUrl
        : CameraResultType.Base64,
      source: opts?.source === 'PHOTOS' ? CameraSource.Photos
        : opts?.source === 'PROMPT' ? CameraSource.Prompt
        : CameraSource.Camera,
    }),
    checkPermissions: () => Camera.checkPermissions(),
    requestPermissions: () => Camera.requestPermissions(),
  },
  Haptics: {
    impact: (opts?: any) => Haptics.impact(opts ?? { style: ImpactStyle.Medium }),
    vibrate: (opts?: any) => Haptics.vibrate(opts),
    selectionStart: () => Haptics.selectionStart(),
    selectionChanged: () => Haptics.selectionChanged(),
    selectionEnd: () => Haptics.selectionEnd(),
  },
  Share: {
    share: (opts: any) => Share.share(opts),
    canShare: () => Share.canShare(),
  },
  Clipboard: {
    write: (opts: any) => Clipboard.write(opts),
    read: () => Clipboard.read(),
  },
  Toast: {
    show: (opts: any) => Toast.show(opts),
  },
  Device: {
    getInfo: () => Device.getInfo(),
    getId: () => Device.getId(),
    getBatteryInfo: () => Device.getBatteryInfo(),
    getLanguageCode: () => Device.getLanguageCode(),
  },
  Network: {
    getStatus: () => Network.getStatus(),
  },
  Preferences: {
    set: (opts: any) => Preferences.set(opts),
    get: (opts: any) => Preferences.get(opts),
    remove: (opts: any) => Preferences.remove(opts),
    clear: () => Preferences.clear(),
    keys: () => Preferences.keys(),
  },
}

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://apphaba-web.vercel.app'

const HARDWARE_SNIPPETS = [
  { icon: '📳', label: 'Vibration', text: 'Add haptic feedback when buttons are tapped' },
  { icon: '📍', label: 'Location',  text: 'Show my real-time GPS location on a map' },
  { icon: '📷', label: 'Camera',    text: 'Add a camera button that captures a photo' },
  { icon: '💾', label: 'Save data', text: 'Save user data that persists between sessions' },
  { icon: '🌐', label: 'Network',   text: 'Check internet connection and show status' },
  { icon: '🔋', label: 'Battery',   text: 'Display current battery level' },
] as const

const MODELS_BY_PROVIDER: Record<string, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
  openai: [
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: '2.5 Pro' },
    { id: 'gemini-2.5-flash', label: '2.5 Flash' },
  ],
}

// Strip markdown code fences and extract raw HTML
function extractHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  let s = raw.trim()
  // Remove ```html ... ``` or ``` ... ```
  s = s.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Must contain <html or <!doctype
  if (/<html|<!doctype/i.test(s)) return s
  // Try to find HTML block inside the string
  const match = s.match(/(<!doctype[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/i)
  return match ? match[1].trim() : ''
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isCode?: boolean
}

interface Props {
  onBack: () => void
  onOpenSettings: () => void
  onPublished?: () => void
}

export function VibeCodingScreen({ onBack, onOpenSettings, onPublished }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle')
  const [currentHtml, setCurrentHtml] = useState('')
  const [healAttempts, setHealAttempts] = useState(0)
  const [publishName, setPublishName] = useState('')
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle')
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importTab, setImportTab] = useState<'paste' | 'url'>('paste')
  const [importCode, setImportCode] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [activePanel, setActivePanel] = useState<'chat' | 'preview'>('chat')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)

  const [activeProvider] = useState(
    () => localStorage.getItem('appaba_active_provider') ?? 'anthropic'
  )
  const [activeModel, setActiveModelState] = useState(
    () => localStorage.getItem(`appaba_model_${localStorage.getItem('appaba_active_provider') ?? 'anthropic'}`) ?? 'claude-sonnet-4-6'
  )
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing'>('idle')
  const [streamProgress, setStreamProgress] = useState(0) // 0-100 estimated
  const [elapsedSec, setElapsedSec] = useState(0)
  const [liveCode, setLiveCode] = useState('') // streaming code preview
  const liveCodeRef = useRef<HTMLDivElement>(null)
  const apiKey = localStorage.getItem(`appaba_api_key_${activeProvider}`)
    ?? localStorage.getItem('appaba_api_key') // fallback to legacy key

  // Time-based progress animation — gives visual feedback even without streaming
  useEffect(() => {
    if (status !== 'generating') { setElapsedSec(0); return }
    const start = Date.now()
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000)
      setElapsedSec(sec)
      // Animate progress: fast early, slow near 90%
      setStreamProgress(p => {
        if (p >= 90) return p
        const inc = p < 20 ? 3 : p < 50 ? 1.5 : p < 75 ? 0.8 : 0.3
        return Math.min(90, p + inc)
      })
    }, 600)
    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // postMessage bridge — dispatch to actual Capacitor plugins
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const msg = event.data ?? {}

      // Error/blank from iframe — try to self-heal
      if ((msg.type === 'appaba:error' || msg.type === 'appaba:blank') && healAttempts < 2) {
        setHealAttempts(h => h + 1)
        const ctx = msg.type === 'appaba:blank'
          ? 'The app rendered a completely blank screen. Fix it so content displays correctly.'
          : `The code threw this error: "${msg.error}". Fix it silently without changing the app's functionality.`
        generate(ctx, true)
        return
      }

      // Plugin bridge — dispatch to PLUGIN_REGISTRY
      const { id, plugin, method, args } = msg
      if (!id || !plugin || !method) return

      const pluginImpl = PLUGIN_REGISTRY[plugin]?.[method]
      if (!pluginImpl) {
        iframeRef.current?.contentWindow?.postMessage(
          { id, error: `Plugin "${plugin}.${method}" is not available` }, '*'
        )
        return
      }
      try {
        const result = await pluginImpl(...(args ?? []))
        iframeRef.current?.contentWindow?.postMessage({ id, result }, '*')
      } catch (err: any) {
        iframeRef.current?.contentWindow?.postMessage({ id, error: err.message }, '*')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [healAttempts])

  async function handleIframeLoad() {
    injectErrorCatcher()
    try {
      const [info, network, battery] = await Promise.all([
        Device.getInfo(),
        Network.getStatus(),
        Device.getBatteryInfo(),
      ])
      iframeRef.current?.contentWindow?.postMessage({
        type: 'appaba:capabilities',
        capabilities: {
          platform: Capacitor.getPlatform(),
          device: { model: info.model, osVersion: info.osVersion, manufacturer: info.manufacturer, isVirtual: info.isVirtual },
          network: { connected: network.connected, type: network.connectionType },
          battery: { level: battery.batteryLevel, charging: battery.isCharging },
          plugins: Object.keys(PLUGIN_REGISTRY),
        },
      }, '*')
    } catch {}
  }

  function injectIntoIframe(html: string) {
    if (!iframeRef.current) return

    // Replace external SDK script tag with inline SDK so it works from any origin
    const sdkInline = `<script>
(function(){
  var pending = {};
  window.AppAba = new Proxy({}, {
    get: function(_, plugin) {
      return new Proxy({}, {
        get: function(_, method) {
          return function() {
            var args = Array.prototype.slice.call(arguments);
            return new Promise(function(resolve, reject) {
              var id = Math.random().toString(36).slice(2);
              pending[id] = { resolve: resolve, reject: reject };
              window.parent.postMessage({ id: id, plugin: plugin, method: method, args: args }, '*');
            });
          };
        }
      });
    }
  });
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.id || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  });
})();
<\/script>`

    // Fix common AI mistakes before loading
    let patched = html
      .replace(/<script[^>]+appaba-sdk\.js[^>]*><\/script>/gi, '')
      // Convert ES module scripts to regular scripts (removes type="module" and all import/export lines)
      .replace(/<script\s+type\s*=\s*["']module["']/gi, '<script')
      .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
      .replace(/^\s*export\s+(default\s+)?/gm, '')
    if (patched.includes('</head>')) {
      patched = patched.replace('</head>', sdkInline + '\n</head>')
    } else if (patched.includes('</body>')) {
      patched = patched.replace('</body>', sdkInline + '\n</body>')
    } else {
      patched = patched + '\n' + sdkInline
    }

    // srcdoc works in Capacitor Android WebView; blob: URLs are blocked
    iframeRef.current.srcdoc = patched
  }

  function injectErrorCatcher() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(iframeRef.current?.contentWindow as any)?.eval(`
        window.onerror = function(msg, src, line, col, err) {
          window.parent.postMessage({ type: 'appaba:error', error: msg + ' (line ' + line + ')' }, '*')
          return true
        }
        window.onunhandledrejection = function(e) {
          window.parent.postMessage({ type: 'appaba:error', error: e.reason?.message || 'Unhandled promise rejection' }, '*')
        }
        setTimeout(function() {
          if (document.body && !document.body.innerText.trim() && document.body.children.length === 0)
            window.parent.postMessage({ type: 'appaba:blank', error: 'App rendered blank output' }, '*')
        }, 3000)
        var _fetch = window.fetch
        window.fetch = function() {
          return _fetch.apply(this, arguments).catch(function(e) {
            window.parent.postMessage({ type: 'appaba:error', error: 'Network: ' + e.message }, '*')
            throw e
          })
        }
      `)
    } catch {}
  }

  const generate = useCallback(async (prompt: string, isHeal = false) => {
    if (!apiKey) {
      onOpenSettings()
      return
    }

    setStatus('generating')
    setStreamProgress(0)
    if (!isHeal) {
      setHealAttempts(0)
      setMessages(prev => [...prev, { role: 'user', content: prompt }])
    }

    // Wrap prompt to enforce HTML output — prevents AI from answering conversationally
    const wrappedPrompt = prompt.toLowerCase().startsWith('create') ||
      prompt.toLowerCase().startsWith('build') ||
      prompt.toLowerCase().startsWith('make') ||
      prompt.toLowerCase().startsWith('generate') ||
      prompt.toLowerCase().startsWith('צור') ||
      prompt.toLowerCase().startsWith('בנה') ||
      prompt.toLowerCase().startsWith('עשה')
        ? prompt
        : `Create a mobile app that: ${prompt}. Return ONLY the complete HTML file, nothing else.`

    // Build history for context
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    if (currentHtml && !isHeal) {
      history.push({
        role: 'assistant',
        content: `[Previous generated app - HTML code]\n${currentHtml.slice(0, 500)}...`
      })
    }

    try {
      const payload = {
        prompt: wrappedPrompt,
        apiKey,
        provider: activeProvider,
        model: activeModel,
        history,
        currentCode: isHeal ? currentHtml : undefined,
      }

      let html = ''

      // ── Streaming fetch (works on both web and native — server sends CORS: *) ──
      // Switch to preview immediately so user sees HTML building up live
      setActivePanel('preview')

      let res: Response
      try {
        res = await fetch(`${APP_URL}/api/vibe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch (fetchErr: any) {
        // CORS or network failure on native — fall back to CapacitorHttp (non-streaming)
        const fallback = await CapacitorHttp.post({
          url: `${APP_URL}/api/vibe`,
          headers: { 'Content-Type': 'application/json' },
          data: { ...payload, stream: false },
        })
        if (fallback.status >= 400) throw new Error(
          typeof fallback.data === 'string' ? fallback.data : JSON.stringify(fallback.data)
        )
        html = fallback.data?.html ?? ''
        if (!html) throw new Error('AI did not return valid HTML. Try rephrasing your prompt.')
        injectIntoIframe(html)
        // skip SSE section below
        res = { ok: true, body: null } as unknown as Response
      }

      if (res.ok && res.body) {
        if (!res.ok) {
          const err = await res.text()
          throw new Error(err || `HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const delta =
                  parsed.delta?.text ??
                  parsed.choices?.[0]?.delta?.content ??
                  parsed.candidates?.[0]?.content?.parts?.[0]?.text ??
                  ''
                if (delta) {
                  html += delta
                  // Estimate progress (typical app = ~8000 chars)
                  setStreamProgress(Math.min(95, Math.round(html.length / 80)))
                  // Live code preview — last 600 chars
                  setLiveCode(html.slice(-600))
                  // Auto-scroll live code box
                  requestAnimationFrame(() => {
                    if (liveCodeRef.current) liveCodeRef.current.scrollTop = liveCodeRef.current.scrollHeight
                  })
                  // Show partial preview as soon as we have meaningful HTML
                  if (html.includes('</body>') || html.includes('</html>') || html.length > 3000) {
                    injectIntoIframe(html)
                  }
                }
              } catch {}
            }
          }
        }
      }

      // Final inject — clean markdown fences before saving
      html = extractHtml(html) || html
      if (html) {
        injectIntoIframe(html)
        setCurrentHtml(html)
        if (!isHeal) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'App generated! Tap the preview to interact.',
            isCode: true,
          }])
        }
      }

      setStatus('idle')
      setStreamProgress(100)
      setLiveCode('')
      if (isHeal && html) Toast.show({ text: '✅ Auto-fixed!', duration: 'short', position: 'bottom' })
    } catch (err: any) {
      setStatus('error')
      setLiveCode('')
      if (!isHeal) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${err.message}`,
        }])
      }
    }
  }, [apiKey, activeProvider, messages, currentHtml, onOpenSettings])

  function handleSend() {
    const prompt = input.trim()
    if (!prompt || status === 'generating') return
    setInput('')
    generate(prompt)
  }

  function reset() {
    setMessages([])
    setCurrentHtml('')
    setHealAttempts(0)
    setStatus('idle')
    if (iframeRef.current) iframeRef.current.srcdoc = ''
  }

  function copyCode() {
    if (currentHtml) navigator.clipboard?.writeText(currentHtml)
  }

  async function importFromClipboard() {
    try {
      const { value } = await Clipboard.read()
      const html = extractHtml(value) || (value.trim().startsWith('<') ? value.trim() : '')
      if (!html) {
        await Toast.show({ text: 'No HTML found in clipboard', duration: 'short', position: 'bottom' })
        return
      }
      loadImportedCode(html)
    } catch {
      await Toast.show({ text: 'Could not read clipboard', duration: 'short', position: 'bottom' })
    }
  }

  async function importFromUrl() {
    if (!importUrl.trim()) return
    const url = importUrl.trim()

    // Gemini blocks iframes (X-Frame-Options: DENY) — guide user to copy the code
    if (/gemini\.google\.com\/share\/|aistudio\.google\.com\//.test(url)) {
      setImportTab('paste')
      await Toast.show({ text: 'Gemini blocks direct import — copy the code from Gemini and paste it here', duration: 'long', position: 'bottom' })
      return
    }

    setImportLoading(true)
    try {
      let url = importUrl.trim()

      // Try direct fetch first (works for public URLs on native)
      let rawCode = ''
      try {
        const res = await CapacitorHttp.get({ url })
        if (res.status < 400) {
          rawCode = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        }
      } catch {
        // Fall through to proxy
      }

      // If direct fetch failed or returned non-HTML, use server proxy to bypass CORS
      if (!rawCode || (!rawCode.includes('<') && !rawCode.includes('import') && !rawCode.includes('function'))) {
        const proxyRes = await CapacitorHttp.post({
          url: `${APP_URL}/api/fetch-url`,
          headers: { 'Content-Type': 'application/json' },
          data: { url },
        })
        if (proxyRes.status >= 400) throw new Error(`Could not fetch URL (${proxyRes.status})`)
        rawCode = typeof proxyRes.data === 'string' ? proxyRes.data : (proxyRes.data?.content ?? '')
      }

      if (!rawCode) throw new Error('No content found at URL')
      loadImportedCode(rawCode)
    } catch (e: any) {
      await Toast.show({ text: '❌ ' + e.message, duration: 'long', position: 'bottom' })
    } finally {
      setImportLoading(false)
    }
  }

  // Convert any code (React JSX, plain JS component, raw HTML) into a runnable HTML page
  function normalizeToHtml(raw: string): string {
    const trimmed = raw.trim()

    // Already a full HTML page
    if (/<html|<!doctype/i.test(trimmed)) return trimmed

    // Looks like React/JSX — wrap in a full page with Babel standalone transpiler
    const isReact = /import\s+React|from\s+['"]react['"]|jsx|tsx|<[A-Z][A-Za-z]+[\s/>]|useState|useEffect/.test(trimmed)
    const isJSX = /<[A-Za-z][A-Za-z0-9]*[\s\/>]/.test(trimmed) && /return\s*\(/.test(trimmed)

    if (isReact || isJSX) {
      // Strip import lines (we'll provide React via CDN)
      const strippedImports = trimmed
        .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
        .replace(/^export\s+default\s+/m, '')
        .replace(/^export\s+/gm, '')

      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>body{margin:0;background:#030712;color:white;font-family:system-ui,sans-serif}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } = React;

${strippedImports}

// Try to find and render the root component
const rootEl = document.getElementById('root');
const root = ReactDOM.createRoot(rootEl);
const ComponentNames = Object.keys(window).filter(k => /^[A-Z]/.test(k) && typeof window[k] === 'function');
const MainComponent = typeof App !== 'undefined' ? App
  : typeof Home !== 'undefined' ? Home
  : typeof Main !== 'undefined' ? Main
  : ComponentNames[0] ? window[ComponentNames[0]] : () => React.createElement('div', null, 'No component found');
root.render(React.createElement(MainComponent));
</script>
</body>
</html>`
    }

    // Plain HTML snippet — wrap in full page
    if (trimmed.startsWith('<')) {
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;background:#030712;color:white;font-family:system-ui,sans-serif}</style>
</head>
<body>
${trimmed}
</body>
</html>`
    }

    return trimmed
  }

  function loadImportedCode(raw: string) {
    const html = normalizeToHtml(raw)
    setCurrentHtml(html)
    injectIntoIframe(html)
    setShowImportDialog(false)
    setImportCode('')
    setImportUrl('')
    setActivePanel('preview')
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '📥 Code imported! Tap the preview to interact. You can keep chatting to modify it.',
      isCode: true,
    }])
  }

  async function publishToAppAba() {
    if (!currentHtml || !publishName.trim()) return
    setPublishStatus('publishing')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const slug = publishName.trim()
        .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        + '-' + Date.now().toString(36)
      const appId = crypto.randomUUID()
      const storagePath = `${user.id}/${appId}/`

      // Build the final HTML with SDK already inlined (same as injectIntoIframe does)
      const sdkInline = `<script>
(function(){
  var pending = {};
  window.AppAba = new Proxy({}, {
    get: function(_, plugin) {
      return new Proxy({}, {
        get: function(_, method) {
          return function() {
            var args = Array.prototype.slice.call(arguments);
            return new Promise(function(resolve, reject) {
              var id = Math.random().toString(36).slice(2);
              pending[id] = { resolve: resolve, reject: reject };
              window.parent.postMessage({ id: id, plugin: plugin, method: method, args: args }, '*');
            });
          };
        }
      });
    }
  });
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.id || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  });
})();
<\/script>`

      let finalHtml = currentHtml
        .replace(/<script[^>]+appaba-sdk\.js[^>]*><\/script>/gi, '')
        .replace(/<script\s+type\s*=\s*["']module["']/gi, '<script')
        .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
        .replace(/^\s*export\s+(default\s+)?/gm, '')
      if (finalHtml.includes('</head>')) {
        finalHtml = finalHtml.replace('</head>', sdkInline + '\n</head>')
      } else {
        finalHtml = sdkInline + '\n' + finalHtml
      }

      // 1. Upload HTML to Storage
      const blob = new Blob([finalHtml], { type: 'text/html' })
      const { error: uploadErr } = await supabase.storage
        .from('app-files')
        .upload(`${storagePath}index.html`, blob, { upsert: true })
      if (uploadErr) throw uploadErr

      // 2. Create app record
      const version = new Date().toISOString()
      const { error: insertErr } = await supabase.from('apps').insert({
        id: appId,
        name: publishName.trim(),
        slug,
        user_id: user.id,
        storage_path: storagePath,
        is_public: true,
        version,
      })
      if (insertErr) throw insertErr

      // 3. Write locally so it can be played immediately without re-downloading
      if (Capacitor.isNativePlatform()) {
        await Filesystem.mkdir({ path: `apps/${appId}`, directory: Directory.Data, recursive: true }).catch(() => {})
        await Filesystem.writeFile({ path: `apps/${appId}/index.html`, directory: Directory.Data, data: finalHtml, encoding: Encoding.UTF8 })
        const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
        indexPaths[appId] = `apps/${appId}/index.html`
        localStorage.setItem('appaba_index_paths', JSON.stringify(indexPaths))
        const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
        versions[appId] = version
        localStorage.setItem('appaba_local_versions', JSON.stringify(versions))
      }

      setPublishStatus('done')
      setShowPublishDialog(false)
      onPublished?.()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ "${publishName.trim()}" published to AppAba! Find it in My Apps.`,
      }])
    } catch (e: any) {
      setPublishStatus('error')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Publish failed: ${e.message}`,
      }])
    } finally {
      setTimeout(() => setPublishStatus('idle'), 3000)
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (Math.abs(dx) < 50 || dy > 80) return // too short or mostly vertical
    if (dx < 0 && activePanel === 'chat') setActivePanel('preview')
    if (dx > 0 && activePanel === 'preview') setActivePanel('chat')
  }

  function insertSnippet(text: string) {
    Haptics.impact({ style: ImpactStyle.Light })
    setInput(prev => prev ? prev + ' ' + text : text)
  }

  function switchModel(id: string) {
    localStorage.setItem(`appaba_model_${activeProvider}`, id)
    setActiveModelState(id)
    setShowModelPicker(false)
    Haptics.impact({ style: ImpactStyle.Light })
  }

  async function sharePreview() {
    if (!currentHtml || shareStatus === 'sharing') return
    setShareStatus('sharing')
    try {
      let data: { url?: string; error?: string }
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.post({
          url: `${APP_URL}/api/preview`,
          headers: { 'Content-Type': 'application/json' },
          data: { html: currentHtml },
        })
        data = res.data
      } else {
        const res = await fetch(`${APP_URL}/api/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: currentHtml }),
        })
        data = await res.json()
      }
      if (data.error) throw new Error(data.error)
      if (!data.url) throw new Error('No URL returned')
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'App Preview', url: data.url })
      } else {
        await navigator.clipboard?.writeText(data.url)
      }
      Toast.show({ text: '🔗 Preview URL ready!', duration: 'short', position: 'bottom' })
    } catch (e: any) {
      Toast.show({ text: '❌ ' + e.message, duration: 'long', position: 'bottom' })
    } finally {
      setShareStatus('idle')
    }
  }

  // Switch to preview automatically when app is generated
  useEffect(() => {
    if (currentHtml && status === 'idle') setActivePanel('preview')
  }, [currentHtml, status])

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Zap className="w-4 h-4 text-indigo-400" />
        <div className="relative">
          <button onClick={() => setShowModelPicker(v => !v)}
            className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300">
            <span className="max-w-[72px] truncate">
              {MODELS_BY_PROVIDER[activeProvider]?.find(m => m.id === activeModel)?.label ?? activeModel?.split('-').slice(-2).join(' ') ?? '...'}
            </span>
            <ChevronDown className="w-3 h-3 text-gray-500" />
          </button>
          {showModelPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl min-w-[120px]">
              {(MODELS_BY_PROVIDER[activeProvider] ?? []).map(m => (
                <button key={m.id} onClick={() => switchModel(m.id)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-gray-700 last:border-0 ${
                    m.id === activeModel ? 'text-indigo-400 bg-indigo-900/30' : 'text-gray-300 hover:bg-gray-700'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-white font-semibold flex-1 text-sm">Vibe Coding</span>
        <button onClick={() => { setImportCode(''); setImportUrl(''); setShowImportDialog(true) }}
          className="text-gray-400 p-1" title="Import code">
          <FileInput className="w-4 h-4" />
        </button>
        {currentHtml && (
          <>
            <button onClick={sharePreview} disabled={shareStatus === 'sharing'}
              className="text-gray-400 p-1 disabled:opacity-40">
              {shareStatus === 'sharing'
                ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <Link className="w-4 h-4" />}
            </button>
            <button onClick={() => { setPublishName(''); setShowPublishDialog(true) }}
              className="text-indigo-400 p-1">
              <Upload className="w-4 h-4" />
            </button>
            <button onClick={copyCode} className="text-gray-500 p-1">
              <Copy className="w-4 h-4" />
            </button>
          </>
        )}
        <button onClick={reset} className="text-gray-500 p-1">
          <RotateCcw className="w-4 h-4" />
        </button>
        {!apiKey && (
          <button onClick={onOpenSettings}
            className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-1 rounded-lg">
            Set API Key
          </button>
        )}
      </div>

      {/* Tab indicators */}
      <div className="flex-shrink-0 flex bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => setActivePanel('chat')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activePanel === 'chat' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-600'
          }`}
        >💬 Chat</button>
        <button
          onClick={() => setActivePanel('preview')}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            activePanel === 'preview' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-600'
          }`}
        >
          {currentHtml ? '📱 Preview' : '📱 Preview'}
          {status === 'generating' && <span className="ml-1 w-1.5 h-1.5 bg-indigo-400 rounded-full inline-block animate-pulse" />}
        </button>
      </div>

      {/* Swipeable panels */}
      <div
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Sliding track — two panels side by side */}
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ width: '200%', transform: activePanel === 'chat' ? 'translateX(0)' : 'translateX(-50%)' }}
        >

          {/* ── CHAT PANEL ── */}
          <div className="flex flex-col h-full overflow-hidden" style={{ width: '50%' }}>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-gray-600 text-xs mb-3">Try a prompt like:</p>
                  {[
                    'Make a dark stopwatch with haptic feedback',
                    'Build a GPS tracker that shows my location on a map',
                    'Create a camera app that applies filters',
                    'Make a habit tracker that saves data',
                  ].map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="block w-full text-left text-indigo-400 text-xs bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 mb-2">
                      "{s}"
                    </button>
                  ))}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : msg.isCode
                        ? 'bg-green-900/40 border border-green-800 text-green-300 rounded-bl-sm'
                        : 'bg-gray-800 text-gray-300 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Live code stream */}
            {status === 'generating' && liveCode && (
              <div className="flex-shrink-0 mx-3 mb-1 rounded-xl overflow-hidden border border-gray-800 bg-gray-950">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border-b border-gray-800">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                  <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  <span className="text-gray-600 text-xs ml-1 font-mono flex-1">index.html</span>
                  <button
                    onClick={() => setActivePanel('preview')}
                    className="flex items-center gap-1 text-indigo-400 text-xs bg-indigo-900/40 border border-indigo-800/60 rounded-md px-2 py-0.5 active:bg-indigo-900"
                  >
                    <span>Preview</span>
                    <span>→</span>
                  </button>
                </div>
                <div
                  ref={liveCodeRef}
                  className="overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-green-400/80"
                  style={{ maxHeight: 140 }}
                >
                  <pre className="whitespace-pre-wrap break-all">{liveCode}<span className="inline-block w-1.5 h-3 bg-green-400 ml-0.5 animate-pulse align-middle" /></pre>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {status === 'generating' && (
              <div className="bg-indigo-950 border-t border-indigo-900 px-4 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse flex-shrink-0" />
                  <span className="text-indigo-300 text-xs">
                    {healAttempts > 0
                      ? `Auto-fixing (${healAttempts}/2)...`
                      : elapsedSec < 4 ? 'Thinking...'
                      : elapsedSec < 15 ? 'Writing HTML...'
                      : elapsedSec < 35 ? 'Building screens...'
                      : elapsedSec < 60 ? 'Adding features...'
                      : 'Almost done...'}
                  </span>
                  <span className="text-indigo-500 text-xs ml-auto tabular-nums">
                    {elapsedSec}s
                  </span>
                </div>
                <div className="w-full h-1.5 bg-indigo-900/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-500"
                    style={{ width: `${streamProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Hardware snippet chips */}
            <div className="flex-shrink-0 overflow-x-auto px-3 py-2 bg-gray-900 border-t border-gray-800 flex gap-2"
              style={{ WebkitOverflowScrolling: 'touch' as const, scrollbarWidth: 'none' as const }}>
              {HARDWARE_SNIPPETS.map(s => (
                <button key={s.label} onClick={() => insertSnippet(s.text)}
                  disabled={status === 'generating'}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-gray-300 active:bg-gray-700 disabled:opacity-40">
                  <span>{s.icon}</span><span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800 pb-8">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={apiKey ? 'Describe the app you want...' : 'Set API key in Settings first'}
                disabled={!apiKey || status === 'generating'}
                rows={1}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
                style={{ maxHeight: '100px' }}
              />
              <button onClick={handleSend}
                disabled={!input.trim() || !apiKey || status === 'generating'}
                className="w-10 h-10 bg-indigo-600 disabled:opacity-40 rounded-2xl flex items-center justify-center flex-shrink-0">
                {status === 'generating'
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          </div>

          {/* ── PREVIEW PANEL ── */}
          <div className="relative h-full" style={{ width: '50%' }}>
            {!currentHtml && status !== 'generating' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <Zap className="w-10 h-10 text-indigo-400/30" />
                <p className="text-gray-600 text-sm">App preview will appear here</p>
                <p className="text-gray-700 text-xs">← Swipe back to chat and type a prompt</p>
              </div>
            )}
            {status === 'generating' && !currentHtml && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none bg-gray-950">
                <div className="relative">
                  <div className="w-16 h-16 border-2 border-indigo-900 rounded-2xl" />
                  <div className="absolute inset-0 w-16 h-16 border-2 border-indigo-500 border-t-transparent rounded-2xl animate-spin" />
                  <Zap className="absolute inset-0 m-auto w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-center">
                  <p className="text-indigo-300 text-sm font-medium">Building your app</p>
                  <p className="text-gray-600 text-xs mt-1">{elapsedSec}s elapsed</p>
                </div>
                <div className="w-48 h-1 bg-indigo-900/40 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${streamProgress}%` }} />
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              className="w-full h-full border-none"
              style={{ opacity: currentHtml ? 1 : 0 }}
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              title="Vibe Preview"
              onLoad={handleIframeLoad}
            />
            {/* Swipe hint */}
            {currentHtml && (
              <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-gray-700 text-xs">swipe → to chat</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="absolute inset-0 bg-black/70 flex flex-col justify-end z-50">
          <div className="bg-gray-900 border-t border-gray-700 rounded-t-3xl p-5 pb-10"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileInput className="w-5 h-5 text-indigo-400" />
                <span className="text-white font-semibold">Import Code</span>
              </div>
              <button onClick={() => setShowImportDialog(false)} className="text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-800 rounded-xl p-1 mb-4">
              <button
                onClick={() => setImportTab('paste')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  importTab === 'paste' ? 'bg-gray-700 text-white' : 'text-gray-500'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> Paste Code
              </button>
              <button
                onClick={() => setImportTab('url')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  importTab === 'url' ? 'bg-gray-700 text-white' : 'text-gray-500'
                }`}
              >
                <Link className="w-3.5 h-3.5" /> From URL
              </button>
            </div>

            {importTab === 'paste' ? (
              <div className="space-y-3">
                {/* Clipboard shortcut */}
                <button
                  onClick={importFromClipboard}
                  className="w-full flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3"
                >
                  <ClipboardPaste className="w-4 h-4 text-indigo-400" />
                  <div className="text-left">
                    <p className="text-white text-sm font-medium">Paste from clipboard</p>
                    <p className="text-gray-500 text-xs">Instantly import copied HTML</p>
                  </div>
                </button>

                {/* Manual paste area */}
                <textarea
                  value={importCode}
                  onChange={e => setImportCode(e.target.value)}
                  placeholder="Paste HTML, React JSX, or any component code here..."
                  rows={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
                <button
                  onClick={() => {
                    if (!importCode.trim()) return
                    loadImportedCode(importCode.trim())
                  }}
                  disabled={!importCode.trim()}
                  className="w-full bg-indigo-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm"
                >
                  Load Code
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="https://... (HTML, GitHub raw, CodePen, JSFiddle...)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-gray-600 text-xs px-1">
                  Supports HTML files, GitHub raw URLs, CodePen exports, and more.{'\n'}
                  For Gemini/AI Studio — copy the code and use Paste instead.
                </p>
                <button
                  onClick={importFromUrl}
                  disabled={!importUrl.trim() || importLoading}
                  className="w-full bg-indigo-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm"
                >
                  {importLoading
                    ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Fetching...</span>
                    : 'Fetch & Load'
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-1">Publish to AppAba</h3>
            <p className="text-gray-500 text-xs mb-4">Saves the app to your My Apps list.</p>
            <input
              autoFocus
              value={publishName}
              onChange={e => setPublishName(e.target.value)}
              placeholder="App name..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowPublishDialog(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 text-sm font-medium">
                Cancel
              </button>
              <button onClick={publishToAppAba}
                disabled={!publishName.trim() || publishStatus === 'publishing'}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 disabled:opacity-40 text-white text-sm font-semibold">
                {publishStatus === 'publishing' ? 'Publishing...' : '🚀 Publish'}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}

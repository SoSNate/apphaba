import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Send, Zap, RotateCcw, Copy } from 'lucide-react'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://apphaba-web.vercel.app'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isCode?: boolean
}

interface Props {
  onBack: () => void
  onOpenSettings: () => void
}

export function VibeCodingScreen({ onBack, onOpenSettings }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle')
  const [currentHtml, setCurrentHtml] = useState('')
  const [healAttempts, setHealAttempts] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const currentBlobUrl = useRef<string | null>(null)

  const activeProvider = localStorage.getItem('appaba_active_provider') ?? 'anthropic'
  const apiKey = localStorage.getItem(`appaba_api_key_${activeProvider}`)
    ?? localStorage.getItem('appaba_api_key') // fallback to legacy key

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // postMessage bridge — pass through to AppAba plugins
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data ?? {}

      // Error from iframe — try to self-heal
      if (msg.type === 'appaba:error' && healAttempts < 2) {
        setHealAttempts(h => h + 1)
        generate(`The code threw this error: "${msg.error}". Fix it silently without changing the app's functionality.`, true)
        return
      }

      // Plugin bridge — same as AppViewerScreen
      const { id, plugin, method, args } = msg
      if (!id || !plugin || !method) return

      // Forward to AppAba bridge in parent
      window.parent?.postMessage(msg, '*')
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [healAttempts])

  function injectIntoIframe(html: string) {
    if (!iframeRef.current) return
    if (currentBlobUrl.current) URL.revokeObjectURL(currentBlobUrl.current)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    currentBlobUrl.current = url
    iframeRef.current.src = url
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
      `)
    } catch {}
  }

  const generate = useCallback(async (prompt: string, isHeal = false) => {
    if (!apiKey) {
      onOpenSettings()
      return
    }

    setStatus('generating')
    if (!isHeal) {
      setHealAttempts(0)
      setMessages(prev => [...prev, { role: 'user', content: prompt }])
    }

    // Build history for context
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    if (currentHtml && !isHeal) {
      history.push({
        role: 'assistant',
        content: `[Previous generated app - HTML code]\n${currentHtml.slice(0, 500)}...`
      })
    }

    try {
      const res = await fetch(`${APP_URL}/api/vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          apiKey,
          provider: activeProvider,
          history,
          currentCode: isHeal ? currentHtml : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(err || `HTTP ${res.status}`)
      }

      // Stream response
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let html = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE chunks
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const delta =
                parsed.delta?.text ??                                   // Anthropic
                parsed.choices?.[0]?.delta?.content ??                  // OpenAI
                parsed.candidates?.[0]?.content?.parts?.[0]?.text ??   // Gemini
                ''
              if (delta) {
                html += delta
                // Live preview update every ~300ms via debounce
                if (html.includes('</html>') || html.length > 2000) {
                  injectIntoIframe(html)
                }
              }
            } catch {}
          }
        }
      }

      // Final inject
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
    } catch (err: any) {
      setStatus('error')
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
    if (iframeRef.current) iframeRef.current.src = 'about:blank'
    if (currentBlobUrl.current) {
      URL.revokeObjectURL(currentBlobUrl.current)
      currentBlobUrl.current = null
    }
  }

  function copyCode() {
    if (currentHtml) navigator.clipboard?.writeText(currentHtml)
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Zap className="w-4 h-4 text-indigo-400" />
        <span className="text-white font-semibold flex-1 text-sm">Vibe Coding</span>
        {currentHtml && (
          <button onClick={copyCode} className="text-gray-500 p-1">
            <Copy className="w-4 h-4" />
          </button>
        )}
        <button onClick={reset} className="text-gray-500 p-1">
          <RotateCcw className="w-4 h-4" />
        </button>
        {!apiKey && (
          <button
            onClick={onOpenSettings}
            className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-1 rounded-lg"
          >
            Set API Key
          </button>
        )}
      </div>

      {/* Live Preview */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800" style={{ height: '42vh' }}>
        {!currentHtml ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <Zap className="w-8 h-8 text-indigo-400/40" />
            <p className="text-gray-600 text-sm">Your app will appear here</p>
            <p className="text-gray-700 text-xs">Type a prompt below to generate</p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Vibe Preview"
            onLoad={injectErrorCatcher}
          />
        )}
      </div>

      {/* Status bar */}
      {status === 'generating' && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 bg-indigo-950 border-b border-indigo-900">
          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
          <span className="text-indigo-300 text-xs">
            {healAttempts > 0 ? `Auto-fixing error (attempt ${healAttempts}/2)...` : 'Generating...'}
          </span>
        </div>
      )}

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-gray-600 text-xs mb-3">Try a prompt like:</p>
            {[
              'Make a dark stopwatch with haptic feedback',
              'Build a GPS tracker that shows my location on a map',
              'Create a camera app that applies filters',
              'Make a habit tracker that saves data',
            ].map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); }}
                className="block w-full text-left text-indigo-400 text-xs bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 mb-2"
              >
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

      {/* Input */}
      <div className="flex-shrink-0 flex items-end gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800 pb-8">
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
        <button
          onClick={handleSend}
          disabled={!input.trim() || !apiKey || status === 'generating'}
          className="w-10 h-10 bg-indigo-600 disabled:opacity-40 rounded-2xl flex items-center justify-center flex-shrink-0"
        >
          {status === 'generating'
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="w-4 h-4 text-white" />
          }
        </button>
      </div>
    </div>
  )
}

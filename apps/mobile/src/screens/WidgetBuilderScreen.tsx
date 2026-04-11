import { useState } from 'react'
import { X, RotateCcw, LayoutGrid, Sparkles } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Toast } from '@capacitor/toast'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import type { SavedWidget } from './WidgetsScreen'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://apphaba-web.vercel.app'

type Theme = 'nothing' | 'cyber' | 'retro'

const THEMES: { id: Theme; label: string; desc: string; preview: string }[] = [
  { id: 'nothing', label: 'Nothing',  desc: 'Mono · minimal',  preview: '#000000' },
  { id: 'cyber',   label: 'Cyber',    desc: 'Neon · glow',     preview: '#0a0a1a' },
  { id: 'retro',   label: 'Retro',    desc: 'Terminal · green', preview: '#0d1117' },
]

interface WidgetConfig { background: string; rows: any[] }

interface Props {
  appId: string
  appName: string
  existingWidget?: SavedWidget
  onClose: () => void
}

function WidgetPreview({ config }: { config: WidgetConfig }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        width: 180, minHeight: 90,
        background: config.background ?? '#1e293b',
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 4,
      }}
    >
      {config.rows.map((row: any, i: number) => (
        <span key={i} style={{
          fontSize: row.size ?? 12, fontWeight: row.bold ? 700 : 400,
          color: row.color ?? '#ffffff', lineHeight: 1.3,
          fontFamily: 'monospace', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {row.value}
        </span>
      ))}
    </div>
  )
}

function loadWidgets(): SavedWidget[] {
  try { return JSON.parse(localStorage.getItem('appaba_widgets') ?? '[]') } catch { return [] }
}

function saveWidget(w: SavedWidget) {
  const all = loadWidgets()
  const idx = all.findIndex(x => x.id === w.id)
  if (idx >= 0) all[idx] = w
  else all.unshift(w)
  localStorage.setItem('appaba_widgets', JSON.stringify(all))
}

export function WidgetBuilderScreen({ appId, appName, existingWidget, onClose }: Props) {
  const [theme, setTheme] = useState<Theme>(existingWidget?.theme ?? 'nothing')
  const [widgetName, setWidgetName] = useState(existingWidget?.name ?? '')
  const [stylePrompt, setStylePrompt] = useState('')
  const [config, setConfig] = useState<WidgetConfig | null>(existingWidget?.config ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [generated, setGenerated] = useState(!!existingWidget)

  function getSettings() {
    const provider = localStorage.getItem('appaba_active_provider') ?? 'anthropic'
    const apiKey = localStorage.getItem(`appaba_api_key_${provider}`) ?? ''
    const model = localStorage.getItem(`appaba_model_${provider}`) ?? undefined
    return { provider, apiKey, model }
  }

  async function generate() {
    setLoading(true)
    setError('')
    const { provider, apiKey, model } = getSettings()
    if (!apiKey) { setError('No API key — go to Settings first.'); setLoading(false); return }

    try {
      const res = await fetch(`${APP_URL}/api/widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, theme, styleHint: stylePrompt.trim(), provider, apiKey, model }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setConfig(data.layout)
      setGenerated(true)
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate')
    } finally {
      setLoading(false)
    }
  }

  async function install() {
    if (!config) return
    setInstalling(true)
    try {
      const widgetId = existingWidget?.id ?? crypto.randomUUID()
      await (Capacitor.Plugins as any)['Widget']['update']({ widgetId, layout: config })

      const widget: SavedWidget = {
        id: widgetId,
        appId, appName,
        name: widgetName.trim() || appName,
        theme, config,
        createdAt: existingWidget?.createdAt ?? Date.now(),
      }
      saveWidget(widget)

      await Haptics.impact({ style: ImpactStyle.Medium })
      await Toast.show({ text: 'Widget saved! Long-press home screen to place it.', duration: 'long', position: 'bottom' })
      onClose()
    } catch (err: any) {
      await Toast.show({ text: '❌ ' + (err.message ?? 'Failed'), duration: 'long', position: 'bottom' })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full bg-gray-900 rounded-t-3xl px-5 pt-4 pb-10 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-gray-700 mx-auto" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-indigo-400" />
            <span className="text-white font-semibold text-sm">
              {existingWidget ? 'Edit Widget' : `Widget for ${appName}`}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Widget name */}
        <input
          type="text"
          value={widgetName}
          onChange={e => setWidgetName(e.target.value)}
          placeholder={`Name (e.g. "${appName} Dark")`}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500"
        />

        {/* Theme selector */}
        <div className="flex gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); setGenerated(false); setConfig(null) }}
              className={`flex-1 rounded-xl py-2 px-1 flex flex-col items-center gap-1 border transition-colors ${
                theme === t.id
                  ? 'border-indigo-500 bg-indigo-600/20'
                  : 'border-gray-700 bg-gray-800'
              }`}
            >
              <div className="w-8 h-5 rounded" style={{ background: t.preview }} />
              <span className="text-xs font-semibold text-white">{t.label}</span>
              <span className="text-xs text-gray-500">{t.desc}</span>
            </button>
          ))}
        </div>

        {!generated ? (
          <>
            {/* Custom hint */}
            <input
              type="text"
              value={stylePrompt}
              onChange={e => setStylePrompt(e.target.value)}
              placeholder="Custom style hint... (optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => { Haptics.impact({ style: ImpactStyle.Medium }); generate() }}
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-indigo-500 disabled:opacity-40"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Sparkles className="w-4 h-4" /> Generate Widget</>
              }
            </button>
          </>
        ) : (
          <>
            {/* Preview */}
            <div className="flex flex-col items-center gap-2">
              {loading ? (
                <div className="w-44 h-24 rounded-2xl bg-gray-800 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div className="w-full px-4 py-3 bg-red-900/40 rounded-xl text-red-400 text-xs text-center">{error}</div>
              ) : config ? (
                <>
                  <WidgetPreview config={config} />
                  <p className="text-gray-500 text-xs">Tapping widget opens {appName}</p>
                </>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => { Haptics.impact({ style: ImpactStyle.Light }); setGenerated(false); setConfig(null) }}
                className="flex-1 h-11 rounded-2xl border border-gray-700 text-gray-300 text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-gray-800"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Redesign
              </button>
              <button
                onClick={() => { Haptics.impact({ style: ImpactStyle.Light }); generate() }}
                disabled={loading}
                className="flex-1 h-11 rounded-2xl border border-gray-700 text-gray-300 text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-gray-800 disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" /> Retry
              </button>
              <button
                onClick={install}
                disabled={loading || !config || installing}
                className="flex-1 h-11 rounded-2xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-indigo-500 disabled:opacity-40"
              >
                {installing
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><LayoutGrid className="w-3.5 h-3.5" /> Save</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

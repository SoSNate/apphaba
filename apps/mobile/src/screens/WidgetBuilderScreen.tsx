import { useState, useEffect } from 'react'
import { X, RotateCcw, LayoutGrid } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Toast } from '@capacitor/toast'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://apphaba-web.vercel.app'

interface TextRow {
  type: 'text'
  value: string
  size?: number
  bold?: boolean
  color?: string
}

interface WidgetConfig {
  background: string
  rows: TextRow[]
}

interface Props {
  appId: string
  appName: string
  onClose: () => void
}

function WidgetPreview({ config }: { config: WidgetConfig }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        width: 160,
        minHeight: 80,
        background: config.background ?? '#1e293b',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      {config.rows.map((row, i) => (
        <span
          key={i}
          style={{
            fontSize: row.size ?? 12,
            fontWeight: row.bold ? 700 : 400,
            color: row.color ?? '#ffffff',
            lineHeight: 1.3,
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.value}
        </span>
      ))}
    </div>
  )
}

export function WidgetBuilderScreen({ appId, appName, onClose }: Props) {
  const [config, setConfig] = useState<WidgetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)

  function getSettings() {
    const provider = (localStorage.getItem('appaba_active_provider') ?? 'anthropic') as string
    const apiKey = localStorage.getItem(`appaba_api_key_${provider}`) ?? ''
    const model = localStorage.getItem(`appaba_model_${provider}`) ?? undefined
    return { provider, apiKey, model }
  }

  async function generate() {
    setLoading(true)
    setError('')
    setConfig(null)

    const { provider, apiKey, model } = getSettings()
    if (!apiKey) {
      setError('No API key configured. Go to Settings first.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${APP_URL}/api/widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, provider, apiKey, model }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text)
      }

      const data = await res.json()
      setConfig(data.layout)
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate widget')
    } finally {
      setLoading(false)
    }
  }

  async function install() {
    if (!config) return
    setInstalling(true)
    try {
      await (Capacitor.Plugins as any)['Widget']['update']({
        widgetId: appId,
        layout: config,
      })
      await Haptics.impact({ style: ImpactStyle.Medium })
      await Toast.show({ text: 'Widget added to home screen!', duration: 'short', position: 'bottom' })
      onClose()
    } catch (err: any) {
      await Toast.show({ text: '❌ ' + (err.message ?? 'Widget install failed'), duration: 'long', position: 'bottom' })
    } finally {
      setInstalling(false)
    }
  }

  useEffect(() => { generate() }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full bg-gray-900 rounded-t-3xl px-6 pt-4 pb-10 flex flex-col items-center gap-6">
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-700" />

        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-indigo-400" />
            <span className="text-white font-semibold text-sm">Widget for {appName}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview area */}
        <div className="flex flex-col items-center gap-3">
          {loading ? (
            <div className="w-40 h-20 rounded-2xl bg-gray-800 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="w-full px-4 py-3 bg-red-900/40 rounded-xl text-red-400 text-xs text-center">
              {error}
            </div>
          ) : config ? (
            <>
              <WidgetPreview config={config} />
              <p className="text-gray-500 text-xs">Preview — actual widget may vary slightly</p>
            </>
          ) : null}
        </div>

        {/* Actions */}
        <div className="w-full flex gap-3">
          <button
            onClick={() => { Haptics.impact({ style: ImpactStyle.Light }); generate() }}
            disabled={loading}
            className="flex-1 h-12 rounded-2xl border border-gray-700 text-gray-300 text-sm font-semibold flex items-center justify-center gap-2 active:bg-gray-800 disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Regenerate
          </button>

          <button
            onClick={install}
            disabled={loading || !config || installing}
            className="flex-1 h-12 rounded-2xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-indigo-500 disabled:opacity-40"
          >
            {installing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LayoutGrid className="w-4 h-4" />
                Add to Home
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

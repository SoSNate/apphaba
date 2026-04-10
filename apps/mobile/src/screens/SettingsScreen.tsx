import { useState } from 'react'
import { ArrowLeft, Key, ExternalLink, Check, Eye, EyeOff } from 'lucide-react'

interface Props {
  onBack: () => void
}

export function SettingsScreen({ onBack }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('appaba_api_key') ?? '')
  const [saved, setSaved] = useState(!!localStorage.getItem('appaba_api_key'))
  const [visible, setVisible] = useState(false)

  function save() {
    if (!apiKey.trim()) return
    localStorage.setItem('appaba_api_key', apiKey.trim())
    setSaved(true)
  }

  function clear() {
    localStorage.removeItem('appaba_api_key')
    setApiKey('')
    setSaved(false)
  }

  const masked = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••' + apiKey.slice(-4) : ''

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
        <button onClick={onBack} className="text-gray-400 hover:text-white p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white font-semibold">Settings</span>
      </div>

      <div className="flex-1 px-4 py-6 space-y-5">
        {/* API Key Card */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-white text-sm">Anthropic API Key</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Required for Vibe Coding. Your key is stored locally on this device only.
          </p>

          {saved ? (
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-green-400 text-sm font-mono">
                  {visible ? apiKey : masked}
                </span>
                <button onClick={() => setVisible(v => !v)} className="text-gray-500 ml-2">
                  {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-green-900/30 border border-green-700 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-xs font-medium">Key saved</span>
                </div>
                <button
                  onClick={clear}
                  className="bg-red-900/30 border border-red-800 text-red-400 text-xs font-medium px-4 py-2 rounded-xl"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={save}
                disabled={!apiKey.trim()}
                className="w-full bg-indigo-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm"
              >
                Save API Key
              </button>
            </div>
          )}

          <a
            href="https://console.anthropic.com/settings/keys"
            className="flex items-center gap-1 mt-3 text-xs text-indigo-400"
          >
            <ExternalLink className="w-3 h-3" />
            Get your API key at console.anthropic.com
          </a>
        </div>

        {/* Info Card */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">About</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">AppAba Version</span>
              <span className="text-gray-300 text-sm">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Model</span>
              <span className="text-gray-300 text-sm">claude-sonnet-4-6</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">API Key</span>
              <span className={`text-sm font-medium ${saved ? 'text-green-400' : 'text-red-400'}`}>
                {saved ? 'Configured' : 'Not set'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

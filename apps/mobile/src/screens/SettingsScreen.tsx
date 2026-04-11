import { useState } from 'react'
import { ArrowLeft, Key, ExternalLink, Check, Eye, EyeOff, ChevronDown } from 'lucide-react'

type Provider = 'anthropic' | 'openai' | 'gemini'

interface ModelOption { id: string; label: string }

const PROVIDERS: {
  id: Provider
  label: string
  placeholder: string
  docsUrl: string
  docsLabel: string
  defaultModel: string
  models: ModelOption[]
}[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6 (most capable)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o',       label: 'GPT-4o (recommended)' },
      { id: 'gpt-4o-mini',  label: 'GPT-4o Mini (faster)' },
      { id: 'o3',           label: 'o3 (reasoning)' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'aistudio.google.com',
    defaultModel: 'gemini-2.5-pro',
    models: [
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro (recommended)' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (faster)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
]

function storageKey(provider: Provider) { return `appaba_api_key_${provider}` }
function modelKey(provider: Provider) { return `appaba_model_${provider}` }

interface Props { onBack: () => void }

export function SettingsScreen({ onBack }: Props) {
  const [activeProvider, setActiveProvider] = useState<Provider>(
    () => (localStorage.getItem('appaba_active_provider') as Provider) ?? 'anthropic'
  )
  const [showProviderPicker, setShowProviderPicker] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)

  const provider = PROVIDERS.find(p => p.id === activeProvider)!

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(storageKey(activeProvider)) ?? '')
  const [saved, setSaved] = useState(!!localStorage.getItem(storageKey(activeProvider)))
  const [visible, setVisible] = useState(false)
  const [activeModel, setActiveModel] = useState(
    () => localStorage.getItem(modelKey(activeProvider)) ?? provider.defaultModel
  )

  function switchProvider(p: Provider) {
    setActiveProvider(p)
    setShowProviderPicker(false)
    const key = localStorage.getItem(storageKey(p)) ?? ''
    setApiKey(key)
    setSaved(!!key)
    setVisible(false)
    localStorage.setItem('appaba_active_provider', p)
    const pDef = PROVIDERS.find(x => x.id === p)!
    const savedModel = localStorage.getItem(modelKey(p)) ?? pDef.defaultModel
    setActiveModel(savedModel)
  }

  function selectModel(modelId: string) {
    setActiveModel(modelId)
    setShowModelPicker(false)
    localStorage.setItem(modelKey(activeProvider), modelId)
  }

  function save() {
    if (!apiKey.trim()) return
    localStorage.setItem(storageKey(activeProvider), apiKey.trim())
    localStorage.setItem('appaba_active_provider', activeProvider)
    setSaved(true)
  }

  function clear() {
    localStorage.removeItem(storageKey(activeProvider))
    setApiKey('')
    setSaved(false)
  }

  const masked = apiKey ? apiKey.slice(0, 6) + '••••••••••••' + apiKey.slice(-4) : ''
  const currentModelLabel = provider.models.find(m => m.id === activeModel)?.label ?? activeModel

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

        {/* Provider Picker */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">AI Provider</p>
          <div className="relative">
            <button
              onClick={() => { setShowProviderPicker(v => !v); setShowModelPicker(false) }}
              className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm"
            >
              <span>{provider.label}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showProviderPicker && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => switchProvider(p.id)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-700 last:border-0 transition-colors ${
                      p.id === activeProvider ? 'text-indigo-400 bg-indigo-900/30' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Model Picker */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Model</p>
          <div className="relative">
            <button
              onClick={() => { setShowModelPicker(v => !v); setShowProviderPicker(false) }}
              className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm"
            >
              <span className="truncate">{currentModelLabel}</span>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
            </button>
            {showModelPicker && (
              <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                {provider.models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => selectModel(m.id)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-700 last:border-0 transition-colors ${
                      m.id === activeModel ? 'text-indigo-400 bg-indigo-900/30' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* API Key Card */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-white text-sm">{provider.label} API Key</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Required for Vibe Coding. Stored locally on this device only.
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
                placeholder={provider.placeholder}
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

          <a href={provider.docsUrl} className="flex items-center gap-1 mt-3 text-xs text-indigo-400">
            <ExternalLink className="w-3 h-3" />
            Get your key at {provider.docsLabel}
          </a>
        </div>

        {/* Status Card */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Status</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">AppAba Version</span>
              <span className="text-gray-300 text-sm">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Active Provider</span>
              <span className="text-gray-300 text-sm">{provider.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Active Model</span>
              <span className="text-gray-300 text-sm font-mono text-xs">{activeModel}</span>
            </div>
            {PROVIDERS.map(p => (
              <div key={p.id} className="flex justify-between">
                <span className="text-gray-400 text-sm">{p.label}</span>
                <span className={`text-sm font-medium ${
                  localStorage.getItem(storageKey(p.id)) ? 'text-green-400' : 'text-gray-600'
                }`}>
                  {localStorage.getItem(storageKey(p.id)) ? 'Configured' : 'Not set'}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

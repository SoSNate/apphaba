import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { ArrowLeft, AlertCircle, LayoutGrid } from 'lucide-react'
import { getAppIndexUri } from '../lib/filesystem'
import { useAppBridge } from '../hooks/useAppBridge'
import { WidgetBuilderScreen } from './WidgetBuilderScreen'

interface Props {
  appId: string
  appName: string
  onBack: () => void
}

export function AppViewerScreen({ appId, appName, onBack }: Props) {
  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showWidget, setShowWidget] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { sendCapabilities } = useAppBridge(iframeRef)

  useEffect(() => {
    getAppIndexUri(appId)
      .then(rawUri => {
        const converted = Capacitor.convertFileSrc(rawUri)
        setUri(converted)
      })
      .catch(() => setError('Could not load app. Try re-downloading it.'))
  }, [appId])

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-50">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 flex-shrink-0">
        <button onClick={onBack} className="text-gray-300 hover:text-white transition-colors p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-medium flex-1 truncate">{appName}</span>
        <button onClick={() => setShowWidget(true)} className="text-gray-400 hover:text-white p-1">
          <LayoutGrid className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">AppAba</span>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-gray-600 text-center text-sm">{error}</p>
          <button onClick={onBack} className="text-indigo-600 text-sm font-medium">Go back</button>
        </div>
      ) : !uri ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={uri}
          className="flex-1 w-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms"
          title={appName}
          onLoad={sendCapabilities}
        />
      )}

      {showWidget && (
        <WidgetBuilderScreen appId={appId} appName={appName} onClose={() => setShowWidget(false)} />
      )}
    </div>
  )
}

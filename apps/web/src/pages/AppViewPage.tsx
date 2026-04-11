import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { App } from '@appaba/shared'

// Web-side AppAba SDK bridge — forwards postMessages to browser APIs
async function handleBridgeMessage(
  event: MessageEvent,
  iframeRef: React.RefObject<HTMLIFrameElement>
) {
  const { id, plugin, method, args } = event.data ?? {}
  if (!id || !plugin || !method) return

  let result: any
  let error: string | undefined

  try {
    if (plugin === 'Toast') {
      // Web fallback: console info (no native toast on web)
      console.info('[AppAba Toast]', args?.[0]?.text ?? '')
      result = {}
    } else if (plugin === 'Clipboard' && method === 'write') {
      await navigator.clipboard?.writeText(args?.[0]?.string ?? '')
      result = {}
    } else if (plugin === 'Share') {
      if (navigator.share) await navigator.share(args?.[0])
      result = {}
    } else if (plugin === 'Network' && method === 'getStatus') {
      result = { connected: navigator.onLine, connectionType: 'wifi' }
    } else if (plugin === 'Geolocation' && method === 'getCurrentPosition') {
      result = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(
          p => res({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } }),
          rej, args?.[0]
        )
      )
    } else {
      error = `Plugin "${plugin}.${method}" is not available on web`
    }
  } catch (e: any) {
    error = e.message
  }

  iframeRef.current?.contentWindow?.postMessage(
    error ? { id, error } : { id, result }, '*'
  )
}

export default function AppViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const [iframeSrc, setIframeSrc] = useState('')
  const [appName, setAppName] = useState('')
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => handleBridgeMessage(e, iframeRef)
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    if (!slug) return
    supabase
      .from('apps')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) { setError('App not found'); return }
        const app = data as App
        if (!app.is_public) { setError('This app is private'); return }
        if (!app.storage_path) { setError('No files uploaded yet'); return }

        const { data: urlData } = supabase.storage
          .from('app-files')
          .getPublicUrl(`${app.storage_path}index.html`)

        setAppName(app.name)
        setIframeSrc(urlData.publicUrl)
      })
  }, [slug])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
        <span className="text-4xl">📭</span>
        <p className="text-gray-500 font-medium">{error}</p>
        <p className="text-xs text-gray-400">/{slug}</p>
      </div>
    )
  }

  if (!iframeSrc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Minimal top bar so user knows they're in AppAba */}
      <div className="fixed top-0 left-0 right-0 z-10 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm">
        <span className="font-medium truncate flex-1">{appName}</span>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">AppAba</span>
      </div>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="fixed inset-0 w-full h-full border-none"
        style={{ top: '36px' }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        title={appName}
      />
    </>
  )
}

import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { Clipboard } from '@capacitor/clipboard'
import { Toast } from '@capacitor/toast'
import { Device } from '@capacitor/device'
import { Network } from '@capacitor/network'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { Preferences } from '@capacitor/preferences'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { getAppIndexUri } from '../lib/filesystem'

// Full plugin registry — every method exposed to mini-apps
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
  ScreenOrientation: {
    orientation: () => ScreenOrientation.orientation(),
    lock: (opts: any) => ScreenOrientation.lock(opts),
    unlock: () => ScreenOrientation.unlock(),
  },
  Preferences: {
    set: (opts: any) => Preferences.set(opts),
    get: (opts: any) => Preferences.get(opts),
    remove: (opts: any) => Preferences.remove(opts),
    clear: () => Preferences.clear(),
    keys: () => Preferences.keys(),
  },
  Shortcut: {
    create: (opts: any) => (Capacitor.Plugins as any)['Shortcut']['create'](opts),
  },
  Widget: {
    update: (widgetId: string, layout: any) =>
      (Capacitor.Plugins as any)['Widget']['update']({ widgetId, layout: JSON.stringify(layout) }),
    remove: (widgetId: string) =>
      (Capacitor.Plugins as any)['Widget']['remove']({ widgetId }),
    getCount: () =>
      (Capacitor.Plugins as any)['Widget']['getCount'](),
  },
}

// What capabilities this device supports — sent to mini-app on load
async function detectCapabilities() {
  const info = await Device.getInfo()
  const network = await Network.getStatus()
  const battery = await Device.getBatteryInfo()

  return {
    platform: Capacitor.getPlatform(),
    device: {
      model: info.model,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      isVirtual: info.isVirtual,
    },
    network: {
      connected: network.connected,
      type: network.connectionType,
    },
    battery: {
      level: battery.batteryLevel,
      charging: battery.isCharging,
    },
    plugins: Object.keys(PLUGIN_REGISTRY),
  }
}

interface Props {
  appId: string
  appName: string
  onBack: () => void
}

export function AppViewerScreen({ appId, appName, onBack }: Props) {
  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    getAppIndexUri(appId)
      .then(rawUri => {
        const converted = Capacitor.convertFileSrc(rawUri)
        setUri(converted)
      })
      .catch(() => setError('Could not load app. Try re-downloading it.'))
  }, [appId])

  // Send capabilities to mini-app as soon as iframe loads
  async function handleIframeLoad() {
    try {
      const caps = await detectCapabilities()
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'appaba:capabilities', capabilities: caps }, '*'
      )
    } catch {}
  }

  // postMessage bridge: mini-app → AppAba → Capacitor plugin → mini-app
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const { id, plugin, method, args } = event.data ?? {}
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
  }, [])

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-50">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 flex-shrink-0">
        <button onClick={onBack} className="text-gray-300 hover:text-white transition-colors p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-medium flex-1 truncate">{appName}</span>
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
          onLoad={handleIframeLoad}
        />
      )}
    </div>
  )
}

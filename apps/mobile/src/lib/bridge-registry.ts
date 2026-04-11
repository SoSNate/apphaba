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

// Full plugin registry — every method exposed to mini-apps via postMessage bridge
export const PLUGIN_REGISTRY: Record<string, Record<string, (...args: any[]) => Promise<any>>> = {
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
    impact: (opts?: any) => {
      if (typeof opts === 'string') {
        const map: Record<string, ImpactStyle> = {
          LIGHT: ImpactStyle.Light, MEDIUM: ImpactStyle.Medium, HEAVY: ImpactStyle.Heavy,
          light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy,
        }
        return Haptics.impact({ style: map[opts] ?? ImpactStyle.Medium })
      }
      return Haptics.impact(opts ?? { style: ImpactStyle.Medium })
    },
    // Accept vibrate(300) or vibrate({ duration: 300 }) — AI often passes a plain number
    vibrate: (opts?: any) =>
      Haptics.vibrate(typeof opts === 'number' ? { duration: opts } : (opts ?? {})),
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
      (Capacitor.Plugins as any)['Widget']['update']({ widgetId, layout }),
    remove: (widgetId: string) =>
      (Capacitor.Plugins as any)['Widget']['remove']({ widgetId }),
    getCount: () =>
      (Capacitor.Plugins as any)['Widget']['getCount'](),
    // Push live data from mini-app to its linked widget
    push: (key: string, value: string, appId: string) => {
      const raw = localStorage.getItem('appaba_widgets')
      if (!raw) return Promise.resolve()
      const widgets: any[] = JSON.parse(raw)
      const linked = widgets.filter(w => w.appId === appId)
      if (!linked.length) return Promise.resolve()
      const updates = linked.map(w => {
        const config = { ...w.config }
        config.rows = config.rows.map((row: any) =>
          row.pushKey === key ? { ...row, value } : row
        )
        return (Capacitor.Plugins as any)['Widget']['update']({ widgetId: w.id, layout: config })
      })
      return Promise.all(updates)
    },
  },
}

export async function detectCapabilities() {
  const [info, network, battery] = await Promise.all([
    Device.getInfo(),
    Network.getStatus(),
    Device.getBatteryInfo(),
  ])

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

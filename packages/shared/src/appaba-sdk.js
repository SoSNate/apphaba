/**
 * AppAba SDK — include this script in any mini-app's index.html
 * to access the host device's native capabilities via postMessage bridge.
 *
 * Usage:
 *   <script src="appaba-sdk.js"></script>
 *   <script>
 *     const pos = await AppAba.geolocation()
 *     await AppAba.haptics()
 *   </script>
 */

const ALLOWED_PLUGINS = new Set([
  'Geolocation', 'Camera', 'Haptics', 'Share',
  'Clipboard', 'Toast', 'Device', 'Network',
])

window.AppAba = {
  call(plugin, method, ...args) {
    if (!ALLOWED_PLUGINS.has(plugin)) {
      return Promise.reject(new Error(`Plugin "${plugin}" is not allowed`))
    }
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2)
      window.parent.postMessage({ id, plugin, method, args }, '*')
      const handler = (e) => {
        if (e.data?.id !== id) return
        window.removeEventListener('message', handler)
        if (e.data.error) {
          reject(new Error(e.data.error))
        } else {
          resolve(e.data.result)
        }
      }
      window.addEventListener('message', handler)
      // Timeout after 10s
      setTimeout(() => {
        window.removeEventListener('message', handler)
        reject(new Error('AppAba bridge timeout'))
      }, 10000)
    })
  },

  geolocation: () => window.AppAba.call('Geolocation', 'getCurrentPosition'),
  camera: (options = { resultType: 'base64' }) => window.AppAba.call('Camera', 'getPhoto', options),
  haptics: (style = 'MEDIUM') => window.AppAba.call('Haptics', 'impact', { style }),
  share: (opts) => window.AppAba.call('Share', 'share', opts),
  clipboard: (string) => window.AppAba.call('Clipboard', 'write', { string }),
  toast: (text) => window.AppAba.call('Toast', 'show', { text }),
  deviceInfo: () => window.AppAba.call('Device', 'getInfo'),
  networkStatus: () => window.AppAba.call('Network', 'getStatus'),
}

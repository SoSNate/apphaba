/**
 * AppAba SDK
 * Include this file in your mini-app to access device capabilities.
 *
 * Usage (plain HTML):
 *   <script src="appaba-sdk.js"></script>
 *   <script>
 *     const pos = await AppAba.Geolocation.getCurrentPosition()
 *     const photo = await AppAba.Camera.getPhoto({ resultType: 'base64' })
 *     const caps = await AppAba.getCapabilities()
 *   </script>
 *
 * Usage (React / bundled app):
 *   import './appaba-sdk.js'
 *   const pos = await window.AppAba.Geolocation.getCurrentPosition()
 */

;(function (global) {
  let _callId = 0
  const _pending = {}
  let _capabilities = null
  const _capListeners = []

  // Listen for responses from AppAba host
  window.addEventListener('message', e => {
    const msg = e.data ?? {}

    // Capabilities broadcast when iframe loads
    if (msg.type === 'appaba:capabilities') {
      _capabilities = msg.capabilities
      _capListeners.forEach(fn => fn(_capabilities))
      _capListeners.length = 0
      return
    }

    // Plugin call response
    const { id, result, error } = msg
    if (!id || !_pending[id]) return
    const { resolve, reject } = _pending[id]
    delete _pending[id]
    if (error) reject(new Error(error))
    else resolve(result)
  })

  function call(plugin, method, ...args) {
    return new Promise((resolve, reject) => {
      const id = String(++_callId)
      _pending[id] = { resolve, reject }
      window.parent.postMessage({ id, plugin, method, args }, '*')
      setTimeout(() => {
        if (_pending[id]) {
          delete _pending[id]
          reject(new Error(`Timeout: ${plugin}.${method} did not respond`))
        }
      }, 15000)
    })
  }

  const AppAba = {
    /**
     * Returns device capabilities:
     * { platform, device, network, battery, plugins[] }
     */
    getCapabilities() {
      if (_capabilities) return Promise.resolve(_capabilities)
      return new Promise(resolve => _capListeners.push(resolve))
    },

    Geolocation: {
      getCurrentPosition: (opts) => call('Geolocation', 'getCurrentPosition', opts),
      checkPermissions:   () => call('Geolocation', 'checkPermissions'),
      requestPermissions: () => call('Geolocation', 'requestPermissions'),
    },

    Camera: {
      /** opts: { quality, resultType: 'base64'|'uri', source: 'CAMERA'|'PHOTOS' } */
      getPhoto:           (opts) => call('Camera', 'getPhoto', opts),
      checkPermissions:   () => call('Camera', 'checkPermissions'),
      requestPermissions: () => call('Camera', 'requestPermissions'),
    },

    Haptics: {
      impact:  (style = 'MEDIUM') => call('Haptics', 'impact', { style }),
      vibrate: (duration = 300)   => call('Haptics', 'vibrate', { duration }),
    },

    Share: {
      share:    (opts) => call('Share', 'share', opts),
      canShare: ()     => call('Share', 'canShare'),
    },

    Clipboard: {
      write: (opts) => call('Clipboard', 'write', opts),
      read:  ()     => call('Clipboard', 'read'),
    },

    Toast: {
      /** opts: { text, duration: 'short'|'long', position: 'top'|'center'|'bottom' } */
      show: (opts) => call('Toast', 'show', opts),
    },

    Device: {
      getInfo:         () => call('Device', 'getInfo'),
      getId:           () => call('Device', 'getId'),
      getBatteryInfo:  () => call('Device', 'getBatteryInfo'),
      getLanguageCode: () => call('Device', 'getLanguageCode'),
    },

    Network: {
      getStatus: () => call('Network', 'getStatus'),
    },

    ScreenOrientation: {
      orientation: ()     => call('ScreenOrientation', 'orientation'),
      lock:        (type) => call('ScreenOrientation', 'lock', { orientation: type }),
      unlock:      ()     => call('ScreenOrientation', 'unlock'),
    },

    Preferences: {
      set:    (key, value) => call('Preferences', 'set', { key, value }),
      get:    (key)        => call('Preferences', 'get', { key }).then(r => r.value),
      remove: (key)        => call('Preferences', 'remove', { key }),
      clear:  ()           => call('Preferences', 'clear'),
      keys:   ()           => call('Preferences', 'keys').then(r => r.keys),
    },
  }

  global.AppAba = AppAba
})(window)

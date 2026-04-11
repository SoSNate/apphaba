import { useEffect, RefObject } from 'react'
import { PLUGIN_REGISTRY, detectCapabilities } from '../lib/bridge-registry'

export function useAppBridge(iframeRef: RefObject<HTMLIFrameElement>) {
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      const { id, plugin, method, args } = event.data ?? {}
      if (!id || !plugin || !method) return

      console.log(`[AppAba Bridge] ${plugin}.${method}`, args)

      const pluginImpl = PLUGIN_REGISTRY[plugin]?.[method]
      if (!pluginImpl) {
        console.warn(`[AppAba Bridge] NOT FOUND: ${plugin}.${method}`)
        iframeRef.current?.contentWindow?.postMessage(
          { id, error: `Plugin "${plugin}.${method}" is not available` }, '*'
        )
        return
      }
      try {
        const result = await pluginImpl(...(args ?? []))
        iframeRef.current?.contentWindow?.postMessage({ id, result }, '*')
      } catch (err: any) {
        console.error(`[AppAba Bridge] ${plugin}.${method} ERROR:`, err.message)
        iframeRef.current?.contentWindow?.postMessage({ id, error: err.message }, '*')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeRef])

  async function sendCapabilities() {
    try {
      const caps = await detectCapabilities()
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'appaba:capabilities', capabilities: caps }, '*'
      )
    } catch {}
  }

  return { sendCapabilities }
}

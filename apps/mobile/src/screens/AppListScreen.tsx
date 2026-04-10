import { useEffect, useState } from 'react'
import { Download, Play, RefreshCw, LogOut, Smartphone, Zap, Settings } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useApps } from '../hooks/useApps'
import { useRealtime } from '../hooks/useRealtime'
import { downloadAppFiles } from '../lib/filesystem'
import { requestNotificationPermission } from '../lib/notifications'
import type { App } from '@appaba/shared'

interface Props {
  onOpenApp: (appId: string) => void
  onOpenVibes: () => void
  onOpenSettings: () => void
}

export function AppListScreen({ onOpenApp, onOpenVibes, onOpenSettings }: Props) {
  const { user, signOut } = useAuth()
  const { apps, loading, loadApps, markDownloaded, markUpdated } = useApps(user)
  const [downloading, setDownloading] = useState<Record<string, string>>({})

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useRealtime(user?.id ?? null, (updated: App) => {
    markUpdated(updated)
  })

  async function handleDownload(app: App) {
    setDownloading(prev => ({ ...prev, [app.id]: 'Starting...' }))
    try {
      await downloadAppFiles(app, (current, total, name) => {
        setDownloading(prev => ({ ...prev, [app.id]: `${current}/${total}: ${name}` }))
      })
      markDownloaded(app.id, app.version)
    } catch (err: any) {
      alert('Download failed: ' + err.message)
    } finally {
      setDownloading(prev => { const n = { ...prev }; delete n[app.id]; return n })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">AppAba</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadApps} className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-600 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-24">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No apps yet</p>
            <p className="text-sm text-gray-400 mt-1">Upload an app from the web dashboard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => {
              const dl = downloading[app.id]
              return (
                <div key={app.id} className="bg-white rounded-2xl px-4 py-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center
                      text-base font-bold text-indigo-600 flex-shrink-0">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{app.name}</p>
                        {app.hasUpdate && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            Update
                          </span>
                        )}
                      </div>
                      {dl ? (
                        <p className="text-xs text-indigo-500 mt-0.5 truncate">{dl}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {app.isDownloaded ? 'Ready' : 'Not downloaded'}
                        </p>
                      )}
                    </div>

                    {/* Action button */}
                    {dl ? (
                      <div className="w-8 h-8 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : app.isDownloaded && !app.hasUpdate ? (
                      <button
                        onClick={() => onOpenApp(app.id)}
                        className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center
                          hover:bg-indigo-700 transition-colors flex-shrink-0"
                      >
                        <Play className="w-4 h-4 text-white" fill="white" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(app)}
                        className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center
                          hover:bg-indigo-100 transition-colors flex-shrink-0"
                      >
                        {app.hasUpdate
                          ? <RefreshCw className="w-4 h-4 text-indigo-600" />
                          : <Download className="w-4 h-4 text-gray-600" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
        <button
          className="flex-1 flex flex-col items-center gap-0.5 py-3 text-indigo-600"
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-xs font-medium">My Apps</span>
        </button>
        <button
          onClick={onOpenVibes}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 text-gray-400"
        >
          <Zap className="w-5 h-5" />
          <span className="text-xs font-medium">Vibe</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 text-gray-400"
        >
          <Settings className="w-5 h-5" />
          <span className="text-xs font-medium">Settings</span>
        </button>
      </nav>
    </div>
  )
}

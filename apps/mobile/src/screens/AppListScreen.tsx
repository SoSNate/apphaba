import { useEffect, useState, useRef } from 'react'
import { Download, Play, RefreshCw, LogOut, Smartphone, Zap, Settings, Trash2, X, CloudOff, LayoutGrid } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useApps } from '../hooks/useApps'
import { useRealtime } from '../hooks/useRealtime'
import { downloadAppFiles } from '../lib/filesystem'
import { requestNotificationPermission } from '../lib/notifications'
import type { App } from '@appaba/shared'
import type { AppWithStatus } from '../hooks/useApps'

interface Props {
  onOpenApp: (appId: string) => void
  onOpenVibes: () => void
  onOpenWidgets: () => void
  onOpenSettings: () => void
  onCreateWidget: (appId: string, appName: string) => void
}

export function AppListScreen({ onOpenApp, onOpenVibes, onOpenWidgets, onOpenSettings, onCreateWidget }: Props) {
  const { user, signOut } = useAuth()
  const { apps, loading, loadApps, markDownloaded, markUpdated, removeApp } = useApps(user)
  const [downloading, setDownloading] = useState<Record<string, string>>({})
  const [contextApp, setContextApp] = useState<AppWithStatus | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ app: AppWithStatus; cloud: boolean } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDark = localStorage.getItem('appaba_dark_mode') !== 'false'

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

  function startLongPress(app: AppWithStatus) {
    longPressTimer.current = setTimeout(() => setContextApp(app), 500)
  }

  function cancelLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  async function handleDeleteLocal(app: AppWithStatus) {
    setContextApp(null)
    setDeleteConfirm(null)
    await removeApp(app.id, false)
  }

  async function handleDeleteCloud(app: AppWithStatus) {
    setContextApp(null)
    setDeleteConfirm(null)
    await removeApp(app.id, true)
  }

  const bg = isDark ? 'bg-gray-950' : 'bg-gray-50'
  const cardBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
  const headerBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const navBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const textPrimary = isDark ? 'text-white' : 'text-gray-900'
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-400'
  const iconBg = isDark ? 'bg-indigo-900/40' : 'bg-indigo-100'
  const iconText = isDark ? 'text-indigo-300' : 'text-indigo-600'

  return (
    <div className={`min-h-screen ${bg} flex flex-col`}>
      {/* Header */}
      <header className={`${headerBg} border-b px-5 py-4 flex items-center justify-between pt-12`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <span className={`font-bold ${textPrimary}`}>AppAba</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadApps} className={`${textSecondary} hover:text-gray-500 transition-colors`}>
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={signOut} className={`${textSecondary} hover:text-gray-500 transition-colors`}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-28">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className={`${cardBg} rounded-2xl h-20 animate-pulse border`} />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📭</div>
            <p className={`${textSecondary} font-medium`}>No apps yet</p>
            <p className={`text-sm ${textSecondary} mt-1`}>Upload an app from the web dashboard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => {
              const dl = downloading[app.id]
              return (
                <div
                  key={app.id}
                  className={`${cardBg} rounded-2xl px-4 py-4 border shadow-sm active:scale-[0.99] transition-transform select-none`}
                  onTouchStart={() => startLongPress(app)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={() => startLongPress(app)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center text-base font-bold ${iconText} flex-shrink-0`}>
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold ${textPrimary} truncate`}>{app.name}</p>
                        {app.hasUpdate && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            Update
                          </span>
                        )}
                      </div>
                      {dl ? (
                        <p className="text-xs text-indigo-500 mt-0.5 truncate">{dl}</p>
                      ) : (
                        <p className={`text-xs ${textSecondary} mt-0.5`}>
                          {app.isDownloaded ? 'Ready · hold to manage' : 'Not downloaded'}
                        </p>
                      )}
                    </div>

                    {dl ? (
                      <div className="w-8 h-8 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : app.isDownloaded && !app.hasUpdate ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onTouchStart={cancelLongPress}
                          onClick={() => onCreateWidget(app.id, app.name)}
                          className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center"
                        >
                          <LayoutGrid className="w-4 h-4 text-gray-400" />
                        </button>
                        <button
                          onTouchStart={cancelLongPress}
                          onClick={() => onOpenApp(app.id)}
                          className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
                        >
                          <Play className="w-4 h-4 text-white" fill="white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onTouchStart={cancelLongPress}
                        onClick={() => handleDownload(app)}
                        className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-indigo-100 transition-colors flex-shrink-0"
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
      <nav className={`fixed bottom-0 left-0 right-0 ${navBg} border-t flex pb-6 pt-2`}>
        <button className="flex-1 flex flex-col items-center gap-0.5 py-2 text-indigo-600">
          <Smartphone className="w-5 h-5" />
          <span className="text-xs font-medium">My Apps</span>
        </button>
        <button onClick={onOpenVibes} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <Zap className="w-5 h-5" />
          <span className="text-xs font-medium">Vibe</span>
        </button>
        <button onClick={onOpenWidgets} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <LayoutGrid className="w-5 h-5" />
          <span className="text-xs font-medium">Widgets</span>
        </button>
        <button onClick={onOpenSettings} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <Settings className="w-5 h-5" />
          <span className="text-xs font-medium">Settings</span>
        </button>
      </nav>

      {/* Context Menu (long press) */}
      {contextApp && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setContextApp(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-gray-900 rounded-t-3xl p-5 pb-10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-indigo-900/40 rounded-xl flex items-center justify-center text-base font-bold text-indigo-300">
                {contextApp.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-semibold">{contextApp.name}</p>
                <p className="text-gray-500 text-xs">{contextApp.isDownloaded ? 'Downloaded' : 'Not downloaded'}</p>
              </div>
              <button onClick={() => setContextApp(null)} className="ml-auto text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {contextApp.isDownloaded && (
                <button
                  onClick={() => { cancelLongPress(); onOpenApp(contextApp.id); setContextApp(null) }}
                  className="w-full flex items-center gap-3 bg-indigo-600 rounded-2xl px-4 py-3 text-white font-semibold"
                >
                  <Play className="w-5 h-5" fill="white" />
                  Open App
                </button>
              )}
              {contextApp.isDownloaded && (
                <button
                  onClick={() => setDeleteConfirm({ app: contextApp, cloud: false })}
                  className="w-full flex items-center gap-3 bg-gray-800 rounded-2xl px-4 py-3 text-amber-400 font-medium"
                >
                  <CloudOff className="w-5 h-5" />
                  Remove from device
                </button>
              )}
              <button
                onClick={() => setDeleteConfirm({ app: contextApp, cloud: true })}
                className="w-full flex items-center gap-3 bg-red-900/40 border border-red-800 rounded-2xl px-4 py-3 text-red-400 font-medium"
              >
                <Trash2 className="w-5 h-5" />
                Delete app permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-1">
              {deleteConfirm.cloud ? 'Delete permanently?' : 'Remove from device?'}
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              {deleteConfirm.cloud
                ? `"${deleteConfirm.app.name}" will be deleted from the cloud and this device. This cannot be undone.`
                : `"${deleteConfirm.app.name}" files will be removed from this device. You can re-download later.`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirm.cloud
                  ? handleDeleteCloud(deleteConfirm.app)
                  : handleDeleteLocal(deleteConfirm.app)
                }
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold"
              >
                {deleteConfirm.cloud ? 'Delete' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

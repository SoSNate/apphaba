import { useState, useEffect } from 'react'
import { LayoutGrid, Plus, Pencil, Trash2, Smartphone, Zap, Settings } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Toast } from '@capacitor/toast'
import { WidgetBuilderScreen } from './WidgetBuilderScreen'

export interface SavedWidget {
  id: string
  appId: string
  appName: string
  name: string
  theme: 'nothing' | 'cyber' | 'retro'
  config: { background: string; rows: any[] }
  createdAt: number
}

function loadWidgets(): SavedWidget[] {
  try { return JSON.parse(localStorage.getItem('appaba_widgets') ?? '[]') } catch { return [] }
}

function saveWidgets(widgets: SavedWidget[]) {
  localStorage.setItem('appaba_widgets', JSON.stringify(widgets))
}

function WidgetMiniPreview({ config }: { config: SavedWidget['config'] }) {
  return (
    <div
      style={{ background: config.background ?? '#1e293b' }}
      className="w-full rounded-xl overflow-hidden p-3 flex flex-col gap-1"
    >
      {config.rows.slice(0, 3).map((row: any, i: number) => (
        <span
          key={i}
          style={{
            fontSize: Math.min(row.size ?? 12, 13),
            fontWeight: row.bold ? 700 : 400,
            color: row.color ?? '#ffffff',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {row.value}
        </span>
      ))}
    </div>
  )
}

const THEME_LABELS: Record<string, string> = {
  nothing: 'Nothing',
  cyber: 'Cyber',
  retro: 'Retro',
}

interface Props {
  onOpenApps: () => void
  onOpenVibes: () => void
  onOpenSettings: () => void
}

export function WidgetsScreen({ onOpenApps, onOpenVibes, onOpenSettings }: Props) {
  const [widgets, setWidgets] = useState<SavedWidget[]>([])
  const [editing, setEditing] = useState<SavedWidget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedWidget | null>(null)

  useEffect(() => { setWidgets(loadWidgets()) }, [])

  function refresh() { setWidgets(loadWidgets()) }

  async function deleteWidget(w: SavedWidget) {
    try {
      await (Capacitor.Plugins as any)['Widget']['remove']({ widgetId: w.id })
    } catch {}
    const updated = loadWidgets().filter(x => x.id !== w.id)
    saveWidgets(updated)
    setWidgets(updated)
    setDeleteTarget(null)
    await Toast.show({ text: 'Widget removed', duration: 'short', position: 'bottom' })
  }

  const isDark = localStorage.getItem('appaba_dark_mode') !== 'false'
  const bg = isDark ? 'bg-gray-950' : 'bg-gray-50'
  const cardBg = isDark ? 'bg-gray-900' : 'bg-white'
  const textPrimary = isDark ? 'text-white' : 'text-gray-900'
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500'
  const navBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'

  return (
    <div className={`min-h-screen ${bg} flex flex-col`}>
      {/* Header */}
      <header className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-b px-5 py-4 flex items-center justify-between pt-12`}>
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-indigo-500" />
          <span className={`font-bold ${textPrimary}`}>My Widgets</span>
        </div>
        <span className={`text-sm ${textSecondary}`}>{widgets.length} widget{widgets.length !== 1 ? 's' : ''}</span>
      </header>

      <main className="flex-1 px-4 py-5 pb-28">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center">
              <LayoutGrid className="w-8 h-8 text-gray-600" />
            </div>
            <div className="text-center">
              <p className={`font-semibold ${textPrimary}`}>No widgets yet</p>
              <p className={`text-sm ${textSecondary} mt-1`}>Open an app and tap ⊞ to create one</p>
            </div>
            <button
              onClick={onOpenApps}
              className="mt-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-2xl"
            >
              Go to My Apps
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {widgets.map(w => (
              <div key={w.id} className={`${cardBg} rounded-2xl p-3 flex flex-col gap-2`}>
                <WidgetMiniPreview config={w.config} />
                <div>
                  <p className={`text-xs font-semibold ${textPrimary} truncate`}>{w.name || w.appName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-indigo-400">{THEME_LABELS[w.theme] ?? w.theme}</span>
                    <span className={`text-xs ${textSecondary}`}>· {w.appName}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { Haptics.impact({ style: ImpactStyle.Light }); setEditing(w) }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-gray-800 text-gray-300 text-xs"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => { Haptics.impact({ style: ImpactStyle.Light }); setDeleteTarget(w) }}
                    className="flex items-center justify-center w-8 h-7 rounded-xl bg-red-900/30 text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add new */}
            <button
              onClick={onOpenApps}
              className="rounded-2xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center gap-2 py-8 text-gray-600 active:bg-gray-800"
            >
              <Plus className="w-6 h-6" />
              <span className="text-xs">New Widget</span>
            </button>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className={`fixed bottom-0 left-0 right-0 ${navBg} border-t flex pb-6 pt-2`}>
        <button onClick={onOpenApps} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <Smartphone className="w-5 h-5" />
          <span className="text-xs font-medium">My Apps</span>
        </button>
        <button onClick={onOpenVibes} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <Zap className="w-5 h-5" />
          <span className="text-xs font-medium">Vibe</span>
        </button>
        <button className="flex-1 flex flex-col items-center gap-0.5 py-2 text-indigo-600">
          <LayoutGrid className="w-5 h-5" />
          <span className="text-xs font-medium">Widgets</span>
        </button>
        <button onClick={onOpenSettings} className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${textSecondary}`}>
          <Settings className="w-5 h-5" />
          <span className="text-xs font-medium">Settings</span>
        </button>
      </nav>

      {/* Edit sheet */}
      {editing && (
        <WidgetBuilderScreen
          appId={editing.appId}
          appName={editing.appName}
          existingWidget={editing}
          onClose={() => { setEditing(null); refresh() }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <p className="text-white font-semibold mb-1">Remove widget?</p>
            <p className="text-gray-400 text-sm mb-5">
              "{deleteTarget.name || deleteTarget.appName}" will be removed from your home screen.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm">Cancel</button>
              <button onClick={() => deleteWidget(deleteTarget)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

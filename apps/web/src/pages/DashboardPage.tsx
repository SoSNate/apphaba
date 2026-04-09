import { useNavigate } from 'react-router-dom'
import { Plus, LogOut, Smartphone } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useApps } from '../hooks/useApps'
import { AppCard } from '../components/AppCard'
import type { App } from '@appaba/shared'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const { apps, loading } = useApps(user)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">AppAba</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Apps</h1>
            <p className="text-sm text-gray-500 mt-0.5">{apps.length} app{apps.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => navigate('/apps/new')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white
              font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New App
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 h-32 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-700">No apps yet</h2>
            <p className="text-sm text-gray-400 mt-1 mb-5">Create your first app and push it to your phone</p>
            <button
              onClick={() => navigate('/apps/new')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Create your first app
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map((app: App) => (
              <AppCard key={app.id} app={app} onClick={() => navigate(`/apps/${app.id}`)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

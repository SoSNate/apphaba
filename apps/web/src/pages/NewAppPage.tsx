import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useApps } from '../hooks/useApps'
import { toSlug } from '@appaba/shared'

export default function NewAppPage() {
  const { user } = useAuth()
  const { createApp } = useApps(user)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleNameChange(val: string) {
    setName(val)
    setSlug(toSlug(val))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      const app = await createApp(name.trim(), slug)
      navigate(`/apps/${app.id}`)
    } catch (err: any) {
      setError(err.message?.includes('unique') ? 'That slug is already taken. Try a different name.' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </button>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h1 className="text-xl font-bold text-gray-900 mb-1">New App</h1>
          <p className="text-sm text-gray-500 mb-6">Give your app a name and we'll set it up for you.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">App name</label>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="My Awesome App"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                URL slug <span className="text-gray-400 font-normal">(auto-generated)</span>
              </label>
              <div className="flex items-center rounded-xl border border-gray-200 focus-within:ring-2
                focus-within:ring-indigo-500 focus-within:border-transparent overflow-hidden">
                <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-200">appaba.app/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white
                font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><span>Create app</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

import { Globe, Lock, Clock } from 'lucide-react'
import type { App } from '@appaba/shared'

interface Props {
  app: App
  onClick: () => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function AppCard({ app, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer
        hover:shadow-md hover:border-indigo-200 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-lg font-bold text-indigo-600">
          {app.name.charAt(0).toUpperCase()}
        </div>
        <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full
          ${app.is_public
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
          }`}>
          {app.is_public
            ? <><Globe className="w-3 h-3" /> Public</>
            : <><Lock className="w-3 h-3" /> Private</>
          }
        </span>
      </div>

      <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
        {app.name}
      </h3>
      <p className="text-xs text-gray-400 mt-0.5">/{app.slug}</p>

      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
        <Clock className="w-3 h-3" />
        {relativeTime(app.updated_at)}
      </div>
    </div>
  )
}

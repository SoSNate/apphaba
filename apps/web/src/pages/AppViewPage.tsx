import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const APP_URL = import.meta.env.VITE_APP_URL ?? ''

export default function AppViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Verify the app exists and is accessible
    fetch(`${APP_URL}/api/app/${slug}`)
      .then(res => {
        if (res.ok) setReady(true)
        else res.text().then(t => setError(t))
      })
      .catch(() => setError('Could not load app'))
  }, [slug])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{error}</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <iframe
      src={`${APP_URL}/api/app/${slug}`}
      className="fixed inset-0 w-full h-full border-none"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
      title={slug}
    />
  )
}

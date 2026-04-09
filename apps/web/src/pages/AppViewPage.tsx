import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AppViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const [iframeSrc, setIframeSrc] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: app, error } = await supabase
        .from('apps')
        .select('id, storage_path, is_public')
        .eq('slug', slug)
        .single()

      if (error || !app) { setError('App not found'); return }
      if (!app.is_public) { setError('This app is private'); return }
      if (!app.storage_path) { setError('No files uploaded yet'); return }

      // Get signed URL for index.html
      const indexPath = `${app.storage_path}index.html`
      const { data } = await supabase.storage
        .from('app-files')
        .createSignedUrl(indexPath, 3600)

      if (!data?.signedUrl) { setError('Could not load app'); return }
      setIframeSrc(data.signedUrl)
    }
    load()
  }, [slug])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{error}</p>
      </div>
    )
  }

  if (!iframeSrc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <iframe
      src={iframeSrc}
      className="fixed inset-0 w-full h-full border-none"
      sandbox="allow-scripts allow-same-origin allow-forms"
      title={slug}
    />
  )
}

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

      // Find index.html recursively under storage_path
      async function findIndexHtml(prefix: string): Promise<string | null> {
        const { data: files } = await supabase.storage
          .from('app-files')
          .list(prefix, { limit: 100 })
        if (!files) return null
        for (const f of files) {
          if (f.name === 'index.html' && f.id !== null) return `${prefix}${f.name}`
          if (f.id === null) {
            const found = await findIndexHtml(`${prefix}${f.name}/`)
            if (found) return found
          }
        }
        return null
      }

      const indexPath = await findIndexHtml(app.storage_path)
      if (!indexPath) { setError('Could not load app'); return }

      const { data } = supabase.storage
        .from('app-files')
        .getPublicUrl(indexPath)

      setIframeSrc(data.publicUrl)
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

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const APP_URL = import.meta.env.VITE_APP_URL ?? ''

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

      // Relative path from storage_path (e.g. "index.html" or "dist/index.html")
      const relativePath = indexPath.replace(app.storage_path, '')
      const baseDir = relativePath.includes('/')
        ? relativePath.split('/').slice(0, -1).join('/') + '/'
        : ''

      // Fetch HTML and inject <base> tag so relative assets resolve correctly
      const { data: blob } = await supabase.storage
        .from('app-files')
        .download(indexPath)

      if (!blob) { setError('Could not load app'); return }

      let html = await blob.text()

      // Build the public base URL for assets — must end with /
      const assetBase = `${app.storage_path}${baseDir}`
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/app-files/${assetBase}`
      const baseHref = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

      // Inject <base href="..."> so all relative paths resolve to Supabase
      html = html.replace('<head>', `<head><base href="${baseHref}">`)

      const blob2 = new Blob([html], { type: 'text/html' })
      setIframeSrc(URL.createObjectURL(blob2))
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
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      title={slug}
    />
  )
}

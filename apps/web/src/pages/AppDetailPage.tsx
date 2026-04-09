import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Globe, Lock, Share2, Trash2, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useApps } from '../hooks/useApps'
import { FolderDropZone } from '../components/FolderDropZone'
import { QRCodeDisplay } from '../components/QRCodeDisplay'
import type { App } from '@appaba/shared'

export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { apps, uploadFiles, togglePublic, deleteApp } = useApps(user)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadDone, setUploadDone] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const app: App | undefined = apps.find((a: App) => a.id === id)

  useEffect(() => { setUploadDone(false) }, [id])

  async function handleFiles(entries: { file: File; path: string }[]) {
    if (!app) return
    setUploading(true)
    setUploadDone(false)
    try {
      await uploadFiles(app.id, entries, setProgress)
      setUploadDone(true)
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  async function handleDelete() {
    if (!app) return
    await deleteApp(app.id)
    navigate('/')
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const shareUrl = `${import.meta.env.VITE_APP_URL}/view/${app.slug}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 truncate">{app.name}</h1>
            <p className="text-xs text-gray-400">/{app.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Public toggle */}
            <button
              onClick={() => togglePublic(app.id, !app.is_public)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors
                ${app.is_public
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {app.is_public ? <><Globe className="w-3.5 h-3.5" /> Public</> : <><Lock className="w-3.5 h-3.5" /> Private</>}
            </button>

            {/* Share */}
            {app.is_public && (
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg
                  bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Upload zone */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            {app.storage_path ? 'Update Code' : 'Upload Code'}
          </h2>
          {uploadDone && (
            <div className="mb-3 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl">
              ✓ Upload complete — your phone will be notified
            </div>
          )}
          <FolderDropZone onFiles={handleFiles} uploading={uploading} progress={progress} />
        </div>

        {/* App info */}
        {app.storage_path && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">App Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Storage path</dt>
                <dd className="text-gray-700 font-mono text-xs">{app.storage_path}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Last version</dt>
                <dd className="text-gray-700">{new Date(app.version).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Visibility</dt>
                <dd className="text-gray-700">{app.is_public ? 'Public' : 'Private'}</dd>
              </div>
            </dl>
          </div>
        )}
      </main>

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">Share App</h2>
              <button onClick={() => setShowShare(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <QRCodeDisplay url={shareUrl} appName={app.name} />
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-semibold text-gray-900 mb-2">Delete "{app.name}"?</h2>
            <p className="text-sm text-gray-500 mb-5">This will permanently delete the app and all its files.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-medium text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

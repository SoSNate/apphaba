import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { App } from '@appaba/shared'
import { toSlug } from '@appaba/shared'

export function useApps(user: User | null) {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(false)

  const loadApps = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('apps')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    setApps(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { loadApps() }, [loadApps])

  async function createApp(name: string, customSlug?: string): Promise<App> {
    const slug = customSlug || toSlug(name)
    const { data, error } = await supabase
      .from('apps')
      .insert({ name, slug, user_id: user!.id })
      .select()
      .single()
    if (error) throw error
    setApps((prev: App[]) => [data, ...prev])
    return data
  }

  async function uploadFiles(appId: string, fileEntries: { file: File; path: string }[], onProgress?: (msg: string) => void) {
    const userId = user!.id
    const storagePath = `${userId}/${appId}/`

    // Delete old files first
    const { data: existingFiles } = await supabase.storage
      .from('app-files')
      .list(`${userId}/${appId}`, { limit: 1000 })
    if (existingFiles?.length) {
      const toRemove = existingFiles.map(f => `${userId}/${appId}/${f.name}`)
      await supabase.storage.from('app-files').remove(toRemove)
    }

    // Upload new files
    for (const { file, path } of fileEntries) {
      onProgress?.(`Uploading: ${path}`)
      const fullPath = `${storagePath}${path}`
      const { error } = await supabase.storage
        .from('app-files')
        .upload(fullPath, file, { upsert: true })
      if (error) throw error
    }

    // Bump version
    const { error } = await supabase
      .from('apps')
      .update({ storage_path: storagePath, version: new Date().toISOString() })
      .eq('id', appId)
    if (error) throw error

    await loadApps()
  }

  async function togglePublic(appId: string, isPublic: boolean) {
    await supabase.from('apps').update({ is_public: isPublic }).eq('id', appId)
    setApps((prev: App[]) => prev.map((a: App) => a.id === appId ? { ...a, is_public: isPublic } : a))
  }

  async function deleteApp(appId: string) {
    const userId = user!.id
    // Delete storage files
    const { data: files } = await supabase.storage
      .from('app-files')
      .list(`${userId}/${appId}`, { limit: 1000 })
    if (files?.length) {
      await supabase.storage.from('app-files').remove(files.map(f => `${userId}/${appId}/${f.name}`))
    }
    await supabase.from('apps').delete().eq('id', appId)
    setApps((prev: App[]) => prev.filter((a: App) => a.id !== appId))
  }

  return { apps, loading, loadApps, createApp, uploadFiles, togglePublic, deleteApp }
}

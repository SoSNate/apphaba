import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { App } from '@appaba/shared'
import { toSlug } from '@appaba/shared'

/** Recursively list all file paths under a storage prefix */
async function listAllPaths(prefix: string): Promise<string[]> {
  const { data } = await supabase.storage
    .from('app-files')
    .list(prefix.replace(/\/$/, ''), { limit: 1000 })
  if (!data) return []
  const results: string[] = []
  for (const item of data) {
    const full = `${prefix}${item.name}`
    if (item.id === null) {
      // directory — recurse
      results.push(...await listAllPaths(full + '/'))
    } else {
      results.push(full)
    }
  }
  return results
}

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

  async function uploadFiles(
    appId: string,
    fileEntries: { file: File; path: string }[],
    onProgress?: (msg: string) => void
  ) {
    const userId = user!.id
    const storagePath = `${userId}/${appId}/`
    const newPaths = new Set(fileEntries.map(e => `${storagePath}${e.path}`))

    // 1. Upload new files first (upsert) — storage is never empty during transition
    for (const { file, path } of fileEntries) {
      onProgress?.(`Uploading: ${path}`)
      const { error } = await supabase.storage
        .from('app-files')
        .upload(`${storagePath}${path}`, file, { upsert: true })
      if (error) throw error
    }

    // 2. Bump version — triggers Realtime event on mobile
    const { error } = await supabase
      .from('apps')
      .update({ storage_path: storagePath, version: new Date().toISOString() })
      .eq('id', appId)
    if (error) throw error

    // 3. Delete orphaned files from previous upload (recursive)
    const existingPaths = await listAllPaths(storagePath)
    const toRemove = existingPaths.filter(p => !newPaths.has(p))
    if (toRemove.length) {
      await supabase.storage.from('app-files').remove(toRemove)
    }

    await loadApps()
  }

  async function togglePublic(appId: string, isPublic: boolean) {
    await supabase.from('apps').update({ is_public: isPublic }).eq('id', appId)
    setApps((prev: App[]) => prev.map((a: App) =>
      a.id === appId ? { ...a, is_public: isPublic } : a
    ))
  }

  async function deleteApp(appId: string) {
    const userId = user!.id
    const storagePath = `${userId}/${appId}/`
    const allPaths = await listAllPaths(storagePath)
    if (allPaths.length) {
      await supabase.storage.from('app-files').remove(allPaths)
    }
    await supabase.from('apps').delete().eq('id', appId)
    setApps((prev: App[]) => prev.filter((a: App) => a.id !== appId))
  }

  return { apps, loading, loadApps, createApp, uploadFiles, togglePublic, deleteApp }
}

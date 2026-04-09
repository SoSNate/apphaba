import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getLocalVersion, appExistsLocally } from '../lib/filesystem'
import type { App } from '@appaba/shared'

export interface AppWithStatus extends App {
  isDownloaded: boolean
  hasUpdate: boolean
}

export function useApps(user: User | null) {
  const [apps, setApps] = useState<AppWithStatus[]>([])
  const [loading, setLoading] = useState(false)

  const loadApps = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('apps')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    const withStatus = await Promise.all(
      (data ?? []).map(async (app: App) => {
        const downloaded = await appExistsLocally(app.id)
        const localVersion = getLocalVersion(app.id)
        return {
          ...app,
          isDownloaded: downloaded,
          hasUpdate: downloaded && localVersion !== null && localVersion < app.version,
        }
      })
    )
    setApps(withStatus)
    setLoading(false)
  }, [user])

  useEffect(() => { loadApps() }, [loadApps])

  function markDownloaded(appId: string, version: string) {
    setApps(prev =>
      prev.map(a => a.id === appId
        ? { ...a, isDownloaded: true, hasUpdate: false }
        : a
      )
    )
    // Update persisted version
    const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
    versions[appId] = version
    localStorage.setItem('appaba_local_versions', JSON.stringify(versions))
  }

  function markUpdated(app: App) {
    setApps(prev =>
      prev.map(a => a.id === app.id
        ? { ...a, ...app, hasUpdate: true }
        : a
      )
    )
  }

  return { apps, loading, loadApps, markDownloaded, markUpdated }
}

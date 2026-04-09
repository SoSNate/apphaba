import { useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { useAuth } from './hooks/useAuth'
import { AuthScreen } from './screens/AuthScreen'
import { AppListScreen } from './screens/AppListScreen'
import { AppViewerScreen } from './screens/AppViewerScreen'
import { onNotificationTap } from './lib/notifications'
import { useState } from 'react'
import { supabase } from './lib/supabase'
import type { App } from '@appaba/shared'

type Screen =
  | { name: 'list' }
  | { name: 'viewer'; appId: string; appName: string }

function Spinner() {
  return (
    <div className="min-h-screen bg-indigo-600 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AppRoot() {
  const { session, loading } = useAuth()
  const [screen, setScreen] = useState<Screen>({ name: 'list' })

  async function navigateToAppById(appId: string) {
    const { data } = await supabase.from('apps').select('name').eq('id', appId).single()
    if (data) {
      setScreen({ name: 'viewer', appId, appName: data.name })
    }
  }

  async function navigateToAppBySlug(slug: string) {
    const { data } = await supabase.from('apps').select('id, name').eq('slug', slug).single()
    if (data) {
      setScreen({ name: 'viewer', appId: data.id, appName: data.name })
    }
  }

  // Handle notification tap → open the updated app
  useEffect(() => {
    onNotificationTap((appId) => navigateToAppById(appId))
  }, [])

  // Handle deep link: appaba://view/{slug}
  useEffect(() => {
    const listener = CapApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
      const slug = url.split('appaba://view/')[1]
      if (slug) navigateToAppBySlug(slug)
    })
    return () => { listener.then(l => l.remove()) }
  }, [])

  if (loading) return <Spinner />
  if (!session) return <AuthScreen />

  if (screen.name === 'viewer') {
    return (
      <AppViewerScreen
        appId={screen.appId}
        appName={screen.appName}
        onBack={() => setScreen({ name: 'list' })}
      />
    )
  }

  return (
    <AppListScreen
      onOpenApp={async (appId: string) => {
        const app = await supabase.from('apps').select('name').eq('id', appId).single()
        setScreen({
          name: 'viewer',
          appId,
          appName: (app.data as App | null)?.name ?? 'App',
        })
      }}
    />
  )
}

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { notifyAppUpdated } from '../lib/notifications'
import type { App } from '@appaba/shared'

export function useRealtime(userId: string | null, onUpdate: (app: App) => void) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`apps_updates_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'apps',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const updated = payload.new as App
          onUpdateRef.current(updated)
          await notifyAppUpdated(updated.name, updated.id)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [userId])
}

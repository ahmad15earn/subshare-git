import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Notification } from '../../types/database'

/** Unread notification count for the badge in the navigation. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Live updates: new notifications arrive via Supabase Realtime. */
export function useNotificationsRealtime(uid: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!uid) return
    const channel = supabase
      .channel(`notifications-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          // New activity from a followed user also means a new feed entry.
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          void queryClient.invalidateQueries({ queryKey: ['feed'] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [uid, queryClient])
}

export type NotificationWithActor = Notification & {
  actor: { username: string; display_name: string; avatar_url: string | null } | null
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'list'],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          '*, actor:profiles!notifications_actor_id_fkey (username, display_name, avatar_url)',
        )
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as NotificationWithActor[]
    },
  })
}

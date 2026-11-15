import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { BellOff, CheckCheck, UserPlus, Users, FolderPlus, PlusCircle, FolderSymlink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { RowSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../auth/AuthContext'
import { useNotifications, useNotificationsRealtime, useUnreadCount } from './useNotifications'
import type { NotificationType } from '../../types/database'

const TYPE_META: Record<NotificationType, { icon: LucideIcon; classes: string }> = {
  new_follower: { icon: UserPlus, classes: 'bg-primary-soft text-primary' },
  follow_request: { icon: Users, classes: 'bg-amber-100 text-amber-600' },
  request_accepted: { icon: Users, classes: 'bg-emerald-100 text-emerald-700' },
  new_collection: { icon: FolderPlus, classes: 'bg-violet-100 text-violet-600' },
  new_item_from_followed_user: { icon: PlusCircle, classes: 'bg-blue-100 text-blue-600' },
  new_item_in_followed_collection: { icon: FolderSymlink, classes: 'bg-cyan-100 text-cyan-700' },
}

function notificationText(type: NotificationType, actorName: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'new_follower':
      return `${actorName} started following you.`
    case 'follow_request':
      return `${actorName} requested to follow you.`
    case 'request_accepted':
      return `${actorName} accepted your follow request.`
    case 'new_collection':
      return `${actorName} shared a new collection: ${String(payload['title'] ?? '')}.`
    case 'new_item_from_followed_user':
      return `${actorName} added ${String(payload['item_name'] ?? 'an item')} to ${String(payload['collection_title'] ?? 'a collection')}.`
    case 'new_item_in_followed_collection':
      return `${actorName} added ${String(payload['item_name'] ?? 'an item')} to ${String(payload['collection_title'] ?? 'a collection you follow')}.`
  }
}

function notificationHref(payload: Record<string, unknown>, actorUsername?: string): string | null {
  const collectionId = payload['collection_id']
  if (collectionId) return `/c/${String(collectionId)}`
  if (actorUsername) return `/u/${actorUsername}`
  return null
}

export function NotificationsPage() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  useNotificationsRealtime(uid)
  const { data: unread = 0 } = useUnreadCount(uid !== null)

  const notifications = useNotifications()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', uid!)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  function onOpen(id: string, isRead: boolean, href: string | null) {
    if (!isRead) markRead.mutate(id)
    if (href) navigate(href)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Notifications</h1>
        {unread > 0 && (
          <Button variant="ghost" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {notifications.isPending && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      )}

      {notifications.isError && (
        <ErrorState title="Couldn't load notifications" onRetry={() => void notifications.refetch()} />
      )}

      {notifications.data && notifications.data.length === 0 && (
        <EmptyState
          icon={<BellOff className="h-6 w-6" />}
          title="No notifications yet"
          description="When friends follow you, request to follow you, or share collections, you'll see it here."
        />
      )}

      <div className="space-y-2">
        {notifications.data?.map((n) => {
          const meta = TYPE_META[n.type]
          const payload = (n.payload ?? {}) as Record<string, unknown>
          const actorName = n.actor?.display_name ?? String(payload['display_name'] ?? 'Someone')
          const href = notificationHref(payload, n.actor?.username)
          return (
            <button
              key={n.id}
              onClick={() => onOpen(n.id, n.is_read, href)}
              className="block w-full cursor-pointer text-left"
            >
              <Card className={n.is_read ? 'opacity-75' : 'border-primary/30 bg-primary-soft/40'}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.classes}`}>
                    <meta.icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-800">{notificationText(n.type, actorName, payload)}</p>
                    <span className="mt-0.5 block text-xs text-neutral-400">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.actor && <Avatar src={n.actor.avatar_url} name={n.actor.display_name} size="sm" />}
                  {!n.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              </Card>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-neutral-400">
        You can turn each notification type on or off in{' '}
        <Link to="/settings" className="text-primary hover:underline">
          Settings
        </Link>
        .
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, Users, UserCheck, Clock, Check, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useFollowActions } from './useFollow'
import { UserRow, type UserRowUser } from './UserRow'
import { Tabs, type TabItem } from '../../components/ui/Tabs'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { RowSkeleton } from '../../components/ui/Skeleton'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'

type Tab = 'following' | 'followers' | 'requests' | 'suggested'

const TABS: TabItem<Tab>[] = [
  { value: 'following', label: 'Following' },
  { value: 'followers', label: 'Followers' },
  { value: 'requests', label: 'Requests' },
  { value: 'suggested', label: 'Suggested' },
]

interface FollowRow {
  profile: UserRowUser
}

async function fetchFollowList(
  uid: string,
  direction: 'following' | 'followers',
): Promise<UserRowUser[]> {
  const isFollowing = direction === 'following'
  const fk = isFollowing ? 'follows_following_id_fkey' : 'follows_follower_id_fkey'
  const { data, error } = await supabase
    .from('follows')
    .select(`profile:profiles!${fk} (id, username, display_name, avatar_url, bio, is_private)`)
    .eq(isFollowing ? 'follower_id' : 'following_id', uid)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data as FollowRow[]).map((r) => r.profile)
}

export function FriendsPage() {
  const { user } = useAuth()
  const uid = user!.id
  const [tab, setTab] = useState<Tab>('following')
  const { toast } = useToast()
  const { accept, decline } = useFollowActions()

  const following = useQuery({
    queryKey: ['friends', 'following'],
    queryFn: () => fetchFollowList(uid, 'following'),
  })
  const followers = useQuery({
    queryKey: ['friends', 'followers'],
    queryFn: () => fetchFollowList(uid, 'followers'),
  })

  const incoming = useQuery({
    queryKey: ['friends', 'requests-in'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('profile:profiles!follows_follower_id_fkey (id, username, display_name, avatar_url, bio, is_private)')
        .eq('following_id', uid)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as FollowRow[]).map((r) => r.profile)
    },
  })

  const outgoing = useQuery({
    queryKey: ['friends', 'requests-out'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('profile:profiles!follows_following_id_fkey (id, username, display_name, avatar_url, bio, is_private)')
        .eq('follower_id', uid)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as FollowRow[]).map((r) => r.profile)
    },
  })

  const suggested = useQuery({
    queryKey: ['suggested-people'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_suggested_people', { p_limit: 10 })
      if (error) throw error
      return data
    },
  })

  const requestCount = (incoming.data?.length ?? 0) + (outgoing.data?.length ?? 0)
  const tabsWithCount = TABS.map((t) => (t.value === 'requests' ? { ...t, count: requestCount } : t))

  async function onAccept(id: string) {
    try {
      await accept.mutateAsync(id)
      toast('Request accepted. They can now see your shared collections.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to accept.', 'error')
    }
  }
  async function onDecline(id: string) {
    try {
      await decline.mutateAsync(id)
      toast('Request declined.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to decline.', 'error')
    }
  }

  const contentByTab: Record<Tab, React.ReactNode> = {
    following: <List query={following} empty={{ title: 'Not following anyone yet', description: 'Find people whose subscriptions you want to discover. When you follow them, their collections and activity show up in your feed.' }} />,
    followers: <List query={followers} empty={{ title: 'No followers yet', description: "When people follow you, they'll appear here and your shared collections will reach them." }} />,
    suggested: <Suggested query={suggested} />,
    requests: (
      <div className="divide-y divide-neutral-100">
        <RequestSection
          title="Incoming requests"
          icon={<UserPlus className="h-4 w-4" />}
          query={incoming}
          renderTrailing={(u) => (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" loading={accept.isPending && accept.variables === u.id} onClick={() => void onAccept(u.id)}>
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button size="sm" variant="outline" loading={decline.isPending && decline.variables === u.id} onClick={() => void onDecline(u.id)}>
                <X className="h-4 w-4" />
                Decline
              </Button>
            </div>
          )}
          empty={{ title: 'No incoming requests', description: 'When someone asks to follow you (private account), you can accept or decline it here.' }}
        />
        <RequestSection
          title="Sent requests"
          icon={<Clock className="h-4 w-4" />}
          query={outgoing}
          renderTrailing={(u) => (
            <Button
              size="sm"
              variant="outline"
              loading={decline.isPending && decline.variables === u.id}
              onClick={() => {
                void decline.mutateAsync(u.id).then(() => toast('Request cancelled.'))
              }}
            >
              Cancel
            </Button>
          )}
          empty={{ title: 'No sent requests', description: 'Requests you send to private accounts appear here until they respond.' }}
        />
      </div>
    ),
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Friends</h1>
      <Tabs tabs={tabsWithCount} value={tab} onChange={setTab} className="mb-3" />
      {contentByTab[tab]}
    </div>
  )
}

function List({
  query,
  empty,
}: {
  query: { isPending: boolean; isError: boolean; data?: UserRowUser[]; refetch: () => void }
  empty: { title: string; description: string }
}) {
  if (query.isPending) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }
  if (query.isError) return <ErrorState onRetry={query.refetch} />
  if (!query.data || query.data.length === 0) return <EmptyState icon={<Users className="h-6 w-6" />} title={empty.title} description={empty.description} />
  return (
    <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm">
      {query.data.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}
    </div>
  )
}

function RequestSection({
  title,
  icon,
  query,
  renderTrailing,
  empty,
}: {
  title: string
  icon: React.ReactNode
  query: { isPending: boolean; isError: boolean; data?: UserRowUser[]; refetch: () => void }
  renderTrailing: (user: UserRowUser) => React.ReactNode
  empty: { title: string; description: string }
}) {
  return (
    <section className="py-2">
      <h2 className="mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-neutral-700">
        {icon}
        {title}
        {query.data && query.data.length > 0 && (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
            {query.data.length}
          </span>
        )}
      </h2>
      {query.isPending && <RowSkeleton />}
      {query.isError && <ErrorState onRetry={query.refetch} />}
      {query.data?.length === 0 && (
        <p className="px-1 py-3 text-sm text-neutral-400">{empty.description}</p>
      )}
      <div className="divide-y divide-neutral-100">
        {query.data?.map((u) => (
          <UserRow key={u.id} user={u} trailing={renderTrailing(u)} />
        ))}
      </div>
    </section>
  )
}

function Suggested({
  query,
}: {
  query: { isPending: boolean; isError: boolean; data?: { id: string; username: string; display_name: string; avatar_url: string | null; bio: string | null; is_private: boolean; reason: string; follows_me: boolean }[]; refetch: () => void }
}) {
  if (query.isPending) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }
  if (query.isError) return <ErrorState onRetry={query.refetch} />
  if (!query.data || query.data.length === 0) {
    return (
      <EmptyState
        icon={<UserCheck className="h-6 w-6" />}
        title="No suggestions yet"
        description="Suggestions appear when you and other people follow the same accounts or share similar collections."
      />
    )
  }
  return (
    <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm">
      {query.data.map((u) => (
        <UserRow key={u.id} user={u} />
      ))}
    </div>
  )
}
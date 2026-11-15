import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { CalendarDays, FolderPlus, Lock, Settings, Share2, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { FollowButton } from '../follow/FollowButton'
import { CollectionCard } from '../collections/CollectionCard'
import { ActivityCard } from '../feed/ActivityCard'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { ActivitySkeleton } from '../../components/ui/Skeleton'
import type { FeedRow } from '../../types/database'

const PAGE_SIZE = 20

export function ProfilePage() {
  const { username = '' } = useParams()
  const { user } = useAuth()
  const [tab, setTab] = useState<'collections' | 'activity'>('collections')

  const profile = useQuery({
    queryKey: ['profile-by-username', username],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const pid = profile.data?.id ?? null
  const isSelf = pid !== null && pid === user?.id

  const counts = useQuery({
    queryKey: ['profile-counts', pid],
    enabled: pid !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_counts', { p_profile_id: pid! })
      if (error) throw error
      return data[0] ?? null
    },
  })

  const collections = useQuery({
    queryKey: ['profile-collections', pid],
    enabled: pid !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collections_for_profile', { p_owner_id: pid! })
      if (error) throw error
      return data
    },
  })

  const activity = useInfiniteQuery({
    queryKey: ['profile-activity', pid],
    enabled: pid !== null,
    initialPageParam: null as { before: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_profile_activities', {
        p_profile_id: pid!,
        p_before: pageParam?.before ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: PAGE_SIZE,
      })
      if (error) throw error
      return data as FeedRow[]
    },
    getNextPageParam: (last) => {
      if (last.length < PAGE_SIZE) return undefined
      const lastRow = last.at(-1)
      return lastRow ? { before: lastRow.created_at, id: lastRow.id } : undefined
    },
  })

  // ---------- States ----------
  if (profile.isPending) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-4">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        </Card>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }

  if (profile.isError) {
    return <ErrorState title="Couldn't load this profile" onRetry={() => void profile.refetch()} />
  }

  if (!profile.data) {
    return (
      <EmptyState
        icon={<UserPlus className="h-6 w-6" />}
        title="Profile not found"
        description={`No one with the username @${username} exists on SubShare.`}
      />
    )
  }

  const p = profile.data
  const isLocked = p.is_private && !isSelf && counts.data?.follow_status !== 'accepted'

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <Card>
        <div className="flex items-start gap-4">
          <Avatar src={p.avatar_url} name={p.display_name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-neutral-900">{p.display_name}</h1>
            <p className="text-sm text-neutral-500">@{p.username}</p>
            {p.bio && <p className="mt-2 text-sm text-neutral-700">{p.bio}</p>}
          </div>
        </div>

        <div className="mt-4 flex gap-5 border-t border-neutral-100 pt-3 text-sm">
          <span>
            <b className="text-neutral-900">{counts.data?.followers ?? '–'}</b>{' '}
            <span className="text-neutral-500">{(counts.data?.followers ?? 0) === 1 ? 'follower' : 'followers'}</span>
          </span>
          <span>
            <b className="text-neutral-900">{counts.data?.following ?? '–'}</b>{' '}
            <span className="text-neutral-500">following</span>
          </span>
          <span>
            <b className="text-neutral-900">{counts.data?.collections ?? '–'}</b>{' '}
            <span className="text-neutral-500">collections</span>
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {isSelf ? (
            <>
              <Link to={`/u/${p.username}/edit`}>
                <Button variant="outline" size="sm">Edit profile</Button>
              </Link>
              <Link to="/settings">
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </>
          ) : (
            <FollowButton
              targetId={p.id}
              targetIsPrivate={p.is_private}
              size="sm"
              className="min-w-32"
            />
          )}
          {counts.data?.follow_status === 'pending' && (
            <span className="text-xs text-amber-600">Waiting for approval</span>
          )}
        </div>
      </Card>

      {/* ---------- Connected platforms (Phase 1 placeholder) ---------- */}
      <Card className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
          <Share2 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-neutral-800">Connected platforms</p>
          <p className="text-xs text-neutral-500">
            {isSelf ? 'Connect your YouTube account from the Platforms page.' : 'Channels this user connects will appear here.'}
          </p>
        </div>
        {isSelf && (
          <Link to="/platforms">
            <Button variant="ghost" size="sm">Open</Button>
          </Link>
        )}
      </Card>

      {/* ---------- Tabs ---------- */}
      <Tabs
        tabs={[
          { value: 'collections', label: 'Collections' },
          { value: 'activity', label: 'Activity' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'collections' &&
        (isLocked ? (
          <PrivateNotice />
        ) : collections.isPending ? (
          <Skeleton className="h-36 rounded-2xl" />
        ) : collections.isError ? (
          <ErrorState onRetry={() => void collections.refetch()} />
        ) : collections.data.length === 0 ? (
          <EmptyState
            icon={<FolderPlus className="h-6 w-6" />}
            title={isSelf ? 'No collections yet' : 'No shared collections'}
            description={
              isSelf
                ? 'Create your first collection and add the channels you love. Friends can follow them and subscribe too.'
                : `${p.display_name} hasn't shared any collections you can see yet.`
            }
            action={
              isSelf ? (
                <Link to="/collections/new">
                  <Button>New collection</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {collections.data.map((c) => (
              <CollectionCard key={c.id} c={c} />
            ))}
          </div>
        ))}

      {tab === 'activity' &&
        (isLocked ? (
          <PrivateNotice />
        ) : activity.isPending ? (
          <ActivitySkeleton />
        ) : activity.isError ? (
          <ErrorState onRetry={() => void activity.refetch()} />
        ) : (activity.data?.pages.flat().length ?? 0) === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-6 w-6" />}
            title="No activity yet"
            description="Added items and new collections will show up here."
          />
        ) : (
          <ActivityList
            rows={activity.data.pages.flat()}
            hasNext={activity.hasNextPage}
            fetchNext={() => void activity.fetchNextPage()}
            fetching={activity.isFetchingNextPage}
          />
        ))}
    </div>
  )
}

function PrivateNotice() {
  return (
    <EmptyState
      icon={<Lock className="h-6 w-6" />}
      title="This account is private"
      description="Send a follow request — once it's accepted you'll see their collections and activity."
    />
  )
}

function ActivityList({
  rows,
  hasNext,
  fetchNext,
  fetching,
}: {
  rows: FeedRow[]
  hasNext: boolean
  fetchNext: () => void
  fetching: boolean
}) {
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNext) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchNext()
      },
      { rootMargin: '500px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNext, fetchNext])

  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <ActivityCard key={a.id} a={a} />
      ))}
      <div ref={sentinel} className="h-6" />
      {fetching && <p className="text-center text-sm text-neutral-400">Loading more…</p>}
    </div>
  )
}

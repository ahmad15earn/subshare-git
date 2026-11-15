import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Rss } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useFeed } from './useFeed'
import { ActivityCard } from './ActivityCard'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ActivitySkeleton } from '../../components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export function HomePage() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const feed = useFeed()

  // Distinguish "follows nobody" from "follows quiet people".
  const followingCount = useQuery({
    queryKey: ['feed', 'following-count', uid],
    enabled: uid !== null,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', uid!)
        .eq('status', 'accepted')
      if (error) throw error
      return count ?? 0
    },
  })

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed
  const rows = feed.data?.pages.flat() ?? []
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '500px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (feed.isPending) {
    return (
      <div className="space-y-3">
        <h1 className="mb-4 text-xl font-bold text-neutral-900">Home</h1>
        <ActivitySkeleton />
        <ActivitySkeleton />
        <ActivitySkeleton />
      </div>
    )
  }

  if (feed.isError) {
    return <ErrorState title="Couldn't load your feed" onRetry={() => void feed.refetch()} />
  }

  if (followingCount.data === 0) {
    return (
      <div>
        <h1 className="mb-4 text-xl font-bold text-neutral-900">Home</h1>
        <EmptyState
          icon={<Rss className="h-6 w-6" />}
          title="Your feed is waiting for friends"
          description="Follow people to see the channels and accounts they share — their new collections and items will show up right here."
          action={
            <Link to="/friends">
              <Button>Find people to follow</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Home</h1>
      <div className="space-y-3">
        {rows.map((a) => (
          <ActivityCard key={a.id} a={a} />
        ))}
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon={<Rss className="h-6 w-6" />}
          title="No activity yet"
          description="The people you follow haven't shared anything yet. Check back soon, or discover something new."
          action={
            <Link to="/discover">
              <Button variant="outline">Explore Discover</Button>
            </Link>
          }
        />
      )}

      <div ref={sentinel} className="h-10" />
      {feed.isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-neutral-400">Loading more…</div>
      )}
    </div>
  )
}

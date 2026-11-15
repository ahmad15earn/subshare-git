import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Compass, Flame, ExternalLink, Search as SearchIcon, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PLATFORM_LABEL } from '../../lib/platform'
import { UserRow } from '../follow/UserRow'
import { CollectionCard } from '../collections/CollectionCard'
import { Tabs } from '../../components/ui/Tabs'
import { Input } from '../../components/ui/Input'
import { PlatformChip } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { RowSkeleton, Skeleton } from '../../components/ui/Skeleton'

type Tab = 'people' | 'collections'

export function DiscoverPage() {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('people')

  // Debounce the search input.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300)
    return () => clearTimeout(t)
  }, [input])

  const searching = q !== ''

  const users = useQuery({
    queryKey: ['search-users', q],
    enabled: searching,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_users', { p_q: q, p_limit: 20 })
      if (error) throw error
      return data
    },
  })

  const collections = useQuery({
    queryKey: ['search-collections', q],
    enabled: searching,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_collections', { p_q: q, p_limit: 20 })
      if (error) throw error
      return data
    },
  })

  const popular = useQuery({
    queryKey: ['discover', 'popular'],
    enabled: !searching,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_popular_items', { p_limit: 10 })
      if (error) throw error
      return data
    },
  })

  const suggested = useQuery({
    queryKey: ['suggested-people'],
    enabled: !searching,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_suggested_people', { p_limit: 5 })
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Discover</h1>

      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          className="pl-10"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search people, @usernames or collections…"
          aria-label="Search"
        />
      </div>

      {searching ? (
        <div>
          <Tabs
            tabs={[
              { value: 'people', label: 'People' },
              { value: 'collections', label: 'Collections' },
            ]}
            value={tab}
            onChange={setTab}
            className="mb-3"
          />

          {tab === 'people' &&
            (users.isPending ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                <RowSkeleton />
                <RowSkeleton />
              </div>
            ) : users.isError ? (
              <ErrorState onRetry={() => void users.refetch()} />
            ) : users.data.length === 0 ? (
              <EmptyState
                icon={<SearchIcon className="h-6 w-6" />}
                title={`No people found for “${q}”`}
                description="Try a different name or username. Usernames are lowercase."
              />
            ) : (
              <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm">
                {users.data.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </div>
            ))}

          {tab === 'collections' &&
            (collections.isPending ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            ) : collections.isError ? (
              <ErrorState onRetry={() => void collections.refetch()} />
            ) : collections.data.length === 0 ? (
              <EmptyState
                icon={<Compass className="h-6 w-6" />}
                title={`No collections found for “${q}”`}
                description="Only public collections and ones shared with you are searchable."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {collections.data.map((c) => (
                  <CollectionCard key={c.id} c={c} />
                ))}
              </div>
            ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* ---------- Popular items ---------- */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <Flame className="h-4 w-4 text-orange-500" />
              Popular items
              <span className="text-xs font-normal text-neutral-400">most shared in public collections</span>
            </h2>
            {popular.isPending ? (
              <RowSkeleton />
            ) : popular.isError ? (
              <ErrorState onRetry={() => void popular.refetch()} />
            ) : popular.data.length === 0 ? (
              <p className="py-3 text-sm text-neutral-400">
                Nothing yet — items appear here once people share public collections.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <ul className="divide-y divide-neutral-100">
                  {popular.data.map((item) => (
                    <li key={`${item.platform}-${item.name}`} className="flex items-center gap-3 px-4 py-3">
                      <PlatformChip platform={item.platform} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>
                        <p className="text-xs text-neutral-400">
                          {PLATFORM_LABEL[item.platform]} · shared by {item.shared_count}{' '}
                          {item.shared_count === 1 ? 'person' : 'people'}
                        </p>
                      </div>
                      <Link
                        to={`/c/${item.sample_collection_id}`}
                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open original"
                        className="shrink-0 rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* ---------- Suggested people ---------- */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <UserPlus className="h-4 w-4 text-primary" />
              Suggested people
            </h2>
            {suggested.isPending ? (
              <RowSkeleton />
            ) : suggested.isError ? (
              <ErrorState onRetry={() => void suggested.refetch()} />
            ) : suggested.data.length === 0 ? (
              <p className="py-3 text-sm text-neutral-400">No suggestions right now.</p>
            ) : (
              <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm">
                {suggested.data.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

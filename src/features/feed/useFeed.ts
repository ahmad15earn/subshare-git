import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { FeedRow } from '../../types/database'

const PAGE_SIZE = 20

/** Home feed: activities from accepted-follow users, cursor paginated. */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: null as { before: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_feed', {
        p_before: pageParam?.before ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: PAGE_SIZE,
      })
      if (error) throw error
      return data as FeedRow[]
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      const last = lastPage.at(-1)
      return last ? { before: last.created_at, id: last.id } : undefined
    },
  })
}

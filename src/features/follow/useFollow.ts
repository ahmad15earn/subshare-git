import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { FollowStatus } from '../../types/database'

/** My relationship (follow status) toward another user. null = not following. */
export function useMyFollowStatus(targetId: string | null) {
  const { user } = useAuth()
  const uid = user?.id ?? null

  return useQuery({
    queryKey: ['follow-status', targetId],
    enabled: targetId !== null && uid !== null && uid !== targetId,
    staleTime: 30_000,
    queryFn: async (): Promise<FollowStatus | null> => {
      const { data, error } = await supabase
        .from('follows')
        .select('status')
        .eq('follower_id', uid!)
        .eq('following_id', targetId!)
        .maybeSingle()
      if (error) throw error
      return data?.status ?? null
    },
  })
}

/** Follow / unfollow / cancel request / accept / decline. */
export function useFollowActions() {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const queryClient = useQueryClient()

  function invalidateAll(targetId?: string) {
    void queryClient.invalidateQueries({ queryKey: ['follow-status', targetId] })
    void queryClient.invalidateQueries({ queryKey: ['profile-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['friends'] })
    void queryClient.invalidateQueries({ queryKey: ['suggested-people'] })
    void queryClient.invalidateQueries({ queryKey: ['search-users'] })
    void queryClient.invalidateQueries({ queryKey: ['profile-activity'] })
  }

  const follow = useMutation({
    mutationFn: async (targetId: string) => {
      if (!uid) throw new Error('You are not signed in.')
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: uid, following_id: targetId })
      if (error) throw error
    },
    onSuccess: (_data, targetId) => invalidateAll(targetId),
  })

  // Unfollow and cancel-request are the same operation: delete my outgoing row.
  const unfollow = useMutation({
    mutationFn: async (targetId: string) => {
      if (!uid) throw new Error('You are not signed in.')
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', uid)
        .eq('following_id', targetId)
      if (error) throw error
    },
    onSuccess: (_data, targetId) => invalidateAll(targetId),
  })

  const accept = useMutation({
    mutationFn: async (followerId: string) => {
      if (!uid) throw new Error('You are not signed in.')
      const { error } = await supabase
        .from('follows')
        .update({ status: 'accepted' })
        .eq('follower_id', followerId)
        .eq('following_id', uid)
      if (error) throw error
    },
    onSuccess: (_data, followerId) => invalidateAll(followerId),
  })

  const decline = useMutation({
    mutationFn: async (followerId: string) => {
      if (!uid) throw new Error('You are not signed in.')
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', uid)
      if (error) throw error
    },
    onSuccess: (_data, followerId) => invalidateAll(followerId),
  })

  return { follow, unfollow, accept, decline }
}

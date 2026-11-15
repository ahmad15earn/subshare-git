import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { Collection, CollectionItemInsert, Visibility } from '../../types/database'

/** My own collections (for "save item to…" pickers and forms). */
export function useMyCollections() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-collections', user?.id],
    enabled: user != null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Collection[]
    },
  })
}

export type CollectionMutationVars = {
  title: string
  description: string | null
  visibility: Visibility
  activity_enabled: boolean
}

export function useCollectionMutations(collectionId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['collection'] })
    void queryClient.invalidateQueries({ queryKey: ['collection-items'] })
    void queryClient.invalidateQueries({ queryKey: ['profile-collections'] })
    void queryClient.invalidateQueries({ queryKey: ['my-collections'] })
    void queryClient.invalidateQueries({ queryKey: ['feed'] })
    void queryClient.invalidateQueries({ queryKey: ['discover'] })
  }

  const create = useMutation({
    mutationFn: async (v: CollectionMutationVars) => {
      const { data, error } = await supabase
        .from('collections')
        .insert({ owner_id: user!.id, ...v })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => invalidate(),
  })

  const update = useMutation({
    mutationFn: async (v: CollectionMutationVars) => {
      const { error } = await supabase.from('collections').update(v).eq('id', collectionId!)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('collections').delete().eq('id', collectionId!)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })

  return { create, update, remove }
}

export function useItemMutations(collectionId: string) {
  const queryClient = useQueryClient()

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['collection-items', collectionId] })
    void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
    void queryClient.invalidateQueries({ queryKey: ['profile-collections'] })
    void queryClient.invalidateQueries({ queryKey: ['feed'] })
    void queryClient.invalidateQueries({ queryKey: ['discover'] })
  }

  const addItem = useMutation({
    mutationFn: async (item: CollectionItemInsert) => {
      const { error } = await supabase.from('collection_items').insert(item)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('collection_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })

  return { addItem, removeItem }
}

/** Follow / unfollow a collection (notifications about new items). */
export function useCollectionFollow(collectionId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: async (follow: boolean) => {
      if (follow) {
        const { error } = await supabase
          .from('collection_followers')
          .insert({ collection_id: collectionId, user_id: user!.id })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('collection_followers')
          .delete()
          .eq('collection_id', collectionId)
          .eq('user_id', user!.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
    },
  })

  return { toggle }
}

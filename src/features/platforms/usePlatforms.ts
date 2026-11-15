import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../../components/ui/Toast'
import type { Platform, PlatformConnectionRow, PlatformImport, Visibility } from '../../types/database'

/** Sanitized connection for the signed-in user (never contains tokens). */
export function useConnections() {
  return useQuery({
    queryKey: ['platform-connections'],
    queryFn: async (): Promise<PlatformConnectionRow[]> => {
      const { data, error } = await supabase.rpc('list_my_connections')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Start OAuth: get the consent-screen URL and navigate the browser to it. */
export function useConnect() {
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (platform: 'youtube') => {
      const { data, error } = await supabase.functions.invoke('platform-oauth-start', {
        body: { platform },
      })
      if (error) throw new Error('Could not start the YouTube connection.')
      const url = (data as { url?: string } | null)?.url
      if (!url) throw new Error('No authorization URL returned — is GOOGLE_CLIENT_ID configured?')
      return url
    },
    onSuccess: (url) => {
      window.location.assign(url)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

export function useDisconnect() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (platform: Platform) => {
      const { error } = await supabase.rpc('disconnect_platform', { p_platform: platform })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform-connections'] })
      void queryClient.invalidateQueries({ queryKey: ['platform-imports'] })
      toast('Disconnected.', 'info')
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

/** On-demand sync: pull your YouTube subscriptions into the import inbox. */
export function useSync() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (platform: 'youtube') => {
      const { data, error } = await supabase.functions.invoke('platform-sync', { body: { platform } })
      if (error) throw new Error('Sync failed — check the connection status or reconnect.')
      return (data ?? { found: 0, pending: 0 }) as { found: number; pending: number }
    },
    onSuccess: ({ found, pending }) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-imports'] })
      void queryClient.invalidateQueries({ queryKey: ['platform-connections'] })
      toast(`Found ${found} channels — ${pending} waiting in the import inbox.`, 'success')
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

/** Mark an inbox row as imported (after saving it to a collection) or dismissed. */
export function useUpdateImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PlatformImport['status'] }) => {
      const { error } = await supabase.from('platform_imports').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform-imports'] })
    },
  })
}

/** Pending YouTube rows — the "import inbox" list. */
export function useImportInbox() {
  return useQuery({
    queryKey: ['platform-imports', 'inbox'],
    queryFn: async (): Promise<PlatformImport[]> => {
      const { data, error } = await supabase
        .from('platform_imports')
        .select('*')
        .eq('status', 'pending')
        .order('discovered_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * One-tap import: create a collection, add every inbox channel to it in a
 * single batch, and mark the inbox rows imported.
 *
 * The collection is briefly created with activity_enabled=false so the
 * per-item triggers (feed activities + friend notifications) stay quiet
 * during the bulk load — friends get the normal "created a collection"
 * update only. Activity is re-enabled afterwards for future adds.
 */
export function useImportAllToCollection() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async ({
      title,
      visibility,
      items,
    }: {
      title: string
      visibility: Visibility
      items: PlatformImport[]
    }) => {
      if (items.length === 0) throw new Error('Nothing to import.')
      if (!user) throw new Error('Not signed in.')

      const { data: created, error: createError } = await supabase
        .from('collections')
        .insert({ owner_id: user.id, title: title.trim(), visibility })
        .select('id')
        .single()
      if (createError) throw createError

      const setActivity = async (enabled: boolean) => {
        const { error } = await supabase
          .from('collections')
          .update({ activity_enabled: enabled })
          .eq('id', created.id)
        if (error) throw error
      }

      // Silence the per-item triggers for the batch load.
      await setActivity(false)
      try {
        const rows = items.map((row) => ({
          collection_id: created.id,
          platform: 'youtube' as Platform,
          external_id: row.external_id,
          name: row.name,
          avatar_url: row.avatar_url,
          url: row.url,
        }))
        for (let i = 0; i < rows.length; i += 100) {
          const { error } = await supabase.from('collection_items').insert(rows.slice(i, i + 100))
          if (error) throw error
        }
        // Mark exactly the rows we just imported (in chunks — .in() lists get big).
        for (let i = 0; i < items.length; i += 100) {
          const { error } = await supabase
            .from('platform_imports')
            .update({ status: 'imported' })
            .in('id', items.slice(i, i + 100).map((row) => row.id))
          if (error) throw error
        }
      } catch (e) {
        // Keep the (partially filled) collection usable even on failure.
        try {
          await setActivity(true)
        } catch {
          // the original error matters more
        }
        throw e
      }
      await setActivity(true)
      return created.id
    },
    onSuccess: (_id, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['my-collections'] })
      void queryClient.invalidateQueries({ queryKey: ['platform-imports'] })
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      toast(`Imported ${variables.items.length} channels into “${variables.title}”.`, 'success')
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
}

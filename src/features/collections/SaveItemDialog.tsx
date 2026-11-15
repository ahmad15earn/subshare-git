import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useMyCollections } from './useCollections'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { PlatformChip } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import type { Platform, Visibility } from '../../types/database'

/** "Save item to my collection": pick one of mine, or create one on the fly. */
export function SaveItemDialog({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  item:
    | {
        platform: Platform
        external_id: string | null
        name: string
        avatar_url: string | null
        url: string
      }
    | null
  /** Optional callback fired after the item was saved (before close). */
  onSaved?: () => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const myCollections = useMyCollections()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newVisibility, setNewVisibility] = useState<Visibility>('public')

  function reset() {
    setSelectedId(null)
    setCreating(false)
    setNewTitle('')
    setNewVisibility('public')
  }

  const insertItem = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('collection_items').insert({
        collection_id: targetId,
        platform: item!.platform,
        external_id: item!.external_id,
        name: item!.name,
        avatar_url: item!.avatar_url,
        url: item!.url,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-items'] })
      void queryClient.invalidateQueries({ queryKey: ['my-collections'] })
    },
  })

  const createCollection = useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('collections')
        .insert({ owner_id: user!.id, title: newTitle.trim(), visibility: newVisibility })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['my-collections'] }),
  })

  if (!item) return null

  async function onSave() {
    try {
      let target = selectedId
      if (creating) {
        if (newTitle.trim() === '') {
          toast('Give the new collection a name.', 'error')
          return
        }
        target = await createCollection.mutateAsync()
      }
      if (!target) {
        toast('Pick a collection first.', 'error')
        return
      }
      const title = creating ? newTitle.trim() : myCollections.data?.find((c) => c.id === target)?.title
      await insertItem.mutateAsync(target)
      onSaved?.()
      toast(`Saved to “${title ?? 'collection'}”.`, 'success')
      reset()
      onClose()
    } catch (e) {
      if (e instanceof Error && (e.message.includes('duplicate') || e.message.includes('unique'))) {
        toast('Already in that collection.', 'error')
      } else {
        toast(e instanceof Error ? e.message : 'Save failed.', 'error')
      }
    }
  }

  const busy = insertItem.isPending || createCollection.isPending

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Save to my collection">
      {myCollections.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (myCollections.data?.length ?? 0) === 0 && !creating ? (
        <EmptyState
          icon={<FolderPlus className="h-6 w-6" />}
          title="No collections yet"
          description="Create your first collection and this item will be its first entry."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              New collection
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-2.5">
            <PlatformChip platform={item.platform} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">{item.name}</span>
          </div>

          {!creating && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {myCollections.data?.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm hover:bg-neutral-50 has-checked:border-primary has-checked:bg-primary-soft/50"
                >
                  <input
                    type="radio"
                    name="target-collection"
                    className="accent-primary"
                    checked={selectedId === c.id}
                    onChange={() => setSelectedId(c.id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{c.title}</span>
                  {c.visibility !== 'public' && (
                    <span className="text-xs text-neutral-400">{c.visibility === 'private' ? 'Private' : 'Shared'}</span>
                  )}
                </label>
              ))}
              <button
                onClick={() => setCreating(true)}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary-soft"
              >
                <FolderPlus className="h-4 w-4" />
                New collection…
              </button>
            </div>
          )}

          {creating && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <Field label="Collection name">
                <Input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Channels I recommend"
                />
              </Field>
              <Field label="Who can see it" hint="You can change this later.">
                <select
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value as Visibility)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="public">Public — anyone on SubShare</option>
                  <option value="selected">Selected — only people I choose</option>
                  <option value="private">Private — only me</option>
                </select>
              </Field>
              <button onClick={() => setCreating(false)} className="text-xs text-neutral-500 hover:text-neutral-800">
                ← Back to my collections
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" loading={busy} disabled={!creating && selectedId === null} onClick={() => void onSave()}>
              Save
            </Button>
            <Button variant="outline" onClick={() => { reset(); onClose() }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

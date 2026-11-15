import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollectionMutations } from './useCollections'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import type { CollectionDetailRow, SharedUser, Visibility } from '../../types/database'

/** Create (/collections/new) or edit (/c/:id/edit) a collection. */
export function CollectionFormPage() {  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [activityEnabled, setActivityEnabled] = useState(true)
  const [shares, setShares] = useState<SharedUser[]>([])
  const [shareInput, setShareInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const existing = useQuery({
    queryKey: ['collection', id],
    enabled: isEdit,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collection', { p_id: id! })
      if (error) throw error
      return (data[0] ?? null) as CollectionDetailRow | null
    },
  })

  // Hydrate the form once loaded (edit mode).
  useEffect(() => {
    const c = existing.data
    if (isEdit && c && !loaded) {
      setTitle(c.title)
      setDescription(c.description ?? '')
      setVisibility(c.visibility)
      setActivityEnabled(c.activity_enabled)
      if (Array.isArray(c.shared_with)) setShares(c.shared_with as unknown as SharedUser[])
      setLoaded(true)
    }
  }, [isEdit, existing.data, loaded])

  const { create, update, remove } = useCollectionMutations(id)

  async function addShare() {
    const uname = shareInput.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setShareInput('')
    if (uname.length < 3) {
      toast('Enter a full username (3+ characters).', 'error')
      return
    }
    if (uname === user?.user_metadata?.['username']) {
      toast("That's you — sharing with yourself isn't needed.", 'info')
      return
    }
    if (shares.some((s) => s.username === uname)) {
      toast('Already on the list.', 'info')
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('username', uname)
      .maybeSingle()
    if (error || !data) {
      toast(`No user found with username @${uname}.`, 'error')
      return
    }
    setShares((prev) => [
      ...prev,
      { user_id: data.id, username: data.username, display_name: data.display_name, avatar_url: data.avatar_url },
    ])
  }

  function removeShare(userId: string) {
    setShares((prev) => prev.filter((s) => s.user_id !== userId))
  }

  const canSave = title.trim() !== ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const vars = {
      title: title.trim(),
      description: description.trim() || null,
      visibility,
      activity_enabled: activityEnabled,
    }
    try {
      if (isEdit) {
        await update.mutateAsync(vars)
        // Sync the share list for edit mode.
        const original = (existing.data && Array.isArray(existing.data.shared_with)
          ? (existing.data.shared_with as unknown as SharedUser[])
          : []
        ).map((s) => s.user_id)
        const toAdd = shares.filter((s) => !original.includes(s.user_id))
        const toRemove = original.filter((uid) => !shares.some((s) => s.user_id === uid))
        if (toAdd.length > 0) {
          const { error } = await supabase
            .from('collection_shares')
            .insert(toAdd.map((s) => ({ collection_id: id!, user_id: s.user_id })))
          if (error) throw error
        }
        if (toRemove.length > 0) {
          const { error } = await supabase
            .from('collection_shares')
            .delete()
            .eq('collection_id', id!)
            .in('user_id', toRemove)
          if (error) throw error
        }
        toast('Collection updated.', 'success')
        navigate(`/c/${id}`)
      } else {
        const newId = await create.mutateAsync(vars)
        if (shares.length > 0) {
          const { error } = await supabase
            .from('collection_shares')
            .insert(shares.map((s) => ({ collection_id: newId, user_id: s.user_id })))
          if (error) throw error
        }
        toast('Collection created! Now add some items.', 'success')
        navigate(`/c/${newId}`)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
    }
  }

  // ---------- Edit guards ----------
  if (isEdit && existing.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (isEdit && (existing.isError || !existing.data)) {
    return (
      <EmptyState
        icon={<Trash2 className="h-6 w-6" />}
        title="Collection not available"
        description="It doesn't exist or you don't have access to it."
      />
    )
  }
  if (isEdit && existing.data && !existing.data.is_owner) {
    return (
      <EmptyState
        icon={<Pencil className="h-6 w-6" />}
        title="Only the owner can edit"
        description={`This collection belongs to @${existing.data.owner_username}.`}
        action={
          <Link to={`/c/${id}`}>
            <Button variant="outline" size="sm">View collection</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 md:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">
        {isEdit ? 'Edit collection' : 'New collection'}
      </h1>

      <form onSubmit={(e) => void onSubmit(e as FormEvent)} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Title">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Startup Channels" maxLength={80} />
          </Field>
          <Field label="Description (optional)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this list about?" maxLength={500} />
          </Field>
        </Card>

        <Card className="space-y-3">
          <Field
            label="Who can see this collection"
            hint={
              visibility === 'public'
                ? 'Anyone on SubShare can open it and it can appear in Discover.'
                : visibility === 'selected'
                  ? 'Only people you add below can open it. They can also follow it.'
                  : 'Only you can open it. Nothing is shared or shown anywhere.'
            }
          >
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="public">Public</option>
              <option value="selected">Selected people</option>
              <option value="private">Only me (private)</option>
            </select>
          </Field>

          {visibility === 'selected' && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-neutral-800">Share with</span>
              <div className="flex gap-2">
                <Input
                  value={shareInput}
                  onChange={(e) => setShareInput(e.target.value)}
                  placeholder="@username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="lowercase"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addShare()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={() => void addShare()}>
                  <UserPlus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {shares.map((s) => (
                  <span key={s.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-0.5 pl-0.5 pr-1.5 text-xs">
                    <Avatar src={s.avatar_url} name={s.display_name} size="sm" className="h-5 w-5 text-[9px]" />
                    @{s.username}
                    <button type="button" onClick={() => removeShare(s.user_id)} className="rounded-full p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600" aria-label={`Remove ${s.username}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {shares.length === 0 && <span className="text-xs text-neutral-400">No one yet — add usernames above.</span>}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 accent-primary" checked={activityEnabled} onChange={(e) => setActivityEnabled(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-neutral-800">Share my activity for this collection</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                When you add items here, friends who follow you see it in their feed and get notified. Turn off for quiet lists.
              </span>
            </span>
          </label>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending || update.isPending} disabled={!canSave} className="flex-1">
            {isEdit ? 'Save changes' : 'Create collection'}
          </Button>
          {isEdit && (
            <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete collection?">
        <p className="text-sm text-neutral-600">
          This collection and all of its items will be deleted permanently.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast('Collection deleted.')
                  navigate('/', { replace: true })
                },
                onError: (e: Error) => toast(e.message, 'error'),
              })
            }
          >
            Delete
          </Button>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}

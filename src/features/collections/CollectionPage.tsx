import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ExternalLink, FolderSearch, Lock, Pencil, Plus, Trash2, UserMinus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCollectionFollow, useCollectionMutations, useItemMutations } from './useCollections'
import { AddItemModal } from './AddItemModal'
import { SaveItemDialog } from './SaveItemDialog'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { VisibilityChip, PlatformChip, UserLink } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { timeAgo } from '../../lib/utils'
import type { CollectionDetailRow, Platform, SharedUser } from '../../types/database'

export function CollectionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [saveTarget, setSaveTarget] = useState<
    | {
        platform: Platform
        external_id: string | null
        name: string
        avatar_url: string | null
        url: string
      }
    | null
  >(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const collection = useQuery({
    queryKey: ['collection', id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collection', { p_id: id })
      if (error) throw error
      return (data[0] ?? null) as CollectionDetailRow | null
    },
  })

  const items = useQuery({
    queryKey: ['collection-items', id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collection_items', { p_collection_id: id })
      if (error) throw error
      return data
    },
  })

  const { toggle: toggleFollow } = useCollectionFollow(id)
  const { removeItem } = useItemMutations(id)
  const { remove } = useCollectionMutations(id)

  // ---------- States ----------
  if (collection.isPending) {
    return (
      <div className="space-y-4">
        <Card>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="mt-2 h-4 w-40" />
          <Skeleton className="mt-4 h-20 w-full" />
        </Card>
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }

  if (collection.isError) {
    return <ErrorState title="Couldn't load this collection" onRetry={() => void collection.refetch()} />
  }

  if (!collection.data) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Collection not available"
        description="This collection doesn't exist, or its owner keeps it private and you don't have access."
        action={
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
        }
      />
    )
  }

  const c = collection.data
  const isOwner = c.is_owner
  const sharedUsers = isOwner && Array.isArray(c.shared_with) ? (c.shared_with as unknown as SharedUser[]) : []

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 md:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* ---------- Header ---------- */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-neutral-900">{c.title}</h1>
            {c.description && <p className="mt-1 text-sm text-neutral-600">{c.description}</p>}
          </div>
          <VisibilityChip visibility={c.visibility} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
          <Link to={`/u/${c.owner_username}`} className="flex items-center gap-1.5">
            <Avatar src={c.owner_avatar_url} name={c.owner_display_name} size="sm" />
            <UserLink username={c.owner_username} displayName={c.owner_display_name} className="text-xs" />
          </Link>
          <span>{c.item_count} {c.item_count === 1 ? 'item' : 'items'}</span>
          <span>Created {timeAgo(c.created_at)}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isOwner ? (
            <>
              <Button size="sm" onClick={() => setAddItemOpen(true)}>
                <Plus className="h-4 w-4" />
                Add item
              </Button>
              <Link to={`/c/${c.id}/edit`}>
                <Button size="sm" variant="outline">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </Link>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant={c.is_following ? 'outline' : 'primary'}
              loading={toggleFollow.isPending}
              onClick={() =>
                toggleFollow.mutate(!c.is_following, {
                  onSuccess: () =>
                    toast(c.is_following ? 'Unfollowed collection.' : 'Following! You\'ll hear about new items.', 'success'),
                  onError: (e: Error) => toast(e.message, 'error'),
                })
              }
            >
              {c.is_following ? 'Following collection' : 'Follow collection'}
            </Button>
          )}
        </div>

        {/* Shared-with list (owner only, selected visibility) */}
        {isOwner && c.visibility === 'selected' && (
          <div className="mt-4 rounded-xl bg-neutral-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
              <Users className="h-3.5 w-3.5" />
              Shared with {sharedUsers.length === 0 ? 'nobody yet — add people in Edit' : `${sharedUsers.length} ${sharedUsers.length === 1 ? 'person' : 'people'}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sharedUsers.map((s) => (
                <span key={s.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-0.5 pl-0.5 pr-2 text-xs">
                  <Avatar src={s.avatar_url} name={s.display_name} size="sm" className="h-5 w-5 text-[9px]" />
                  @{s.username}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------- Items ---------- */}
      {items.isPending ? (
        <>
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </>
      ) : items.isError ? (
        <ErrorState title="Couldn't load items" onRetry={() => void items.refetch()} />
      ) : items.data.length === 0 ? (
        <EmptyState
          icon={<FolderSearch className="h-6 w-6" />}
          title="No items yet"
          description={
            isOwner
              ? 'Paste a channel/account link to add your first item. Try a YouTube channel URL.'
              : `${c.owner_display_name} hasn't added anything here yet.`
          }
          action={
            isOwner ? (
              <Button size="sm" onClick={() => setAddItemOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {items.data.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <PlatformChip platform={item.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {safeHost(item.url)} · added {timeAgo(item.added_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open original"
                    className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  {!isOwner && (
                    <button
                      onClick={() => setSaveTarget(item)}
                      title="Save to my collection"
                      className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                  {isOwner && (
                    <button
                      onClick={() =>
                        removeItem.mutate(item.id, {
                          onSuccess: () => toast('Item removed.'),
                          onError: (e: Error) => toast(e.message, 'error'),
                        })
                      }
                      title="Remove item"
                      className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isOwner && items.data && items.data.length > 0 && (
        <p className="text-center text-xs text-neutral-400">
          Tap + on any item to save it to one of your own collections.
        </p>
      )}

      {/* ---------- Modals ---------- */}
      <AddItemModal open={addItemOpen} onClose={() => setAddItemOpen(false)} collectionId={id} />
      <SaveItemDialog open={saveTarget !== null} item={saveTarget} onClose={() => setSaveTarget(null)} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete collection?">
        <p className="text-sm text-neutral-600">
          “{c.title}” and its {c.item_count} {c.item_count === 1 ? 'item' : 'items'} will be deleted
          permanently. This cannot be undone.
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
                  navigate(`/u/${c.owner_username}`, { replace: true })
                },
                onError: (e: Error) => toast(e.message, 'error'),
              })
            }
          >
            <UserMinus className="h-4 w-4" />
            Delete collection
          </Button>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 30)
  }
}

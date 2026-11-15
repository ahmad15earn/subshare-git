import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { isYouTubeUrl, isValidHttpUrl } from '../../lib/platform'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { PlatformChip } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { useItemMutations } from './useCollections'
import { useToast } from '../../components/ui/Toast'
import type { Platform } from '../../types/database'

interface FetchedMeta {
  platform?: Platform
  name?: string | null
  avatar_url?: string | null
  external_id?: string | null
}

/** Paste a link -> platform auto-detected -> public name/avatar fetched -> save. */
export function AddItemModal({
  open,
  onClose,
  collectionId,
}: {
  open: boolean
  onClose: () => void
  collectionId: string
}) {
  const { addItem } = useItemMutations(collectionId)
  const { toast } = useToast()

  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState<Platform>('other')
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

  function reset() {
    setUrl('')
    setPlatform('other')
    setName('')
    setAvatarUrl(null)
    setExternalId(null)
  }

  function onUrlChange(value: string) {
    setUrl(value)
    if (isValidHttpUrl(value)) setPlatform(isYouTubeUrl(value) ? 'youtube' : 'other')
  }

  async function fetchMeta() {
    if (!isYouTubeUrl(url)) {
      toast('SubShare is YouTube-only — paste a youtube.com or youtu.be link.', 'error')
      return
    }
    setFetching(true)
    try {
      const { data, error } = await supabase.functions.invoke('metadata', { body: { url: url.trim() } })
      if (error) throw new Error('metadata function unavailable')
      const meta = (data as FetchedMeta | null) ?? null
      if (meta?.name) {
        setName(meta.name)
        if (meta.avatar_url) setAvatarUrl(meta.avatar_url)
        if (meta.external_id) setExternalId(meta.external_id)
        if (meta.platform) setPlatform(meta.platform)
        toast('Details fetched — check the name, then save.', 'success')
      } else {
        toast("Couldn't fetch public details for this link — just type the name.", 'info')
      }
    } catch {
      toast('Auto-fetch is unavailable right now — type the name manually. Everything else works.', 'info')
    } finally {
      setFetching(false)
    }
  }

  const canSave = isYouTubeUrl(url) && name.trim() !== ''

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Add a YouTube link"
    >
      <div className="space-y-4">
        <Field
          label="Link"
          hint={
            url && isValidHttpUrl(url) && !isYouTubeUrl(url)
              ? 'SubShare is YouTube-only — paste a youtube.com or youtu.be link.'
              : 'Paste the YouTube channel or video link.'
          }
        >
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/@ycombinator"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
            />
            <Button variant="outline" onClick={() => void fetchMeta()} loading={fetching} disabled={!url.trim()}>
              Fetch
            </Button>
          </div>
        </Field>

        <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2.5">
          {fetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
          ) : (
            <PlatformChip platform={platform} />
          )}
          <span className="flex-1 text-xs text-neutral-500">
            {isYouTubeUrl(url) ? 'Will be saved as YouTube' : 'Waiting for a YouTube link…'}
          </span>
          {avatarUrl && <Avatar src={avatarUrl} name={name || '?'} size="sm" />}
        </div>

        <Field label="Name" hint="Shown to friends. Auto-filled when Fetch succeeds, otherwise type it.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Y Combinator" />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            loading={addItem.isPending}
            disabled={!canSave}
            onClick={() => {
              addItem.mutate(
                {
                  collection_id: collectionId,
                  platform,
                  external_id: externalId,
                  name: name.trim(),
                  avatar_url: avatarUrl,
                  url: url.trim(),
                },
                {
                  onSuccess: () => {
                    toast('Item added!', 'success')
                    reset()
                    onClose()
                  },
                  onError: (e: Error) => {
                    if (e.message.includes('duplicate') || e.message.includes('unique')) {
                      toast('That link is already in this collection.', 'error')
                    } else {
                      toast(e.message, 'error')
                    }
                  },
                },
              )
            }}
          >
            <Search className="h-4 w-4" />
            Add item
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

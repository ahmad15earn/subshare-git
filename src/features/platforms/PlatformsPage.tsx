import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Inbox, Link2, Plus, RefreshCw, X as XIcon, Youtube } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge, PlatformChip } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Field, Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { SaveItemDialog } from '../collections/SaveItemDialog'
import {
  useConnect,
  useConnections,
  useDisconnect,
  useImportAllToCollection,
  useImportInbox,
  useSync,
  useUpdateImport,
} from './usePlatforms'
import type { PlatformConnectionRow, PlatformImport, Visibility } from '../../types/database'

export function PlatformsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const connections = useConnections()
  const inbox = useImportInbox()
  const updateImport = useUpdateImport()
  const importAll = useImportAllToCollection()

  const [saveTarget, setSaveTarget] = useState<PlatformImport | null>(null)
  const [addAllOpen, setAddAllOpen] = useState(false)

  // OAuth round-trip landing: the callback function redirects back here.
  useEffect(() => {
    const connected = searchParams.get('connected')
    const connectError = searchParams.get('connect_error')
    if (connected === null && connectError === null) return
    if (connected !== null) {
      void queryClient.invalidateQueries({ queryKey: ['platform-connections'] })
      toast('YouTube connected — hit “Sync now” to load your subscriptions.', 'success')
    } else {
      toast(`Couldn't finish connecting (${connectError}).`, 'error')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('connected')
    next.delete('connect_error')
    setSearchParams(next, { replace: true })
  }, [searchParams, queryClient, toast, setSearchParams])

  const connection = connections.data?.find((c) => c.platform === 'youtube') ?? null

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-bold text-neutral-900">YouTube</h1>
      <p className="mt-1.5 text-sm text-neutral-500">
        Connect your YouTube account (read-only) to see all the channels you subscribe to — then
        share the ones you love with your friends as collections.
      </p>

      <div className="mt-5">
        <ConnectCard connection={connection} />
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Your subscriptions</h2>
          {(inbox.data?.length ?? 0) > 0 && (
            <Badge className="bg-primary-soft text-primary">{inbox.data?.length} waiting</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Channels found on your account. Only you see this list until you add channels to a
          collection.
        </p>

        {(inbox.data?.length ?? 0) > 0 && (
          <div className="mt-3">
            <Button
              size="sm"
              loading={importAll.isPending}
              onClick={() => setAddAllOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add all to a collection…
            </Button>
          </div>
        )}

        <div className="mt-3">
          {inbox.isPending ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-primary" />
            </div>
          ) : (inbox.data?.length ?? 0) === 0 ? (
            <EmptyState
              className="py-8"
              icon={<Inbox className="h-6 w-6" />}
              title="Nothing waiting"
              description={
                connection !== null
                  ? 'Hit “Sync now” to load your subscriptions here.'
                  : 'Connect your YouTube account and sync — your subscribed channels land here.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {inbox.data?.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-200 px-3 py-2.5"
                >
                  <PlatformChip platform={row.platform} />
                  <Avatar src={row.avatar_url} name={row.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-800">
                      {row.name}
                    </span>
                    <span className="text-xs text-neutral-400">YouTube</span>
                  </div>
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open the channel"
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-primary"
                  >
                    <Link2 className="h-4 w-4" />
                  </a>
                  <Button size="sm" variant="outline" onClick={() => setSaveTarget(row)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                  <button
                    title="Dismiss"
                    className="rounded-lg p-1.5 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600"
                    onClick={() => updateImport.mutate({ id: row.id, status: 'dismissed' })}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <SaveItemDialog
        open={saveTarget !== null}
        onClose={() => setSaveTarget(null)}
        item={
          saveTarget
            ? {
                platform: saveTarget.platform,
                external_id: saveTarget.external_id,
                name: saveTarget.name,
                avatar_url: saveTarget.avatar_url,
                url: saveTarget.url,
              }
            : null
        }
        onSaved={() => {
          if (saveTarget) updateImport.mutate({ id: saveTarget.id, status: 'imported' })
        }}
      />

      <AddAllModal
        open={addAllOpen}
        onClose={() => setAddAllOpen(false)}
        count={inbox.data?.length ?? 0}
        pending={importAll.isPending}
        onConfirm={(title, visibility) => {
          importAll.mutate(
            { title, visibility, items: inbox.data ?? [] },
            { onSettled: () => setAddAllOpen(false) },
          )
        }}
      />
    </div>
  )
}

// ---------- Connect card ----------

function ConnectCard({ connection }: { connection: PlatformConnectionRow | null }) {
  const connect = useConnect()
  const sync = useSync()
  const disconnect = useDisconnect()
  const [confirming, setConfirming] = useState(false)

  const status = connection?.status ?? null
  const needsReconnect = status === 'expired' || status === 'revoked'

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
          <Youtube className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">YouTube</h2>
            {status === null ? (
              <Badge>Not connected</Badge>
            ) : status === 'connected' ? (
              <Badge className="bg-emerald-50 text-emerald-700">Connected</Badge>
            ) : needsReconnect ? (
              <Badge className="bg-amber-50 text-amber-700">Reconnect needed</Badge>
            ) : (
              <Badge className="bg-red-50 text-red-600">Sync error</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Official Google OAuth with the read-only <code>youtube.readonly</code> scope. SubShare
            can list your subscriptions — nothing else, and it never posts on your behalf.
          </p>
          {connection !== null && (
            <p className="mt-1 text-xs text-neutral-400">
              {connection.external_username !== null && connection.external_username !== ''
                ? `Connected as ${connection.external_username} · `
                : ''}
              Last synced {formatWhen(connection.last_synced_at)}
            </p>
          )}
          {connection?.last_sync_error != null && connection.last_sync_error !== '' && (
            <p className="mt-1 text-xs text-red-500">Last sync failed: {connection.last_sync_error}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {connection === null || needsReconnect ? (
              <Button
                size="sm"
                variant={needsReconnect ? 'secondary' : 'primary'}
                loading={connect.isPending}
                onClick={() => connect.mutate('youtube')}
              >
                {needsReconnect ? 'Reconnect' : 'Connect YouTube'}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={sync.isPending}
                  onClick={() => sync.mutate('youtube')}
                >
                  <RefreshCw className="h-4 w-4" />
                  Sync now
                </Button>
                {confirming ? (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={disconnect.isPending}
                      onClick={() => {
                        disconnect.mutate('youtube', { onSettled: () => setConfirming(false) })
                      }}
                    >
                      Confirm disconnect
                    </Button>
                    <button
                      className="text-xs text-neutral-400 hover:text-neutral-700"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="text-xs text-neutral-400 hover:text-red-500"
                    onClick={() => setConfirming(true)}
                  >
                    Disconnect
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ---------- Add-all modal ----------

function AddAllModal({
  open,
  onClose,
  count,
  pending,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  count: number
  pending: boolean
  onConfirm: (title: string, visibility: Visibility) => void
}) {
  const [title, setTitle] = useState('My YouTube channels')
  const [visibility, setVisibility] = useState<Visibility>('public')

  return (
    <Modal open={open} onClose={onClose} title={`Import ${count} channels`}>
      <div className="space-y-4">
        <Field label="Collection name" hint="Friends will see this name.">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Who can see it" hint="You can change this later.">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          >
            <option value="public">Public — anyone on SubShare</option>
            <option value="selected">Selected — only people I choose</option>
            <option value="private">Private — only me</option>
          </select>
        </Field>
        <p className="text-xs text-neutral-500">
          All {count} channels go in as one batch — friends get a single “created a collection”
          update instead of one notification per channel.
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            loading={pending}
            disabled={title.trim() === '' || count === 0}
            onClick={() => onConfirm(title.trim(), visibility)}
          >
            Create & import
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'never'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

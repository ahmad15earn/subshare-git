import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, ShieldCheck, Trash2, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/utils'
import type { NotificationSettings } from '../../types/database'

const NOTIF_LABELS: Array<{ key: keyof Omit<NotificationSettings, 'user_id'>; label: string; description: string }> = [
  { key: 'new_follower', label: 'New follower', description: 'Someone starts following you' },
  { key: 'follow_request', label: 'Follow request', description: 'Someone asks to follow your private account' },
  { key: 'request_accepted', label: 'Request accepted', description: 'Your follow request was accepted' },
  { key: 'new_collection', label: 'New collection', description: 'Someone you follow shares a collection' },
  {
    key: 'new_item_from_followed_user',
    label: 'New items from friends',
    description: 'Someone you follow adds an item to a collection',
  },
  {
    key: 'new_item_in_followed_collection',
    label: 'Items in followed collections',
    description: 'A collection you follow gets a new item',
  },
]

export function SettingsPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const settings = useQuery({
    queryKey: ['notification-settings'],
    enabled: profile != null,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return data as NotificationSettings | null
    },
  })

  function updateProfile(patch: { is_private?: boolean }) {
    return supabase.from('profiles').update(patch).eq('id', profile!.id)
  }

  function updateSetting(key: keyof Omit<NotificationSettings, 'user_id'>, value: boolean) {
    // Row is auto-created at signup; upsert covers very old accounts.
    const row = settings.data
    return supabase.from('notification_settings').upsert({
      ...(row ?? { user_id: profile!.id }),
      [key]: value,
    })
  }

  async function togglePrivacy(isPrivate: boolean) {
    const { error } = await updateProfile({ is_private: isPrivate })
    if (error) {
      toast(error.message, 'error')
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['profile', profile!.id] })
    toast(
      isPrivate
        ? 'Your account is private. New followers must be approved.'
        : 'Your account is public. Anyone can follow you instantly.',
      'success',
    )
  }

  async function toggleNotif(key: keyof Omit<NotificationSettings, 'user_id'>, value: boolean) {
    const { error } = await updateSetting(key, value)
    if (error) {
      toast(error.message, 'error')
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['notification-settings'] })
  }

  async function onSignOut() {
    await signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Settings</h1>

      {/* ---------- Profile ---------- */}
      <Section title="Profile">
        <div className="flex items-center gap-3">
          <Avatar src={profile?.avatar_url} name={profile?.display_name ?? '?'} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900">{profile?.display_name}</p>
            <p className="truncate text-xs text-neutral-500">@{profile?.username}</p>
          </div>
          <Link to={`/u/${profile?.username}/edit`}>
            <Button variant="outline" size="sm">
              <User className="h-4 w-4" />
              Edit
            </Button>
          </Link>
        </div>
      </Section>

      {/* ---------- Privacy ---------- */}
      <Section title="Privacy">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-800">Private account</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              With a private account, people must send a follow request you approve before they can
              see your collections, activity, or follower list.
            </p>
          </div>
          <Toggle
            checked={profile?.is_private ?? false}
            onChange={(v) => void togglePrivacy(v)}
            label="Private account"
          />
        </div>
      </Section>

      {/* ---------- Notification settings ---------- */}
      <Section title="Notifications">
        {settings.isPending ? (
          <p className="text-sm text-neutral-400">Loading preferences…</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {NOTIF_LABELS.map((n) => (
              <div key={n.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-800">{n.label}</p>
                  <p className="text-xs text-neutral-500">{n.description}</p>
                </div>
                <Toggle
                  checked={settings.data ? settings.data[n.key] : true}
                  onChange={(v) => void toggleNotif(n.key, v)}
                  label={n.label}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---------- Account ---------- */}
      <Section title="Account">
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => void onSignOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          <button
            disabled
            title="Available in Phase 3"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-sm font-medium text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            Delete account (coming soon)
          </button>
          <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[11px] text-neutral-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your data stays in your own Supabase project. SubShare never asks for platform passwords.
          </p>
        </div>
      </Section>

      <p className="text-center text-xs text-neutral-400">SubShare v0.1.0 — Phase 1</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <Card>{children}</Card>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-neutral-300',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

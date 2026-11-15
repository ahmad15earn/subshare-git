import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { USERNAME_PATTERN, cn } from '../../lib/utils'
import { uploadAvatar } from '../profile/avatar'
import { Button } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { Avatar } from '../../components/ui/Avatar'
import { Logo } from '../layout/Logo'
import { useAuth } from './AuthContext'
import { useToast } from '../../components/ui/Toast'

/** First-run setup: pick a username (+ display name / bio / avatar). */
export function Onboarding() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [username, setUsername] = useState(profile?.username ?? '')
  const [displayName, setDisplayName] = useState(profile?.display_name ?? user?.user_metadata?.['name'] ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? (user?.user_metadata?.['avatar_url'] as string | null) ?? null)

  const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
  const usernameValid = USERNAME_PATTERN.test(uname)

  const availability = useQuery({
    queryKey: ['username-check', uname, profile?.username ?? null],
    enabled: usernameValid,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', uname)
        .maybeSingle()
      if (error) throw error
      // Same username as this user's own row is fine.
      return data === null || data.username === profile?.username
    },
  })

  const taken = availability.data === false
  const canSubmit = usernameValid && !taken && displayName.trim() !== ''

  const save = useMutation({
    mutationFn: async () => {
      const uid = user!.id
      const { error } = await supabase.from('profiles').upsert({
        id: uid,
        username: uname,
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        onboarded: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', user!.id] })
      toast('Welcome to SubShare! 🎉', 'success')
      navigate('/', { replace: true })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  if (profile?.onboarded) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-5 text-xl font-semibold text-neutral-900">Set up your profile</h1>
          <p className="mt-1.5 text-sm text-neutral-500">Pick a username so friends can find you.</p>
        </div>

        <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }} className="space-y-4">
          <div className="flex justify-center">
            <AvatarPicker url={avatarUrl} name={displayName || '?'} onChange={setAvatarUrl} />
          </div>
          <Field
            label="Username"
            error={username && !usernameValid ? '3–24 characters: a-z, 0-9, _' : null}
            hint={
              usernameValid
                ? availability.isFetching
                  ? 'Checking availability…'
                  : taken
                    ? 'That username is taken.'
                    : 'Available ✓'
                : undefined
            }
          >
            <Input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. ahmad_k"
              autoCapitalize="off"
              autoCorrect="off"
              className="lowercase"
            />
          </Field>
          <Field label="Display name">
            <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ahmad Rahman" />
          </Field>
          <Field label="Bio (optional)">
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do you follow? Films, startups, design…" maxLength={280} />
          </Field>
          <Button type="submit" className="w-full" loading={save.isPending} disabled={!canSubmit}>
            Start using SubShare
          </Button>
        </form>
      </div>
    </div>
  )
}

export function AvatarPicker({
  url,
  name,
  onChange,
  className,
}: {
  url: string | null
  name: string
  onChange: (newUrl: string | null) => void
  className?: string
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast('Image must be under 2 MB.', 'error')
      return
    }
    setUploading(true)
    try {
      const publicUrl = await uploadAvatar(user!.id, file)
      onChange(publicUrl)
      toast('Photo updated.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        className="block cursor-pointer rounded-full transition hover:opacity-80"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label="Change profile photo"
      >
        <Avatar src={url} name={name} size="xl" />
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white">
            Uploading…
          </span>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
    </div>
  )
}

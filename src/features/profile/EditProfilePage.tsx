import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { USERNAME_PATTERN } from '../../lib/utils'
import { useAuth } from '../auth/AuthContext'
import { AvatarPicker } from '../auth/Onboarding'
import { Button } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'

export function EditProfilePage() {
  const { username: routeUsername = '' } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null)

  const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
  const usernameValid = USERNAME_PATTERN.test(uname)
  const isOwnProfile = profile !== null && profile.username === routeUsername

  const availability = useQuery({
    queryKey: ['username-check', uname, profile?.username ?? null],
    enabled: usernameValid && uname !== profile?.username,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', uname)
        .maybeSingle()
      if (error) throw error
      return data === null
    },
  })
  const taken = availability.data === false
  const canSubmit = usernameValid && !taken && displayName.trim() !== ''

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: uname,
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile', user!.id] })
      void queryClient.invalidateQueries({ queryKey: ['profile-by-username'] })
      toast('Profile updated.', 'success')
      navigate(`/u/${uname}`, { replace: true })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Only the owner may edit; someone else's /u/:x/edit redirects.
  // (Kept after all hooks to respect the rules of hooks.)
  if (!isOwnProfile) {
    return <Navigate to={`/u/${routeUsername}`} replace />
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Edit profile</h1>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          save.mutate()
        }}
        className="space-y-4"
      >
        <div className="flex justify-center">
          <AvatarPicker url={avatarUrl} name={displayName || '?'} onChange={setAvatarUrl} />
        </div>
        <Field
          label="Username"
          error={username && !usernameValid ? '3–24 characters: a-z, 0-9, _' : null}
          hint={
            usernameValid
              ? taken
                ? 'That username is taken.'
                : availability.isFetching
                  ? 'Checking availability…'
                  : 'Available ✓'
              : undefined
          }
        >
          <Input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            className="lowercase"
          />
        </Field>
        <Field label="Display name">
          <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Bio" hint="Up to 280 characters.">
          <Textarea value={bio ?? ''} onChange={(e) => setBio(e.target.value)} maxLength={280} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending} disabled={!canSubmit} className="flex-1">
            Save changes
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

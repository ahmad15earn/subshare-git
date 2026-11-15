import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { USERNAME_PATTERN } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { AuthLayout } from './AuthLayout'

export function SignUp() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  // Only lowercase letters, digits and underscore — kept in sync with the DB check.
  const uname = username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
  const usernameValid = USERNAME_PATTERN.test(uname)

  const availability = useQuery({
    queryKey: ['username-check', uname],
    enabled: usernameValid,
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

  const usernameTaken = availability.data === false
  const canSubmit = usernameValid && !usernameTaken && displayName.trim() !== '' && email !== '' && password.length >= 6

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // The DB trigger reads these to create the profile.
        data: { username: uname, display_name: displayName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) {
      toast(error.message, 'error')
      return
    }
    if (data.session) {
      navigate('/', { replace: true })
    } else {
      setAwaitingConfirmation(true)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout title="Check your inbox" subtitle={`We sent a confirmation link to ${email}. Click it to activate your account.`}>
        <Button className="w-full" onClick={() => setAwaitingConfirmation(false)}>
          Back to sign up
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Share the channels and accounts you love.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Username"
          error={username && !usernameValid ? '3–24 characters: a-z, 0-9, _' : null}
          hint={
            usernameValid
              ? availability.isFetching
                ? 'Checking availability…'
                : usernameTaken
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
          <Input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ahmad Rahman"
          />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <Input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <Button type="submit" className="w-full" loading={loading} disabled={!canSubmit}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{' '}
        <Link to="/signin" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

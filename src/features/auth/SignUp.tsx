import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { USERNAME_PATTERN } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { AuthLayout, Divider } from './AuthLayout'

export function SignUp() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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

  async function onGoogle() {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setGoogleLoading(false)
      toast('Google sign-in is not configured yet — use email & password.', 'error')
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Share the channels and accounts you love.">
      <Button variant="outline" className="w-full" onClick={onGoogle} loading={googleLoading}>
        <GoogleIcon />
        Continue with Google
      </Button>

      <Divider label="or sign up with email" />

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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-8.6z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-3.9 3C3.2 21.3 7.3 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z" />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l2.7-2.7C16.9 1.9 14.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.9 3c.9-2.9 3.6-4.9 6.8-4.9z"
      />
    </svg>
  )
}

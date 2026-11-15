import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FullPageLoader } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'

/**
 * Landing route for OAuth + email confirmation links.
 * supabase-js also auto-detects the auth code in the URL, so this handler
 * additionally performs the PKCE exchange and then routes the user onward.
 */
export function AuthCallback() {
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const url = new URL(window.location.href)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const errorDescription =
        url.searchParams.get('error_description') ?? hash.get('error_description')

      const code = url.searchParams.get('code')
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href)
        } catch {
          // Code already consumed by detectSessionInUrl — ignore and check below.
        }
      }

      // Give detectSessionInUrl a moment to settle in implicit/token flows.
      await new Promise((r) => setTimeout(r, 600))
      if (cancelled) return

      const { data } = await supabase.auth.getSession()
      if (cancelled) return

      if (errorDescription) toast(errorDescription, 'error')
      navigate(data.session ? '/' : '/signin', { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [navigate, toast])

  return <FullPageLoader label="Signing you in…" />
}

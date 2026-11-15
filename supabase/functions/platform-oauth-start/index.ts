// ============================================================
// SubShare — Edge Function: platform-oauth-start
//
// POST { platform: 'youtube' }
// -> { url }  (Google's consent screen; the app redirects the
//    browser there with window.location.assign)
//
// Requires a logged-in Supabase user. Builds an HMAC-signed state
// (see _shared/crypto.ts) so the callback can prove the round-trip
// was started by this function for this user.
// SubShare connects YouTube only.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'
import { signState } from '../_shared/crypto.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let platform = ''
  try {
    platform = String((await req.json())?.platform ?? '')
  } catch {
    return json({ error: 'Body must be JSON: { "platform": "youtube" }' }, 400)
  }
  if (platform !== 'youtube') {
    return json({ error: 'Unsupported platform — SubShare connects YouTube only.' }, 400)
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  if (!clientId) {
    return json({ error: 'YouTube OAuth is not configured yet — set GOOGLE_CLIENT_ID in your Supabase secrets.' }, 500)
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
  const redirectUri = `${supabaseUrl}/functions/v1/platform-oauth-callback`

  // Where the callback should send the browser back to: the app origin of
  // the caller (falls back to the APP_URL secret, e.g. for server-side tests).
  const returnTo = req.headers.get('origin') ?? Deno.env.get('APP_URL') ?? ''
  if (!/^https?:\/\//i.test(returnTo)) {
    return json({ error: 'Could not determine the app origin for the redirect back.' }, 500)
  }

  const state = await signState({ uid: user.id, platform, returnTo, nonce: crypto.randomUUID() })

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  // Read-only: SubShare can list subscriptions, nothing else.
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.readonly')
  url.searchParams.set('state', state)
  // access_type=offline + prompt=consent -> a refresh token is issued.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return json({ url: url.toString() })
})

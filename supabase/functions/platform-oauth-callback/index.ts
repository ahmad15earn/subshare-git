// ============================================================
// SubShare — Edge Function: platform-oauth-callback
//
// GET /functions/v1/platform-oauth-callback?code=…&state=…
// (this is the redirect_uri registered in the Google Cloud console)
//
// 1. Verifies the HMAC-signed state (proves *we* started this flow).
// 2. Exchanges the code for tokens.
// 3. Fetches the user's YouTube channel identity.
// 4. Encrypts the tokens (AES-GCM) and upserts platform_connections.
// 5. 302 back to the app: /platforms?connected=youtube or
//    /platforms?connect_error=<reason>.
//
// NOTE: deploy this function with verify_jwt = false (see config.toml) —
// Google's redirect carries no Supabase JWT.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptText, verifyState, type OAuthState } from '../_shared/crypto.ts'

/** 302 the browser back to the app's /platforms page with a result param. */
function backRedirect(state: OAuthState | null, params: Record<string, string>): Response {
  const base = state?.returnTo ?? Deno.env.get('APP_URL') ?? ''
  if (!/^https?:\/\//i.test(base)) {
    return new Response('Connected, but the app URL is unknown — set the APP_URL secret.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
  const url = new URL('/platforms', base)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

interface YtChannelsResponse {
  items?: Array<{ id?: string; snippet?: { title?: string } }>
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const state = await verifyState(url.searchParams.get('state'))

  if (!state || state.platform !== 'youtube') {
    return backRedirect(state, { connect_error: 'invalid_state' })
  }

  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    return backRedirect(state, { connect_error: oauthError === 'access_denied' ? 'cancelled' : oauthError })
  }

  const code = url.searchParams.get('code')
  if (!code) return backRedirect(state, { connect_error: 'missing_code' })

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
  const redirectUri = `${supabaseUrl}/functions/v1/platform-oauth-callback`
  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const token = (await res.json()) as GoogleTokenResponse
    if (!token.access_token) throw new Error(token.error ?? 'token_exchange_failed')
    const accessToken = token.access_token

    // Identity: the user's own channel (nice "Connected as …" label).
    let externalAccountId: string | null = null
    let externalUsername: string | null = null
    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (chRes.ok) {
      const data = (await chRes.json()) as YtChannelsResponse
      const channel = data.items?.[0]
      externalAccountId = channel?.id ?? null
      externalUsername = channel?.snippet?.title ?? null
    }

    // If Google didn't issue a new refresh token (it only sends one on first
    // consent), keep the previously stored one.
    const { data: existing } = await service
      .from('platform_connections')
      .select('refresh_token')
      .eq('user_id', state.uid)
      .eq('platform', 'youtube')
      .maybeSingle()

    const row = {
      user_id: state.uid,
      platform: 'youtube',
      access_token: await encryptText(accessToken),
      refresh_token: token.refresh_token
        ? await encryptText(token.refresh_token)
        : (existing?.refresh_token ?? null),
      token_expires_at: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: token.scope ? token.scope.split(/[ +]/).filter(Boolean) : [],
      status: 'connected',
      external_account_id: externalAccountId,
      external_username: externalUsername,
      last_sync_error: null,
    }

    const { error: upsertError } = await service
      .from('platform_connections')
      .upsert(row, { onConflict: 'user_id,platform' })
    if (upsertError) throw new Error(upsertError.message)

    return backRedirect(state, { connected: 'youtube' })
  } catch (e) {
    return backRedirect(state, {
      connect_error: e instanceof Error ? e.message.slice(0, 80) : 'exchange_failed',
    })
  }
})

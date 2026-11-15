// ============================================================
// SubShare — Edge Function: platform-sync
//
// POST { platform: 'youtube' } -> { found, pending }
//
// On-demand sync (user clicks "Sync now"):
// 1. Loads the user's encrypted connection (service role).
// 2. Refreshes the Google access token when it has expired.
// 3. Runs the YouTube adapter (the user's channel subscriptions).
// 4. Upserts results into platform_imports (the import inbox). Existing
//    rows keep their status — an imported account is never re-pended.
// 5. Updates last_synced_at / status and returns counts.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'
import { decryptText, encryptText } from '../_shared/crypto.ts'
import { getAdapter } from '../_shared/adapters.ts'

interface GoogleRefreshResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const userSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const {
    data: { user },
  } = await userSupabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let platform = ''
  try {
    platform = String((await req.json())?.platform ?? '')
  } catch {
    return json({ error: 'Body must be JSON: { "platform": "youtube" }' }, 400)
  }
  const adapter = getAdapter(platform)
  if (!adapter) return json({ error: 'Unsupported platform' }, 400)

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: conn } = await service
    .from('platform_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .maybeSingle()
  if (!conn) return json({ error: 'not_connected' }, 404)
  if (conn.status === 'revoked') return json({ error: 'reconnect_required' }, 409)

  /** Persist the failure on the connection, then tell the client. */
  const fail = async (message: string, status: 'expired' | 'error'): Promise<Response> => {
    await service
      .from('platform_connections')
      .update({ status, last_sync_error: message })
      .eq('id', conn.id)
    return json({ error: message }, 502)
  }

  try {
    let accessToken = await decryptText(conn.access_token)

    if (platform === 'youtube') {
      const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0
      if (Number.isFinite(expiresAt) && Date.now() > expiresAt - 60_000) {
        const refreshToken = conn.refresh_token ? await decryptText(conn.refresh_token) : null
        if (!refreshToken) return await fail('reconnect_required', 'expired')

        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
            client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
          }),
        })
        const token = (await res.json()) as GoogleRefreshResponse
        if (!token.access_token) return await fail('reconnect_required', 'expired')

        accessToken = token.access_token
        await service
          .from('platform_connections')
          .update({
            access_token: await encryptText(accessToken),
            refresh_token: token.refresh_token ? await encryptText(token.refresh_token) : conn.refresh_token,
            token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
            last_sync_error: null,
          })
          .eq('id', conn.id)
      }
    }

    const accounts = await adapter.fetchAccounts(accessToken)

    // Fill the import inbox. ignoreDuplicates keeps existing rows (and their
    // imported/dismissed status) exactly as they are.
    for (let i = 0; i < accounts.length; i += 200) {
      const rows = accounts.slice(i, i + 200).map((account) => ({
        user_id: user.id,
        platform,
        external_id: account.external_id,
        name: account.name,
        avatar_url: account.avatar_url,
        url: account.url,
      }))
      if (rows.length === 0) continue
      const { error: upsertError } = await service
        .from('platform_imports')
        .upsert(rows, { onConflict: 'user_id,platform,url', ignoreDuplicates: true })
      if (upsertError) throw new Error(upsertError.message)
    }

    await service
      .from('platform_connections')
      .update({ status: 'connected', last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('id', conn.id)

    const { count } = await service
      .from('platform_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('status', 'pending')

    return json({ found: accounts.length, pending: count ?? 0 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed'
    // Upstream 401/403 means the token is bad -> ask the user to reconnect.
    return await fail(message, /upstream (401|403)/.test(message) ? 'expired' : 'error')
  }
})

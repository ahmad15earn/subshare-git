// ============================================================
// SubShare — Edge Function: metadata
//
// POST { url } -> { platform, name, avatar_url, external_id }
//
// YouTube-only public metadata proxy:
// - video links (watch?v=, youtu.be/…, shorts, live, embed)
//     -> public oEmbed (no key needed): title + thumbnail
// - channel links (/channel/UC…, /@handle)
//     -> YouTube Data API v3 channels.list, using the optional
//        YOUTUBE_API_KEY secret (a plain API key, no OAuth). Without it,
//        channel links return nulls and the client asks for a name.
//
// Anything else returns nulls — the client falls back to manual entry.
// Requires a logged-in Supabase user (Authorization header, sent
// automatically by supabase-js functions.invoke).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FETCH_TIMEOUT_MS = 8000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Fetch JSON with a timeout; any failure resolves to null (graceful). */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function isYouTubeHost(host: string): boolean {
  host = host.replace(/^www\.|^m\.|^music\./, '').toLowerCase()
  return host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)
}

type YouTubeTarget =
  | { kind: 'video'; id: string }
  | { kind: 'channel'; id: string | null; handle: string | null }

/** Classify a YouTube URL into a video or a channel target (null = neither). */
function classify(url: URL): YouTubeTarget | null {
  const parts = url.pathname.split('/').filter(Boolean)

  // Videos: ?v=, youtu.be/<id>, /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const v = url.searchParams.get('v')
  if (v) return { kind: 'video', id: v }
  if (url.hostname === 'youtu.be' && parts[0]) return { kind: 'video', id: parts[0] }
  const special = ['shorts', 'embed', 'live', 'v']
  const idx = parts.findIndex((p) => special.includes(p))
  if (idx !== -1 && parts[idx + 1]) return { kind: 'video', id: parts[idx + 1] }

  // Channels: /channel/UC…, /@handle
  const channelIdx = parts.findIndex((p) => p === 'channel')
  if (channelIdx !== -1 && parts[channelIdx + 1]) {
    return { kind: 'channel', id: parts[channelIdx + 1], handle: null }
  }
  const handlePart = parts.find((p) => p.startsWith('@'))
  if (handlePart) return { kind: 'channel', id: null, handle: handlePart.slice(1) }

  return null
}

interface OEmbed {
  title?: string
  thumbnail_url?: string
}

interface YtChannelsResponse {
  items?: Array<{
    id?: string
    snippet?: { title?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } }
  }>
}

async function fetchMetadata(target: YouTubeTarget): Promise<{
  name: string | null
  avatar_url: string | null
  external_id: string | null
}> {
  if (target.kind === 'video') {
    const data = await fetchJson<OEmbed>(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${target.id}`,
      )}&format=json`,
    )
    return {
      name: data?.title ?? null,
      avatar_url: data?.thumbnail_url ?? null,
      external_id: target.id,
    }
  }

  // Channel: /channel/UC… needs no key for the id, but the title/avatar do.
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) {
    return { name: null, avatar_url: null, external_id: target.id }
  }
  const params = new URLSearchParams({ part: 'snippet', key: apiKey })
  if (target.id) params.set('id', target.id)
  else if (target.handle) params.set('forHandle', `@${target.handle}`)
  else return { name: null, avatar_url: null, external_id: null }

  const data = await fetchJson<YtChannelsResponse>(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
  )
  const channel = data?.items?.[0]
  return {
    name: channel?.snippet?.title ?? null,
    avatar_url: channel?.snippet?.thumbnails?.medium?.url ?? channel?.snippet?.thumbnails?.default?.url ?? null,
    external_id: channel?.id ?? target.id,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ---- Auth: require a logged-in Supabase user ----
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  // ---- Body: { url } ----
  let parsed: URL
  try {
    const body = await req.json()
    parsed = new URL(String(body?.url ?? ''))
  } catch {
    return json({ error: 'Body must be JSON: { "url": "https://…" }' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ error: 'Only http(s) URLs are supported' }, 400)
  }

  if (!isYouTubeHost(parsed.hostname)) {
    // SubShare is YouTube-only: unknown links get nulls everywhere.
    return json({ platform: null, name: null, avatar_url: null, external_id: null })
  }

  const target = classify(parsed)
  if (!target) {
    return json({ platform: 'youtube', name: null, avatar_url: null, external_id: null })
  }

  const meta = await fetchMetadata(target)
  return json({ platform: 'youtube', ...meta })
})

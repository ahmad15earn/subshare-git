// Shared platform adapters for SubShare Edge Functions.
// SubShare is YouTube-only: this adapter fetches the channels a user is
// subscribed to with a valid Google (youtube.readonly) access token.
// The PlatformAdapter interface stays as the extension point if a second
// platform is ever added.

export interface DiscoveredAccount {
  /** Display name: channel title. */
  name: string
  /** Canonical link for the account. */
  url: string
  /** Platform-native id, when available. */
  external_id: string | null
  avatar_url: string | null
}

export interface PlatformAdapter {
  fetchAccounts(accessToken: string): Promise<DiscoveredAccount[]>
}

const FETCH_TIMEOUT_MS = 10_000

async function getJson(url: string, accessToken: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res.json()
}

// ---------- YouTube: the user's channel subscriptions ----------
interface YtSubscriptionList {
  items?: Array<{
    snippet?: {
      title?: string
      resourceId?: { channelId?: string }
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } }
    }
  }>
  nextPageToken?: string
}

export const youtubeAdapter: PlatformAdapter = {
  async fetchAccounts(accessToken) {
    const accounts: DiscoveredAccount[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 20; page++) {
      // 20 pages x 50 = up to 1000 subscriptions per sync.
      const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions')
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('mine', 'true')
      url.searchParams.set('maxResults', '50')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const data = (await getJson(url.toString(), accessToken)) as YtSubscriptionList
      for (const item of data.items ?? []) {
        const channelId = item.snippet?.resourceId?.channelId
        if (!channelId) continue
        accounts.push({
          name: (item.snippet?.title ?? 'Untitled channel').slice(0, 120),
          url: `https://www.youtube.com/channel/${channelId}`,
          external_id: channelId,
          avatar_url: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? null,
        })
      }
      pageToken = data.nextPageToken
      if (pageToken === undefined) break
    }
    return accounts
  },
}

export function getAdapter(platform: string): PlatformAdapter | null {
  if (platform === 'youtube') return youtubeAdapter
  return null
}

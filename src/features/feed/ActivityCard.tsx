import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { PlatformChip, UserLink } from '../../components/ui/Badge'
import { timeAgo } from '../../lib/utils'
import { detectPlatform, PLATFORM_LABEL } from '../../lib/platform'
import type { FeedRow } from '../../types/database'

function bold(text: string | null | undefined) {
  return text ? <span className="font-semibold text-neutral-900">{text}</span> : null
}

/** One activity entry in the home feed or a profile's activity tab. */
export function ActivityCard({ a }: { a: FeedRow }) {
  const meta = (a.metadata ?? {}) as Record<string, unknown>
  const platformLabel = a.item_platform ? PLATFORM_LABEL[a.item_platform] : null

  return (
    <Card className="transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <Link to={`/u/${a.actor_username}`}>
          <Avatar src={a.actor_avatar_url} name={a.actor_display_name} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <UserLink username={a.actor_username} displayName={a.actor_display_name} />
            <span className="text-xs text-neutral-400">{timeAgo(a.created_at)}</span>
          </div>
          <p className="mt-0.5 text-sm text-neutral-600">
            {a.type === 'item_added' && (
              <>
                added {bold(a.item_name ?? (meta['item_name'] as string))}
                {a.collection_title && (
                  <>
                    {' '}to{' '}
                    <Link to={`/c/${a.collection_id}`} className="font-semibold text-primary hover:underline">
                      {a.collection_title}
                    </Link>
                  </>
                )}
              </>
            )}
            {a.type === 'collection_created' && (
              <>
                shared a new collection{' '}
                {a.collection_id ? (
                  <Link to={`/c/${a.collection_id}`} className="font-semibold text-primary hover:underline">
                    {(meta['title'] as string) ?? a.collection_title}
                  </Link>
                ) : (
                  bold((meta['title'] as string) ?? a.collection_title)
                )}
              </>
            )}
            {a.type === 'platform_connected' && <>connected {bold((meta['platform'] as string) ?? '')} to SubShare</>}
            {a.type === 'followed_account' && <>started following {bold((meta['name'] as string) ?? '')}</>}
          </p>
        </div>
      </div>

      {(a.item_name || a.item_url) && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-2.5">
          {a.item_platform && <PlatformChip platform={a.item_platform} />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
            {a.item_name ?? 'Item'}
          </span>
          {a.item_url && (
            <a
              href={a.item_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
              title={`Open on ${platformLabel ?? detectPlatform(a.item_url)}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          )}
        </div>
      )}
    </Card>
  )
}

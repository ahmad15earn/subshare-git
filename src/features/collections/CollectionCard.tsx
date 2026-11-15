import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge, VisibilityChip } from '../../components/ui/Badge'
import { UserLink } from '../../components/ui/Badge'
import { timeAgo } from '../../lib/utils'

interface CardData {
  id: string
  title: string
  description?: string | null
  visibility: 'public' | 'private' | 'selected'
  item_count: number
  is_following?: boolean
  created_at?: string
  owner_username?: string
}

/** Compact card for a collection, used on profiles, discover and search. */
export function CollectionCard({ c }: { c: CardData }) {
  return (
    <Link to={`/c/${c.id}`} className="block" aria-label={c.title}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{c.title}</h3>
          <VisibilityChip visibility={c.visibility} />
        </div>
        {c.description && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{c.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {c.item_count} {c.item_count === 1 ? 'item' : 'items'}
          </span>
          {c.owner_username && (
            <span>
              by <UserLink username={c.owner_username} displayName={`@${c.owner_username}`} className="text-xs" />
            </span>
          )}
          {c.is_following && <Badge className="bg-primary-soft text-primary">Following</Badge>}
          {c.created_at && <span className="ml-auto">{timeAgo(c.created_at)}</span>}
        </div>
      </Card>
    </Link>
  )
}

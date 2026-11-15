import { Link } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { FollowButton } from './FollowButton'
import type { FollowStatus } from '../../types/database'

export interface UserRowUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio?: string | null
  is_private?: boolean
  follow_status?: FollowStatus | null
  follows_me?: boolean
  reason?: string
}

/** One person in a list (friends, requests, search results, suggestions). */
export function UserRow({ user, trailing }: { user: UserRowUser; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Link to={`/u/${user.username}`} className="shrink-0" aria-label={user.display_name}>
        <Avatar src={user.avatar_url} name={user.display_name} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={`/u/${user.username}`}
          className="block truncate text-sm font-semibold text-neutral-900 hover:text-primary"
        >
          {user.display_name}
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs text-neutral-500">@{user.username}</span>
          {user.is_private && (
            <span className="shrink-0 text-[10px] text-neutral-400" title="Private account">
              🔒
            </span>
          )}
          {user.follows_me && <Badge>Follows you</Badge>}
          {user.reason && !user.follows_me && <Badge>{user.reason}</Badge>}
        </div>
        {user.bio && <p className="mt-0.5 truncate text-xs text-neutral-500">{user.bio}</p>}
      </div>
      {trailing ?? <FollowButton targetId={user.id} targetIsPrivate={user.is_private === true} size="sm" />}
    </div>
  )
}

import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useFollowActions, useMyFollowStatus } from './useFollow'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/utils'

/**
 * The single control for a follow relationship:
 * Follow -> (private? "Requested") -> Following -> unfollow.
 */
export function FollowButton({
  targetId,
  targetIsPrivate = false,
  size = 'md',
  className,
}: {
  targetId: string
  targetIsPrivate?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const { data: status } = useMyFollowStatus(user && user.id !== targetId ? targetId : null)
  const { follow, unfollow } = useFollowActions()
  const [busy, setBusy] = useState(false)

  // Never shown on your own profile or when signed out.
  if (!user || user.id === targetId) return null

  const isPending = status === 'pending'
  const isFollowing = status === 'accepted'

  async function onToggle() {
    setBusy(true)
    try {
      if (isFollowing) {
        await unfollow.mutateAsync(targetId)
        toast('Unfollowed.')
      } else if (isPending) {
        await unfollow.mutateAsync(targetId)
        toast('Request cancelled.')
      } else {
        await follow.mutateAsync(targetId)
        toast(targetIsPrivate ? 'Follow request sent.' : 'Following!')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size={size}
      variant={isFollowing || isPending ? 'outline' : 'primary'}
      loading={busy}
      onClick={onToggle}
      className={cn('min-w-28 shrink-0', className)}
    >
      {isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow'}
    </Button>
  )
}

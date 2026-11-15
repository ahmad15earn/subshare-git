import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Visibility } from '../../types/database'
import { cn } from '../../lib/utils'

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-neutral-100 text-neutral-600',
        className,
      )}
    >
      {children}
    </span>
  )
}

const visibilityStyles: Record<Visibility, string> = {
  public: 'bg-emerald-50 text-emerald-700',
  private: 'bg-neutral-100 text-neutral-500',
  selected: 'bg-primary-soft text-primary',
}

const visibilityLabel: Record<Visibility, string> = {
  public: 'Public',
  private: 'Private',
  selected: 'Shared',
}

export function VisibilityChip({ visibility }: { visibility: Visibility }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        visibilityStyles[visibility],
      )}
    >
      {visibilityLabel[visibility]}
    </span>
  )
}

/** Small square tile showing the platform's first letter, colored per platform. */
export function PlatformChip({ platform }: { platform: string }) {
  const styles: Record<string, string> = {
    youtube: 'bg-red-100 text-red-600',
    instagram: 'bg-pink-100 text-pink-600',
    github: 'bg-neutral-200 text-neutral-800',
    spotify: 'bg-green-100 text-green-700',
    x: 'bg-neutral-900 text-white',
    tiktok: 'bg-neutral-100 text-neutral-900',
    other: 'bg-blue-50 text-primary',
  }
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-bold uppercase',
        styles[platform] ?? styles.other,
      )}
    >
      {platform === 'other' ? '•' : platform.slice(0, 2)}
    </span>
  )
}

export function UserLink({
  username,
  displayName,
  className,
}: {
  username: string
  displayName: string
  className?: string
}) {
  return (
    <Link
      to={`/u/${username}`}
      className={cn('font-medium text-neutral-900 hover:text-primary hover:underline', className)}
    >
      {displayName}
    </Link>
  )
}

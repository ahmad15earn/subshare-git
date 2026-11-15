import { cn } from '../../lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-neutral-200/80', className)} />
}

/** Row skeleton used by feeds / lists while loading. */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-1 py-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  )
}

/** Feed card skeleton. */
export function ActivitySkeleton() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="mt-3 h-4 w-3/4" />
    </div>
  )
}

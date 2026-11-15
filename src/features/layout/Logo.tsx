import { cn } from '../../lib/utils'

export function Logo({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 64 64"
        className={size === 'lg' ? 'h-12 w-12' : 'h-8 w-8'}
        aria-hidden
      >
        <rect width="64" height="64" rx="14" fill="#2563eb" />
        <g fill="#ffffff">
          <circle cx="20" cy="19" r="6" />
          <circle cx="46" cy="13" r="6" />
          <circle cx="34" cy="48" r="6" />
        </g>
        <g stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.9">
          <path d="M25 22l16-7" />
          <path d="M22 24l10 19" />
          <path d="M44 18l-8 25" />
        </g>
      </svg>
      <span className={cn('font-bold tracking-tight text-neutral-900', size === 'lg' ? 'text-2xl' : 'text-lg')}>
        SubShare
      </span>
    </span>
  )
}

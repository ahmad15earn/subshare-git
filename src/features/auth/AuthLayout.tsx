import type { ReactNode } from 'react'
import { Logo } from '../layout/Logo'

/** Shared shell for the sign-in / sign-up screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-5 text-xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-1.5 text-sm text-neutral-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-neutral-200" />
      <span className="text-xs uppercase tracking-wide text-neutral-400">{label}</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  )
}

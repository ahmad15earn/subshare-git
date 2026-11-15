import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Compass className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-neutral-900">Page not found</h1>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
        The page you're looking for doesn't exist or may have been removed.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
      >
        Go home
      </Link>
    </div>
  )
}

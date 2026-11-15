import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { FullPageLoader } from '../../components/ui/Spinner'
import { useAuth } from './AuthContext'

/** Blocks signed-in users from the auth screens. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <FullPageLoader />
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

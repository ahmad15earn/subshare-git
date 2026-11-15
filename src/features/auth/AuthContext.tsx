import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FullPageLoader } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True once the profile query has finished for the current session. */
  profileReady: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null

  const profileQuery = useQuery({
    queryKey: ['profile', uid],
    enabled: uid !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      profileReady: profileQuery.isSuccess,
      loading: authLoading || (uid !== null && !profileQuery.isSuccess),
      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
      },
    }),
    [session, authLoading, uid, profileQuery.data, profileQuery.isSuccess, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Redirects signed-out users to /signin (remembering where they wanted to go). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

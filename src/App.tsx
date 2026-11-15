import { Navigate, Route, Routes, Outlet } from 'react-router-dom'
import { FullPageLoader } from './components/ui/Spinner'
import { AppShell } from './features/layout/AppShell'
import { RequireAuth, useAuth } from './features/auth/AuthContext'
import { GuestOnly } from './features/auth/guards'
import { SignIn } from './features/auth/SignIn'
import { SignUp } from './features/auth/SignUp'
import { AuthCallback } from './features/auth/AuthCallback'
import { Onboarding } from './features/auth/Onboarding'
import { HomePage } from './features/feed/HomePage'
import { DiscoverPage } from './features/discover/DiscoverPage'
import { FriendsPage } from './features/follow/FriendsPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { EditProfilePage } from './features/profile/EditProfilePage'
import { CollectionPage } from './features/collections/CollectionPage'
import { CollectionFormPage } from './features/collections/CollectionFormPage'
import { PlatformsPage } from './features/platforms/PlatformsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { NotFound } from './features/layout/NotFound'

/**
 * Second gate after the session gate: users without a profile row (or who
 * haven't finished first-run setup) are pushed to /onboarding.
 */
function ProfileGate() {
  const { profile, profileReady } = useAuth()
  if (!profileReady) return <FullPageLoader />
  if (!profile || !profile.onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/signin"
        element={
          <GuestOnly>
            <SignIn />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <SignUp />
          </GuestOnly>
        }
      />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <ProfileGate />
          </RequireAuth>
        }
      >
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="u/:username" element={<ProfilePage />} />
          <Route path="u/:username/edit" element={<EditProfilePage />} />
          <Route path="collections/new" element={<CollectionFormPage />} />
          <Route path="c/:id" element={<CollectionPage />} />
          <Route path="c/:id/edit" element={<CollectionFormPage />} />
          <Route path="platforms" element={<PlatformsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}

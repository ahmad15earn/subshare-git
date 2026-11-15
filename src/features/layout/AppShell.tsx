import { Link, NavLink, Outlet } from 'react-router-dom'
import { Bell, Compass, Home, Plus, Settings, Share2, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useNotificationsRealtime, useUnreadCount } from '../notifications/useNotifications'
import { Avatar } from '../../components/ui/Avatar'
import { Logo } from './Logo'
import { cn } from '../../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  showBadge?: boolean
}

const DESKTOP_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/notifications', label: 'Notifications', icon: Bell, showBadge: true },
  { to: '/platforms', label: 'Platforms', icon: Share2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const { profile, user } = useAuth()
  const uid = user?.id ?? null
  useNotificationsRealtime(uid)
  const { data: unread = 0 } = useUnreadCount(uid !== null)

  const profileHref = profile ? `/u/${profile.username}` : '/settings'

  return (
    <div className="min-h-dvh">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-neutral-200 bg-white px-3 py-5 md:flex">
        <Link to="/" className="mb-6 px-2" aria-label="SubShare home">
          <Logo />
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {DESKTOP_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-soft text-primary' : 'text-neutral-600 hover:bg-neutral-100',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
              {item.showBadge && unread > 0 && (
                <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/collections/new"
          className="mb-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" />
          New collection
        </Link>

        <Link
          to={profileHref}
          className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-neutral-100"
        >
          <Avatar src={profile?.avatar_url} name={profile?.display_name ?? 'Me'} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-neutral-900">
              {profile?.display_name ?? 'My profile'}
            </span>
            <span className="block truncate text-xs text-neutral-500">
              @{profile?.username ?? 'me'}
            </span>
          </span>
        </Link>
      </aside>

      {/* ---------- Mobile top bar ---------- */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/" aria-label="SubShare home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <Link
            to="/collections/new"
            aria-label="New collection"
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
          >
            <Plus className="h-5 w-5" />
          </Link>
          <Link
            to="/settings"
            aria-label="Settings"
            className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* ---------- Content ---------- */}
      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5 md:pb-12 md:pt-8">
          <Outlet />
        </div>
      </main>

      {/* ---------- Mobile bottom tabs ---------- */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-neutral-200 bg-white md:hidden">
        {DESKTOP_NAV.filter((i) => i.to !== '/platforms' && i.to !== '/settings').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-neutral-500',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {item.showBadge && unread > 0 && (
              <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </NavLink>
        ))}
        <NavLink
          to={profileHref}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary' : 'text-neutral-500',
            )
          }
        >
          <Avatar src={profile?.avatar_url} name={profile?.display_name ?? 'Me'} size="sm" />
          Profile
        </NavLink>
      </nav>
    </div>
  )
}

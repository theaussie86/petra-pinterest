import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { AuthUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'

interface HeaderProps {
  user: AuthUser
}

export function Header({ user }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
      await navigate({ to: '/' })
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  // Get user initials for avatar
  const initials = user.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Left: App name and navigation */}
        <div className="flex items-center gap-6">
          <Link
            to="/dashboard"
            className="text-xl font-bold text-slate-900 hover:text-slate-700"
          >
            Petra
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              activeProps={{
                className: 'text-slate-900',
              }}
            >
              Dashboard
            </Link>
            <Link
              to="/calendar"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              activeProps={{
                className: 'text-slate-900',
              }}
            >
              Calendar
            </Link>
          </nav>
        </div>

        {/* Right: User menu */}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-100 transition-colors"
          >
            {/* Avatar circle with initials */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
              {initials}
            </div>
            <span className="text-sm font-medium text-slate-900">
              {user.display_name}
            </span>
          </button>

          {/* Dropdown menu */}
          {isMenuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsMenuOpen(false)}
              />
              {/* Menu */}
              <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                <div className="p-4 border-b border-slate-200">
                  <p className="text-sm font-medium text-slate-900">
                    {user.display_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{user.email}</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

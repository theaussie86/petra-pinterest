import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getAuthUser, getUser } from '@/lib/auth'

/**
 * Protected route layout
 * Guards all child routes under /_authed/*
 * Redirects to /login if user is not authenticated
 */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    // Step 1: Check authentication only (fast, no profile dependency)
    const authUser = await getAuthUser()

    if (!authUser) {
      throw redirect({
        to: '/login',
      })
    }

    // Step 2: Get full user context with profile data (has fallback for missing profile)
    // This will always succeed for authenticated users since getUser() returns fallback values
    const user = await getUser()

    // User cannot be null here because we verified authentication above
    // and getUser() returns fallback values for authenticated users without profiles
    if (!user) {
      throw new Error('getUser() returned null for authenticated user - this should never happen')
    }

    // Make user available to child routes via context
    return { user }
  },
  component: () => <Outlet />,
})

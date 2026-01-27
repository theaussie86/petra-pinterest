import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getUser } from '@/lib/auth'

/**
 * Protected route layout
 * Guards all child routes under /_authed/*
 * Redirects to /login if user is not authenticated
 */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const user = await getUser()

    if (!user) {
      throw redirect({
        to: '/login',
      })
    }

    // Make user available to child routes via context
    return { user }
  },
  component: () => <Outlet />,
})

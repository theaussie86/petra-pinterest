import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

/**
 * Protected route layout
 * Guards all child routes under /_authed/*
 * Redirects to /login if user is not authenticated
 *
 * User data is fetched in __root.tsx beforeLoad via a server function
 * and passed down through route context.
 */
export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' })
    }

    return { user: context.user }
  },
  component: () => <Outlet />,
})

import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { EmptyDashboardState } from '@/components/dashboard/empty-state'

export const Route = createFileRoute('/_authed/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  // Get user from route context (provided by _authed layout)
  const { user } = Route.useRouteContext()

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      <main className="container mx-auto px-4 py-8">
        <EmptyDashboardState />
      </main>
    </div>
  )
}

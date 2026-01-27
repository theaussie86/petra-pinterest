import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-foreground">Petra Pinterest</h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Schedule and manage Pinterest pins for your blogs from a single
          dashboard.
        </p>
        <a
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  )
}

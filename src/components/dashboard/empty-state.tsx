import { Button } from '@/components/ui/button'

export function EmptyDashboardState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-md px-4">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          Hey! Let's get you set up with your first blog.
        </h1>
        <p className="text-slate-600 mb-8">
          Create a blog to start scheduling Pinterest pins and managing your content.
        </p>
        <Button size="lg" disabled>
          Create your first blog
        </Button>
        <p className="text-xs text-slate-500 mt-2">
          (Blog creation coming in next phase)
        </p>
      </div>
    </div>
  )
}

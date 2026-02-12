import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { PinsList } from '@/components/pins/pins-list'
import { CreatePinDialog } from '@/components/pins/create-pin-dialog'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'

type PinsSearch = {
  project?: string
}

export const Route = createFileRoute('/_authed/pins')({
  validateSearch: (search: Record<string, unknown>): PinsSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
  }),
  component: PinsPage,
})

function PinsPage() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { project } = Route.useSearch()
  const { data: projects } = useBlogProjects()

  const [createPinDialogOpen, setCreatePinDialogOpen] = useState(false)

  // Auto-select first project when none is selected
  useEffect(() => {
    if (!project && projects && projects.length > 0) {
      navigate({
        search: (prev) => ({ ...prev, project: projects[0].id }),
        replace: true,
      })
    }
  }, [project, projects, navigate])

  const handleProjectChange = (projectId: string) => {
    navigate({
      search: (prev) => ({ ...prev, project: projectId }),
    })
  }

  return (
    <>
      <PageHeader title="Pins" />
      <PageLayout maxWidth="wide">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1">
            {projects?.map((p) => (
              <Button
                key={p.id}
                variant={project === p.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleProjectChange(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>

          {project && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreatePinDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Pin
              </Button>
            </div>
          )}
        </div>

        {project && <PinsList projectId={project} />}
      </PageLayout>

      {project && (
        <CreatePinDialog
          open={createPinDialogOpen}
          onOpenChange={setCreatePinDialogOpen}
          projectId={project}
        />
      )}
    </>
  )
}

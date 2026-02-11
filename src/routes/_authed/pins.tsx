import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { PinsList } from '@/components/pins/pins-list'
import { CreatePinDialog } from '@/components/pins/create-pin-dialog'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  const handleProjectChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        project: value === 'all' ? undefined : value,
      }),
    })
  }

  return (
    <>
      <PageHeader title="Pins" />
      <PageLayout maxWidth="wide">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <Select
            value={project || 'all'}
            onValueChange={handleProjectChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            {project && (
              <Button variant="outline" size="sm" onClick={() => setCreatePinDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Pin
              </Button>
            )}
          </div>
        </div>

        <PinsList projectId={project} />
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

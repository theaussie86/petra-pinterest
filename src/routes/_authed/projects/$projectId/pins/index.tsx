import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { PinsList } from '@/components/pins/pins-list'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/projects/$projectId/pins/')({
  component: PinsPage,
})

function PinsPage() {
  const { projectId } = Route.useParams()

  return (
    <>
      <PageHeader title="Pins" />
      <PageLayout maxWidth="wide">
        {/* Toolbar */}
        <div className="flex items-center justify-end mb-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/projects/$projectId/create-pin" params={{ projectId }}>
                <Plus className="h-4 w-4 mr-1" /> Create Pin
              </Link>
            </Button>
          </div>
        </div>

        <PinsList projectId={projectId} />
      </PageLayout>
    </>
  )
}

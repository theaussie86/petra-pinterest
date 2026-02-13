import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { PinsList } from '@/components/pins/pins-list'
import { CreatePinDialog } from '@/components/pins/create-pin-dialog'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/projects/$projectId/pins/')({
  component: PinsPage,
})

function PinsPage() {
  const { projectId } = Route.useParams()

  const [createPinDialogOpen, setCreatePinDialogOpen] = useState(false)

  return (
    <>
      <PageHeader title="Pins" />
      <PageLayout maxWidth="wide">
        {/* Toolbar */}
        <div className="flex items-center justify-end mb-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreatePinDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Pin
            </Button>
          </div>
        </div>

        <PinsList projectId={projectId} />
      </PageLayout>

      <CreatePinDialog
        open={createPinDialogOpen}
        onOpenChange={setCreatePinDialogOpen}
        projectId={projectId}
      />
    </>
  )
}

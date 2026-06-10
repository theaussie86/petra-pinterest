import { createFileRoute, Link, CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { PinsList } from '@/components/pins/pins-list'
import { Button } from '@/components/ui/button'
import { pinsPaginatedQueryOptions, pinStatusCountsQueryOptions } from '@/lib/query/pins'

export const Route = createFileRoute('/_authed/projects/$projectId/pins/')({
  // Prefetch (and await) the first page of pins server-side so the list arrives
  // in the SSR HTML with no loading flash. `prefetchInfiniteQuery` fetches only
  // the first page; further pages stream client-side via the existing cursor
  // pagination. Alongside it, prefetch the per-status filter-tab counts so the
  // badges show true project totals on first paint (issue #67). Both share their
  // query options with the consuming suspense hooks → one cache entry each.
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.prefetchInfiniteQuery(pinsPaginatedQueryOptions(params.projectId)),
      context.queryClient.prefetchQuery(pinStatusCountsQueryOptions(params.projectId)),
    ]),
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

        <CatchBoundary
          getResetKey={() => `pins-${projectId}`}
          errorComponent={({ error }) => <ErrorState error={error} />}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <PinsList projectId={projectId} />
          </Suspense>
        </CatchBoundary>
      </PageLayout>
    </>
  )
}

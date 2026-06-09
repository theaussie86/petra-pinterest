import { createFileRoute, CatchBoundary } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { EmptyDashboardState } from '@/components/dashboard/empty-state'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { Button } from '@/components/ui/button'
import { useBlogProjectsSuspense } from '@/lib/hooks/use-blog-projects'
import { useDashboardStatsSuspense } from '@/lib/hooks/use-dashboard-stats'
import { blogProjectsQueryOptions } from '@/lib/query/blog-projects'
import { dashboardStatsQueryOptions } from '@/lib/query/dashboard-stats'
import type { BlogProject } from '@/types/blog-projects'

export const Route = createFileRoute('/_authed/dashboard')({
  // Prefetch the project list + stats aggregate server-side so the dashboard's
  // stats bar and project cards arrive in the SSR HTML and hydrate without a
  // client refetch. Stats come from the single get_dashboard_stats RPC, so no
  // full pins/articles payload is serialized into hydration. Both feeds share
  // their query-options factory with the consuming suspense hooks → one cache
  // entry each.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(blogProjectsQueryOptions()),
      context.queryClient.ensureQueryData(dashboardStatsQueryOptions()),
    ]),
  component: Dashboard,
})

function Dashboard() {
  const { t } = useTranslation()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteProject, setDeleteProject] = useState<BlogProject | null>(null)

  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      <PageLayout maxWidth="wide">
        <CatchBoundary
          getResetKey={() => 'dashboard'}
          errorComponent={({ error }) => <ErrorState error={error} />}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <DashboardContent
              onCreateProject={() => setCreateDialogOpen(true)}
              onDeleteProject={setDeleteProject}
            />
          </Suspense>
        </CatchBoundary>
      </PageLayout>

      {/* Dialogs */}
      <ProjectDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false)
          }
        }}
      />
      <DeleteDialog
        open={!!deleteProject}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProject(null)
          }
        }}
        project={deleteProject}
      />
    </>
  )
}

interface DashboardContentProps {
  onCreateProject: () => void
  onDeleteProject: (project: BlogProject) => void
}

function DashboardContent({ onCreateProject, onDeleteProject }: DashboardContentProps) {
  const { t } = useTranslation()
  // Suspense + the loader prefetch guarantee both feeds are present here; the
  // Suspense boundary covers the (already-resolved) loading state and
  // CatchBoundary covers errors. Background refetches keep showing stale data
  // without re-triggering the fallback.
  const { data: projects } = useBlogProjectsSuspense()
  const { globalStats, projectStatsMap } = useDashboardStatsSuspense()

  return (
    <>
      {/* Stats bar */}
      <StatsBar stats={globalStats} />

      {/* Header with create button */}
      {projects.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">{t('dashboard.yourProjects')}</h2>
          <Button onClick={onCreateProject}>
            <Plus className="h-4 w-4 mr-2" />
            {t('dashboard.createProject')}
          </Button>
        </div>
      )}

      {/* Empty state or project grid */}
      {projects.length === 0 ? (
        <EmptyDashboardState onCreateProject={onCreateProject} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={onDeleteProject}
              stats={projectStatsMap.get(project.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

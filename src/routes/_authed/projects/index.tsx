import { createFileRoute, CatchBoundary } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { EmptyDashboardState } from '@/components/dashboard/empty-state'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { Button } from '@/components/ui/button'
import { useBlogProjectsSuspense } from '@/lib/hooks/use-blog-projects'
import { useProjectStats } from '@/lib/hooks/use-project-stats'
import { blogProjectsQueryOptions } from '@/lib/query/blog-projects'
import type { BlogProject } from '@/types/blog-projects'

export const Route = createFileRoute('/_authed/projects/')({
  // Prefetch the projects list server-side so it arrives in the SSR HTML and
  // hydrates without a client refetch. Shares `blogProjectsQueryOptions` with
  // the consuming `useBlogProjectsSuspense` hook → one cache entry.
  loader: ({ context }) => context.queryClient.ensureQueryData(blogProjectsQueryOptions()),
  component: ProjectsPage,
})

function ProjectsPage() {
  const { t } = useTranslation()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteProject, setDeleteProject] = useState<BlogProject | null>(null)

  return (
    <>
      <PageHeader title={t('projectsPage.title')} />
      <PageLayout maxWidth="wide">
        <CatchBoundary
          getResetKey={() => 'projects-list'}
          errorComponent={({ error }) => <ErrorState error={error} />}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <ProjectsList
              onCreateProject={() => setCreateDialogOpen(true)}
              onDeleteProject={setDeleteProject}
            />
          </Suspense>
        </CatchBoundary>
      </PageLayout>

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

interface ProjectsListProps {
  onCreateProject: () => void
  onDeleteProject: (project: BlogProject) => void
}

function ProjectsList({ onCreateProject, onDeleteProject }: ProjectsListProps) {
  const { t } = useTranslation()
  // Suspense + the loader prefetch guarantee `projects` is defined here; the
  // Suspense boundary covers the (already-resolved) loading state and
  // CatchBoundary covers errors. Background refetches (realtime invalidation)
  // keep showing stale data without re-triggering the fallback.
  const { data: projects } = useBlogProjectsSuspense()
  const { projectStatsMap, loading: statsLoading } = useProjectStats()

  if (projects.length === 0) {
    return <EmptyDashboardState onCreateProject={onCreateProject} />
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{t('projectsPage.title')}</h2>
        <Button onClick={onCreateProject}>
          <Plus className="h-4 w-4 mr-2" />
          {t('projectsPage.createProject')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onDelete={onDeleteProject}
            stats={projectStatsMap.get(project.id)}
            statsLoading={statsLoading}
          />
        ))}
      </div>
    </>
  )
}

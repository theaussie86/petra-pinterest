import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyDashboardState } from '@/components/dashboard/empty-state'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { Button } from '@/components/ui/button'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { useProjectStats } from '@/lib/hooks/use-project-stats'
import type { BlogProject } from '@/types/blog-projects'

export const Route = createFileRoute('/_authed/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const { t } = useTranslation()
  const { data: projects, isLoading: projectsLoading, error, refetch } = useBlogProjects()
  const { globalStats, projectStatsMap, loading: statsLoading } = useProjectStats()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editProject, setEditProject] = useState<BlogProject | null>(null)
  const [deleteProject, setDeleteProject] = useState<BlogProject | null>(null)

  const handleCreateProject = () => {
    setCreateDialogOpen(true)
  }

  const handleEditProject = (project: BlogProject) => {
    setEditProject(project)
  }

  const handleDeleteProject = (project: BlogProject) => {
    setDeleteProject(project)
  }

  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      <PageLayout maxWidth="wide" isLoading={projectsLoading} error={error ?? null} onRetry={() => refetch()}>
        {/* Stats bar */}
        <StatsBar stats={globalStats} loading={statsLoading} />

        {/* Header with create button */}
        {projects && projects.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{t('dashboard.yourProjects')}</h2>
            <Button onClick={handleCreateProject}>
              <Plus className="h-4 w-4 mr-2" />
              {t('dashboard.createProject')}
            </Button>
          </div>
        )}

        {/* Empty state or project grid */}
        {projects && projects.length === 0 ? (
          <EmptyDashboardState onCreateProject={handleCreateProject} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects?.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleEditProject}
                onDelete={handleDeleteProject}
                stats={projectStatsMap.get(project.id)}
                statsLoading={statsLoading}
              />
            ))}
          </div>
        )}
      </PageLayout>

      {/* Dialogs */}
      <ProjectDialog
        open={createDialogOpen || !!editProject}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false)
            setEditProject(null)
          }
        }}
        project={editProject || undefined}
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

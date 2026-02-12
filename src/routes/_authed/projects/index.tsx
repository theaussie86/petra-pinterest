import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyDashboardState } from '@/components/dashboard/empty-state'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { Button } from '@/components/ui/button'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { useAllPins } from '@/lib/hooks/use-pins'
import { useAllArticles } from '@/lib/hooks/use-articles'
import type { BlogProject } from '@/types/blog-projects'
import type { PinStatus } from '@/types/pins'

const SCHEDULED_STATUSES: PinStatus[] = ['ready_to_schedule']
const PUBLISHED_STATUSES: PinStatus[] = ['published']

export const Route = createFileRoute('/_authed/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { t } = useTranslation()
  const { data: projects, isLoading: projectsLoading, error, refetch } = useBlogProjects()
  const { data: allPins, isLoading: pinsLoading } = useAllPins()
  const { data: allArticles, isLoading: articlesLoading } = useAllArticles()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editProject, setEditProject] = useState<BlogProject | null>(null)
  const [deleteProject, setDeleteProject] = useState<BlogProject | null>(null)

  const statsLoading = pinsLoading || articlesLoading

  const projectStatsMap = useMemo(() => {
    const pins = allPins ?? []
    const articles = allArticles ?? []
    const map = new Map<string, { articles: number; scheduled: number; published: number }>()

    for (const article of articles) {
      const entry = map.get(article.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
      entry.articles++
      map.set(article.blog_project_id, entry)
    }

    for (const pin of pins) {
      const entry = map.get(pin.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
      if (SCHEDULED_STATUSES.includes(pin.status)) entry.scheduled++
      if (PUBLISHED_STATUSES.includes(pin.status)) entry.published++
      map.set(pin.blog_project_id, entry)
    }

    return map
  }, [allPins, allArticles])

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
      <PageHeader title={t('projectsPage.title')} />
      <PageLayout maxWidth="wide" isLoading={projectsLoading} error={error ?? null} onRetry={() => refetch()}>
        {projects && projects.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{t('projectsPage.title')}</h2>
            <Button onClick={handleCreateProject}>
              <Plus className="h-4 w-4 mr-2" />
              {t('projectsPage.createProject')}
            </Button>
          </div>
        )}

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

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { DeleteDialog } from '@/components/projects/delete-dialog'
import { PinterestConnection } from '@/components/projects/pinterest-connection'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/projects/$id')({
  validateSearch: (search: Record<string, unknown>) => ({
    pinterest_connected: (search.pinterest_connected as string) || undefined,
    pinterest_error: (search.pinterest_error as string) || undefined,
  }),
  component: ProjectDetail,
})

function ProjectDetail() {
  const { t, i18n } = useTranslation()
  const { id } = Route.useParams()
  const search = Route.useSearch()
  const { data: project, isLoading, error } = useBlogProject(id)
  const navigate = useNavigate()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getFrequencyBadge = (frequency: 'daily' | 'weekly' | 'manual') => {
    const colors = {
      daily: 'bg-green-100 text-green-800',
      weekly: 'bg-blue-100 text-blue-800',
      manual: 'bg-slate-100 text-slate-800',
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[frequency]}`}>
        {t('projectDetail.frequency' + frequency.charAt(0).toUpperCase() + frequency.slice(1))}
      </span>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('projectDetail.breadcrumbDashboard'), href: "/dashboard" },
          { label: project?.name || t('projectDetail.breadcrumbProject') },
        ]}
        title={project?.name || t('projectDetail.breadcrumbProject')}
        actions={
          project ? (
            <>
              <Button variant="outline" onClick={() => setEditDialogOpen(true)}>{t('common.edit')}</Button>
              <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setDeleteDialogOpen(true)}>{t('common.delete')}</Button>
            </>
          ) : undefined
        }
      />
      <PageLayout maxWidth="medium" isLoading={isLoading} error={error ?? null}>
        {project && (
          <>
            {/* Project metadata */}
            <div className="mb-8">
              <div className="flex flex-col gap-2 text-slate-600">
                <a
                  href={project.blog_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:underline w-fit"
                >
                  {project.blog_url}
                  <ExternalLink className="h-4 w-4" />
                </a>
                <div className="flex items-center gap-4 text-sm">
                  <span>{t('projectDetail.created', { date: formatDate(project.created_at) })}</span>
                  <span>•</span>
                  <span>{t('projectDetail.scraping')} {getFrequencyBadge(project.scraping_frequency)}</span>
                </div>
                {project.sitemap_url && (
                  <div className="text-sm">
                    <span className="text-slate-500">{t('projectDetail.sitemap')}</span>{' '}
                    <a
                      href={project.sitemap_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {project.sitemap_url}
                    </a>
                  </div>
                )}
                {!project.sitemap_url && (
                  <div className="text-sm text-slate-500">{t('projectDetail.sitemap')} {t('projectDetail.sitemapNotConfigured')}</div>
                )}
                {project.description && (
                  <p className="text-sm mt-2">{project.description}</p>
                )}
              </div>
            </div>

            {/* Pinterest Connection */}
            <div className="mb-8">
              <PinterestConnection
                blogProjectId={id}
                pinterestConnected={search.pinterest_connected === 'true'}
                pinterestError={search.pinterest_error}
              />
            </div>
          </>
        )}
      </PageLayout>

      {/* Dialogs */}
      {project && (
        <>
          <ProjectDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            project={project}
          />
          <DeleteDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            project={project}
            onDeleted={() => navigate({ to: '/dashboard' })}
          />
        </>
      )}
    </>
  )
}

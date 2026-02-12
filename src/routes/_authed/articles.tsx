import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ArticlesTable } from '@/components/articles/articles-table'
import { AddArticleDialog } from '@/components/articles/add-article-dialog'
import { ScrapeButton } from '@/components/articles/scrape-button'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'

type ArticlesSearch = {
  project?: string
}

export const Route = createFileRoute('/_authed/articles')({
  validateSearch: (search: Record<string, unknown>): ArticlesSearch => ({
    project: typeof search.project === 'string' ? search.project : undefined,
  }),
  component: ArticlesPage,
})

function ArticlesPage() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { project } = Route.useSearch()
  const { data: projects } = useBlogProjects()

  const [addArticleDialogOpen, setAddArticleDialogOpen] = useState(false)

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

  const selectedProject = projects?.find((p) => p.id === project)

  return (
    <>
      <PageHeader title="Articles" />
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

          {project && selectedProject && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddArticleDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Article
              </Button>
              <ScrapeButton
                blogProjectId={project}
                blogUrl={selectedProject.blog_url}
                sitemapUrl={selectedProject.sitemap_url}
              />
            </div>
          )}
        </div>

        {project && <ArticlesTable projectId={project} />}
      </PageLayout>

      {project && (
        <AddArticleDialog
          open={addArticleDialogOpen}
          onOpenChange={setAddArticleDialogOpen}
          projectId={project}
        />
      )}
    </>
  )
}

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ArticlesTable } from '@/components/articles/articles-table'
import { AddArticleDialog } from '@/components/articles/add-article-dialog'
import { ScrapeButton } from '@/components/articles/scrape-button'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  const handleProjectChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        project: value === 'all' ? undefined : value,
      }),
    })
  }

  const selectedProject = projects?.find((p) => p.id === project)

  return (
    <>
      <PageHeader title="Articles" />
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
            {project && selectedProject && (
              <>
                <Button variant="outline" size="sm" onClick={() => setAddArticleDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Article
                </Button>
                <ScrapeButton
                  blogProjectId={project}
                  blogUrl={selectedProject.blog_url}
                  sitemapUrl={selectedProject.sitemap_url}
                />
              </>
            )}
          </div>
        </div>

        <ArticlesTable projectId={project} />
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

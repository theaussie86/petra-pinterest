import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ArticlesTable } from '@/components/articles/articles-table'
import { AddArticleDialog } from '@/components/articles/add-article-dialog'
import { ScrapeButton } from '@/components/articles/scrape-button'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/projects/$projectId/articles/')({
  component: ArticlesPage,
})

function ArticlesPage() {
  const { projectId } = Route.useParams()
  const { data: project } = useBlogProject(projectId)

  const [addArticleDialogOpen, setAddArticleDialogOpen] = useState(false)

  return (
    <>
      <PageHeader title="Articles" />
      <PageLayout maxWidth="wide">
        {/* Toolbar */}
        <div className="flex items-center justify-end mb-6">
          {project && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddArticleDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Article
              </Button>
              <ScrapeButton
                blogProjectId={projectId}
                blogUrl={project.blog_url}
                sitemapUrl={project.sitemap_url}
              />
            </div>
          )}
        </div>

        <ArticlesTable projectId={projectId} />
      </PageLayout>

      <AddArticleDialog
        open={addArticleDialogOpen}
        onOpenChange={setAddArticleDialogOpen}
        projectId={projectId}
      />
    </>
  )
}

import { createFileRoute, CatchBoundary } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { ArticlesList } from '@/components/articles/articles-list'
import { AddArticleDialog } from '@/components/articles/add-article-dialog'
import { ScrapeButton } from '@/components/articles/scrape-button'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { articlesPaginatedQueryOptions } from '@/lib/query/articles'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/projects/$projectId/articles/')({
  // Prefetch (and await) the first page of active articles server-side so the list
  // arrives in the SSR HTML with no loading flash. `prefetchInfiniteQuery` fetches
  // only the first page; further pages stream client-side via the existing offset
  // pagination. The archived tab is below the fold (loads on tab switch) and is not
  // prefetched. Shares `articlesPaginatedQueryOptions` with the consuming
  // `useArticlesPaginatedSuspense` hook → one cache entry.
  loader: ({ context, params }) =>
    context.queryClient.prefetchInfiniteQuery(articlesPaginatedQueryOptions(params.projectId)),
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

        <CatchBoundary
          getResetKey={() => `articles-${projectId}`}
          errorComponent={({ error }) => <ErrorState error={error} />}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <ArticlesList projectId={projectId} />
          </Suspense>
        </CatchBoundary>
      </PageLayout>

      <AddArticleDialog
        open={addArticleDialogOpen}
        onOpenChange={setAddArticleDialogOpen}
        projectId={projectId}
      />
    </>
  )
}

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { useArticle, useArchiveArticle } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { sanitizeHtml } from '@/lib/utils'

export const Route = createFileRoute('/_authed/projects/$projectId/articles/$articleId')({
  component: ArticleDetail,
})

function ArticleDetail() {
  const { projectId, articleId } = Route.useParams()
  const { data: article, isLoading, error } = useArticle(articleId)
  const { data: project } = useBlogProject(projectId)
  const archiveMutation = useArchiveArticle()
  const navigate = useNavigate()

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleArchive = async () => {
    archiveMutation.mutate(article!.id, {
      onSuccess: () => {
        navigate({ to: '/projects/$id', params: { id: article!.blog_project_id }, search: { pinterest_connected: undefined, pinterest_error: undefined } })
      }
    })
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: project?.name || "Project", href: `/projects/${projectId}` },
          { label: article?.title || "Article" },
        ]}
        title={article?.title || "Article"}
        actions={
          article ? (
            <>
              <Button variant="outline" asChild>
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> View Original
                </a>
              </Button>
              <Button variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending}>
                {article.archived_at ? "Restore" : "Archive"}
              </Button>
            </>
          ) : undefined
        }
      />
      <PageLayout maxWidth="narrow" isLoading={isLoading} error={error ?? null}>
        {article && (
          <>
            {/* Article metadata */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                {article.published_at && (
                  <span>Published {formatDate(article.published_at)}</span>
                )}
                <span>Scraped {formatDate(article.scraped_at)}</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  0 pins
                </span>
              </div>
            </div>

            {/* Article content */}
            <Card>
              <CardContent className="prose prose-slate max-w-none py-6">
                {article.content ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
                ) : (
                  <p className="text-slate-500 italic">No content available. The article content could not be scraped.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageLayout>
    </>
  )
}

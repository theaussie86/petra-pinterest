import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()
  const { projectId, articleId } = Route.useParams()
  const { data: article, isLoading, error } = useArticle(articleId)
  const { data: project } = useBlogProject(projectId)
  const archiveMutation = useArchiveArticle()
  const navigate = useNavigate()

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
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
          { label: t('articleDetail.breadcrumbDashboard'), href: "/dashboard" },
          { label: project?.name || t('articleDetail.breadcrumbProject'), href: `/projects/${projectId}` },
          { label: article?.title || t('articleDetail.breadcrumbArticle') },
        ]}
        title={article?.title || t('articleDetail.breadcrumbArticle')}
        actions={
          article ? (
            <>
              <Button variant="outline" asChild>
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> {t('articleDetail.viewOriginal')}
                </a>
              </Button>
              <Button variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending}>
                {article.archived_at ? t('articleDetail.restore') : t('articleDetail.archive')}
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
                  <span>{t('articleDetail.published', { date: formatDate(article.published_at) })}</span>
                )}
                <span>{t('articleDetail.scraped', { date: formatDate(article.scraped_at) })}</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {t('articleDetail.pins', { count: 0 })}
                </span>
              </div>
            </div>

            {/* Article content */}
            <Card>
              <CardContent className="prose prose-slate max-w-none py-6">
                {article.content ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
                ) : (
                  <p className="text-slate-500 italic">{t('articleDetail.noContent')}</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageLayout>
    </>
  )
}

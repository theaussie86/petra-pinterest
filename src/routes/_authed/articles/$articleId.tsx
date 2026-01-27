import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { useArticle, useArchiveArticle } from '@/lib/hooks/use-articles'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { sanitizeHtml } from '@/lib/utils'

export const Route = createFileRoute('/_authed/articles/$articleId')({
  component: ArticleDetail,
})

function ArticleDetail() {
  const { user } = Route.useRouteContext()
  const { articleId } = Route.useParams()
  const { data: article, isLoading, error } = useArticle(articleId)
  const archiveMutation = useArchiveArticle()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          </div>
        </main>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-slate-600">Article not found</p>
            <Link to="/dashboard">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleArchive = async () => {
    archiveMutation.mutate(article.id, {
      onSuccess: () => {
        navigate({ to: '/projects/$id', params: { id: article.blog_project_id } })
      }
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Link to="/projects/$id" params={{ id: article.blog_project_id }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Button>
          </Link>
        </div>

        {/* Article metadata header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-3">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            {article.published_at && (
              <span>Published {formatDate(article.published_at)}</span>
            )}
            <span>Scraped {formatDate(article.scraped_at)}</span>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
            >
              Source <ExternalLink className="h-3 w-3" />
            </a>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              0 pins
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={archiveMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {archiveMutation.isPending ? 'Archiving...' : 'Archive Article'}
          </Button>
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
      </main>
    </div>
  )
}

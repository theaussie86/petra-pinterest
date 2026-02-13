import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Pencil } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { useArticle, useArchiveArticle, useUpdateArticleContent } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const updateContentMutation = useUpdateArticleContent()
  const navigate = useNavigate()

  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

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
        navigate({ to: '/projects/$projectId', params: { projectId: article!.blog_project_id } })
      }
    })
  }

  const handleStartEditing = () => {
    setEditedContent(article?.content || '')
    setIsEditing(true)
  }

  const handleCancelEditing = () => {
    setIsEditing(false)
    setEditedContent('')
  }

  const handleSaveContent = () => {
    updateContentMutation.mutate(
      { id: article!.id, content: editedContent },
      {
        onSuccess: () => {
          setIsEditing(false)
          setEditedContent('')
          setConfirmDialogOpen(false)
        },
        onSettled: () => {
          setConfirmDialogOpen(false)
        }
      }
    )
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
            <div className="flex gap-2">
              {!isEditing && (
                <Button variant="outline" onClick={handleStartEditing}>
                  <Pencil className="mr-2 h-4 w-4" /> {t('articleDetail.editContent')}
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> {t('articleDetail.viewOriginal')}
                </a>
              </Button>
              <Button variant="outline" onClick={handleArchive} disabled={archiveMutation.isPending}>
                {article.archived_at ? t('articleDetail.restore') : t('articleDetail.archive')}
              </Button>
            </div>
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
              <CardContent className="py-6">
                {isEditing ? (
                  <div className="space-y-4">
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="min-h-[400px] font-mono text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={handleCancelEditing}>
                        {t('articleDetail.cancelEdit')}
                      </Button>
                      <Button onClick={() => setConfirmDialogOpen(true)}>
                        {t('articleDetail.saveContent')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-slate max-w-none">
                    {article.content ? (
                      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
                    ) : (
                      <p className="text-slate-500 italic">{t('articleDetail.noContent')}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageLayout>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('articleDetail.confirmSaveTitle')}</DialogTitle>
            <DialogDescription>{t('articleDetail.confirmSaveDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={updateContentMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveContent} disabled={updateContentMutation.isPending}>
              {updateContentMutation.isPending ? t('articleDetail.saving') : t('articleDetail.confirmSaveButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

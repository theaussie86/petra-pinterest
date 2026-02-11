import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, FileText, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { usePin, useUpdatePin } from '@/lib/hooks/use-pins'
import { useArticle } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { usePinterestConnection } from '@/lib/hooks/use-pinterest-connection'
import { getPinImageUrl } from '@/lib/api/pins'
import { EditPinDialog } from '@/components/pins/edit-pin-dialog'
import { DeletePinDialog } from '@/components/pins/delete-pin-dialog'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { GenerateMetadataButton } from '@/components/pins/generate-metadata-button'
import { MetadataHistoryDialog } from '@/components/pins/metadata-history-dialog'
import { RegenerateFeedbackDialog } from '@/components/pins/regenerate-feedback-dialog'
import { SchedulePinSection } from '@/components/pins/schedule-pin-section'
import { PublishPinButton } from '@/components/pins/publish-pin-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const Route = createFileRoute('/_authed/projects/$projectId/pins/$pinId')({
  component: PinDetail,
})

function PinDetail() {
  const { t, i18n } = useTranslation()
  const { projectId, pinId } = Route.useParams()
  const { data: pin, isLoading, error } = usePin(pinId)
  const { data: project } = useBlogProject(projectId)
  const navigate = useNavigate()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)

  // Fetch Pinterest connection status for the pin's project
  const { data: connectionData } = usePinterestConnection(pin?.blog_project_id || '')

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('pinDetail.breadcrumbDashboard'), href: "/dashboard" },
          { label: project?.name || t('pinDetail.breadcrumbProject'), href: `/projects/${projectId}` },
          { label: pin?.title || t('pinDetail.breadcrumbPin') },
        ]}
        title={pin?.title || t('pinDetail.title')}
        actions={
          pin ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> {t('common.edit')}
              </Button>
              <Button variant="outline" className="text-red-600" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> {t('common.delete')}
              </Button>
            </div>
          ) : undefined
        }
      />
      <PageLayout maxWidth="medium" isLoading={isLoading} error={error ?? null}>
        {pin && (
          <>
            {/* Error alert section */}
            {pin.status === 'error' && (
              <div className="mb-6">
                <ErrorAlert pin={pin} />
              </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Left column - Image */}
              <div className="lg:col-span-2">
                <div className="overflow-hidden rounded-lg shadow-sm bg-white">
                  <img
                    src={getPinImageUrl(pin.image_path)}
                    alt={pin.title || 'Pin image'}
                    className="w-full h-auto object-contain"
                  />
                </div>
              </div>

              {/* Right column - Metadata */}
              <div className="lg:col-span-1 space-y-6">
                {/* Pin info card */}
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    {/* Title */}
                    <div>
                      <h1 className="text-xl font-bold text-slate-900">
                        {pin.title || <span className="italic text-slate-400">{t('common.untitled')}</span>}
                      </h1>
                    </div>

                    {/* Description */}
                    <div>
                      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.description')}</h3>
                      <p className="text-sm text-slate-700">
                        {pin.description || <span className="text-slate-400">{t('pinDetail.noDescription')}</span>}
                      </p>
                    </div>

                    {/* Alt Text */}
                    <div>
                      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.altText')}</h3>
                      <p className="text-sm text-slate-700">
                        {pin.alt_text || <span className="text-slate-400">{t('pinDetail.noAltText')}</span>}
                      </p>
                    </div>

                    {/* Status */}
                    <div>
                      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.status')}</h3>
                      <PinStatusBadge status={pin.status} />
                    </div>

                    {/* Article */}
                    <PinArticleLink articleId={pin.blog_article_id} projectId={projectId} />

                    {/* Board */}
                    <div>
                      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.board')}</h3>
                      <p className="text-sm text-slate-700">
                        {pin.pinterest_board_name || <span className="text-slate-400">{t('common.notAssigned')}</span>}
                      </p>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                      <div>
                        <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.created')}</h3>
                        <p className="text-sm text-slate-700">{formatDate(pin.created_at, i18n.language)}</p>
                      </div>
                      <div>
                        <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.updated')}</h3>
                        <p className="text-sm text-slate-700">{formatDate(pin.updated_at, i18n.language)}</p>
                      </div>
                    </div>

                    {/* Scheduled */}
                    {pin.scheduled_at && (
                      <div className="pt-2 border-t">
                        <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.scheduled')}</h3>
                        <p className="text-sm text-slate-700">{formatDateTime(pin.scheduled_at, i18n.language)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Metadata generation */}
                <GenerateMetadataButton
                  pin={pin}
                  onHistoryOpen={() => setHistoryDialogOpen(true)}
                  onRegenerateOpen={() => setFeedbackDialogOpen(true)}
                />

                {/* Pin scheduling */}
                <SchedulePinSection pin={pin} />

                {/* Pinterest publishing */}
                <div className="space-y-2">
                  <PublishPinButton
                    pinId={pin.id}
                    pinStatus={pin.status}
                    hasPinterestConnection={connectionData?.connected ?? false}
                    hasPinterestBoard={!!pin.pinterest_board_id}
                    pinterestPinUrl={pin.pinterest_pin_url}
                  />
                  {pin.pinterest_pin_url && (
                    <a
                      href={pin.pinterest_pin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('pinSidebar.viewOnPinterest')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </PageLayout>

      {/* Dialogs */}
      {pin && (
        <>
          <EditPinDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            pin={pin}
            projectId={pin.blog_project_id}
          />
          <DeletePinDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            pin={pin}
            onDeleted={() => navigate({ to: '/projects/$id', params: { id: pin.blog_project_id }, search: { pinterest_connected: undefined, pinterest_error: undefined } })}
          />
          <MetadataHistoryDialog
            pinId={pinId}
            open={historyDialogOpen}
            onOpenChange={setHistoryDialogOpen}
          />
          <RegenerateFeedbackDialog
            pinId={pinId}
            open={feedbackDialogOpen}
            onOpenChange={setFeedbackDialogOpen}
          />
        </>
      )}
    </>
  )
}

// Sub-components

function PinArticleLink({ articleId, projectId }: { articleId: string; projectId: string }) {
  const { t } = useTranslation()
  const { data: article } = useArticle(articleId)

  return (
    <div>
      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">{t('pinDetail.article')}</h3>
      {article ? (
        <Link
          to="/projects/$projectId/articles/$articleId"
          params={{ projectId, articleId: article.id }}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-2">{article.title}</span>
        </Link>
      ) : (
        <span className="text-sm text-slate-400">{t('common.loading')}</span>
      )}
    </div>
  )
}

function ErrorAlert({ pin }: { pin: { id: string; error_message: string | null; previous_status: string | null } }) {
  const { t } = useTranslation()
  const updateMutation = useUpdatePin()

  const handleResetStatus = async () => {
    await updateMutation.mutateAsync({
      id: pin.id,
      status: (pin.previous_status as any) || 'draft',
      error_message: null,
    })
  }

  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('pinDetail.errorTitle')}</AlertTitle>
      <AlertDescription className="mt-1">
        <p className="mb-3">{pin.error_message || t('pinDetail.unknownError')}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResetStatus}
          disabled={updateMutation.isPending}
          className="border-red-300 hover:bg-red-100"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {updateMutation.isPending ? t('pinDetail.resetting') : t('pinDetail.resetStatus')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function formatDate(dateString: string, language: string) {
  return new Date(dateString).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(dateString: string, language: string) {
  return new Date(dateString).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

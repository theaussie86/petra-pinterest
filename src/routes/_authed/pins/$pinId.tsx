import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2, FileText, AlertTriangle, RotateCcw } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { usePin, useUpdatePin, useBoards } from '@/lib/hooks/use-pins'
import { useArticle } from '@/lib/hooks/use-articles'
import { getPinImageUrl } from '@/lib/api/pins'
import { EditPinDialog } from '@/components/pins/edit-pin-dialog'
import { DeletePinDialog } from '@/components/pins/delete-pin-dialog'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { GenerateMetadataButton } from '@/components/pins/generate-metadata-button'
import { MetadataHistoryDialog } from '@/components/pins/metadata-history-dialog'
import { RegenerateFeedbackDialog } from '@/components/pins/regenerate-feedback-dialog'
import { SchedulePinSection } from '@/components/pins/schedule-pin-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export const Route = createFileRoute('/_authed/pins/$pinId')({
  component: PinDetail,
})

function PinDetail() {
  const { user } = Route.useRouteContext()
  const { pinId } = Route.useParams()
  const { data: pin, isLoading, error } = usePin(pinId)
  const navigate = useNavigate()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)

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

  if (error || !pin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header user={user} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-slate-600">Pin not found</p>
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

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Link to="/projects/$id" params={{ id: pin.blog_project_id }}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Button>
          </Link>
        </div>

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
                    {pin.title || <span className="italic text-slate-400">Untitled</span>}
                  </h1>
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Description</h3>
                  <p className="text-sm text-slate-700">
                    {pin.description || <span className="text-slate-400">No description</span>}
                  </p>
                </div>

                {/* Alt Text */}
                <div>
                  <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Alt Text</h3>
                  <p className="text-sm text-slate-700">
                    {pin.alt_text || <span className="text-slate-400">No alt text</span>}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Status</h3>
                  <PinStatusBadge status={pin.status} />
                </div>

                {/* Article */}
                <PinArticleLink articleId={pin.blog_article_id} />

                {/* Board */}
                <PinBoardName boardId={pin.board_id} projectId={pin.blog_project_id} />

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Created</h3>
                    <p className="text-sm text-slate-700">{formatDate(pin.created_at)}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Updated</h3>
                    <p className="text-sm text-slate-700">{formatDate(pin.updated_at)}</p>
                  </div>
                </div>

                {/* Scheduled */}
                {pin.scheduled_at && (
                  <div className="pt-2 border-t">
                    <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Scheduled</h3>
                    <p className="text-sm text-slate-700">{formatDateTime(pin.scheduled_at)}</p>
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

            {/* Error alert */}
            {pin.status === 'fehler' && (
              <ErrorAlert pin={pin} />
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button onClick={() => setEditDialogOpen(true)} className="w-full">
                <Pencil className="mr-2 h-4 w-4" />
                Edit Pin
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Pin
              </Button>
            </div>
          </div>
        </div>

        {/* Dialogs */}
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
          onDeleted={() => navigate({ to: '/projects/$id', params: { id: pin.blog_project_id } })}
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
      </main>
    </div>
  )
}

// Sub-components

function PinArticleLink({ articleId }: { articleId: string }) {
  const { data: article } = useArticle(articleId)

  return (
    <div>
      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Article</h3>
      {article ? (
        <Link
          to="/articles/$articleId"
          params={{ articleId: article.id }}
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-2">{article.title}</span>
        </Link>
      ) : (
        <span className="text-sm text-slate-400">Loading...</span>
      )}
    </div>
  )
}

function PinBoardName({ boardId, projectId }: { boardId: string | null; projectId: string }) {
  const { data: boards } = useBoards(projectId)
  const board = boards?.find((b) => b.id === boardId)

  return (
    <div>
      <h3 className="text-xs font-medium text-slate-500 uppercase mb-1">Board</h3>
      <p className="text-sm text-slate-700">
        {board ? board.name : <span className="text-slate-400">Not assigned</span>}
      </p>
    </div>
  )
}

function ErrorAlert({ pin }: { pin: { id: string; error_message: string | null; previous_status: string | null } }) {
  const updateMutation = useUpdatePin()

  const handleResetStatus = async () => {
    await updateMutation.mutateAsync({
      id: pin.id,
      status: (pin.previous_status as any) || 'entwurf',
      error_message: null,
    })
  }

  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription className="mt-1">
        <p className="mb-3">{pin.error_message || 'An unknown error occurred.'}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResetStatus}
          disabled={updateMutation.isPending}
          className="border-red-300 hover:bg-red-100"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {updateMutation.isPending ? 'Resetting...' : 'Reset Status'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

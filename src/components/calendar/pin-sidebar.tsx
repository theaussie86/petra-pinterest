import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, ExternalLink, Trash2, FileText } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { usePin, useUpdatePin } from '@/lib/hooks/use-pins'
import { useArticle } from '@/lib/hooks/use-articles'
import { usePinterestConnection, usePinterestBoards } from '@/lib/hooks/use-pinterest-connection'
import { PinMediaPreview } from '@/components/pins/pin-media-preview'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { GenerateMetadataButton } from '@/components/pins/generate-metadata-button'
import { MetadataHistoryDialog } from '@/components/pins/metadata-history-dialog'
import { RegenerateFeedbackDialog } from '@/components/pins/regenerate-feedback-dialog'
import { DeletePinDialog } from '@/components/pins/delete-pin-dialog'
import { PublishPinButton } from '@/components/pins/publish-pin-button'
import { SchedulePinSection } from '@/components/pins/schedule-pin-section'
import {
  PIN_STATUS,
  ACTIVE_STATUSES,
  SYSTEM_MANAGED_STATUSES,
} from '@/types/pins'
import type { PinStatus } from '@/types/pins'

interface PinSidebarProps {
  pinId: string | null
  onClose: () => void
}

const editPinSchema = z.object({
  title: z.string().max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long'),
  alt_text: z.string().max(500, 'Alt text too long'),
  alternate_url: z.string().url('Ungültige URL').or(z.literal('')).optional(),
  pinterest_board_id: z.string(),
  status: z.string(),
})

type EditPinFormData = z.infer<typeof editPinSchema>

// Extracted form component — remounted via key={pin.id} so Radix Select
// initializes with the correct value on each pin change.
function PinSidebarForm({
  pin,
  boards,
  article,
  connectionData,
  onClose,
}: {
  pin: NonNullable<ReturnType<typeof usePin>['data']>
  boards: ReturnType<typeof usePinterestBoards>['data']
  article: ReturnType<typeof useArticle>['data']
  connectionData: ReturnType<typeof usePinterestConnection>['data']
  onClose: () => void
}) {
  const { t } = useTranslation()
  const updateMutation = useUpdatePin()

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const form = useForm<EditPinFormData>({
    resolver: zodResolver(editPinSchema),
    defaultValues: {
      title: pin.title || '',
      description: pin.description || '',
      alt_text: pin.alt_text || '',
      alternate_url: pin.alternate_url || '',
      pinterest_board_id: pin.pinterest_board_id || '__none__',
      status: pin.status,
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form

  const currentStatus = watch('status')
  const currentBoardId = watch('pinterest_board_id')

  const onSubmit = async (data: EditPinFormData) => {
    try {
      const selectedBoard = data.pinterest_board_id === '__none__'
        ? null
        : boards?.find((b) => b.pinterest_board_id === data.pinterest_board_id)
      await updateMutation.mutateAsync({
        id: pin.id,
        title: data.title.trim() || null,
        description: data.description.trim() || null,
        alt_text: data.alt_text.trim() || null,
        alternate_url: data.alternate_url?.trim() || null,
        pinterest_board_id: selectedBoard?.pinterest_board_id || null,
        pinterest_board_name: selectedBoard?.name || null,
        status: data.status as PinStatus,
      })
      // Do NOT close sidebar after save - user stays to continue editing
    } catch (error) {
      // Error toast handled by mutation hook
      console.error('Failed to update pin:', error)
    }
  }

  const isStatusSelectable = (status: PinStatus): boolean => {
    if (ACTIVE_STATUSES.includes(status)) return true
    if (status === 'error') return true
    return false
  }

  return (
    <>
      {/* Pin media */}
      <div className="rounded-lg bg-slate-100 overflow-hidden">
        <PinMediaPreview pin={pin} className="max-h-[200px] w-full object-contain" />
      </div>

      {/* Inline edit form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sidebar-title">{t('editPin.fieldTitle')}</Label>
          <Input
            id="sidebar-title"
            {...register('title')}
            placeholder={t('editPin.placeholderTitle')}
            disabled={isSubmitting}
          />
          {errors.title && (
            <p className="text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sidebar-description">{t('editPin.fieldDescription')}</Label>
          <Textarea
            id="sidebar-description"
            {...register('description')}
            placeholder={t('editPin.placeholderDescription')}
            disabled={isSubmitting}
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sidebar-alt-text">{t('editPin.fieldAltText')}</Label>
          <Textarea
            id="sidebar-alt-text"
            {...register('alt_text')}
            placeholder={t('editPin.placeholderAltText')}
            disabled={isSubmitting}
            rows={2}
          />
          {errors.alt_text && (
            <p className="text-sm text-red-600">{errors.alt_text.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sidebar-alternate-url">{t('editPin.fieldAlternateUrl')}</Label>
          <Input
            id="sidebar-alternate-url"
            {...register('alternate_url')}
            placeholder={t('editPin.placeholderAlternateUrl')}
            disabled={isSubmitting}
          />
          {errors.alternate_url && (
            <p className="text-sm text-red-600">{errors.alternate_url.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sidebar-board">{t('editPin.fieldBoard')}</Label>
          <Select
            value={currentBoardId}
            onValueChange={(value) => setValue('pinterest_board_id', value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="sidebar-board">
              <SelectValue placeholder={t('editPin.placeholderBoard')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('common.notAssigned')}</SelectItem>
              {boards?.map((board) => (
                <SelectItem key={board.pinterest_board_id} value={board.pinterest_board_id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sidebar-status">{t('editPin.fieldStatus')}</Label>
          <Select
            value={currentStatus}
            onValueChange={(value) => setValue('status', value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="sidebar-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PIN_STATUS) as PinStatus[]).map((status) => {
                const selectable = isStatusSelectable(status)
                const isDisabledStatus = SYSTEM_MANAGED_STATUSES.includes(status) || status === 'deleted'
                return (
                  <SelectItem
                    key={status}
                    value={status}
                    disabled={isDisabledStatus}
                  >
                    <span className={isDisabledStatus ? 'opacity-50' : ''}>
                      <PinStatusBadge status={status} disabled={!selectable} />
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('common.saving') : t('pinSidebar.saveChanges')}
        </Button>
      </form>

      {/* Scheduling */}
      <div className="pt-4 border-t">
        <SchedulePinSection pin={pin} />
      </div>

      {/* AI Metadata section */}
      <div className="pt-4 border-t">
        <GenerateMetadataButton
          pin={pin}
          onHistoryOpen={() => setHistoryDialogOpen(true)}
          onRegenerateOpen={() => setFeedbackDialogOpen(true)}
        />
      </div>

      {/* Pinterest publishing */}
      <div className="pt-4 border-t space-y-2">
        <PublishPinButton
          pinId={pin.id}
          pinStatus={pin.status}
          hasPinterestConnection={connectionData?.connected ?? false}
          hasPinterestBoard={!!pin.pinterest_board_id}
          pinterestPinUrl={pin.pinterest_pin_url}
        />
      </div>

      {/* Article link */}
      {article && (
        <div className="pt-4 border-t">
          <h3 className="text-xs font-medium text-slate-500 uppercase mb-2">{t('pinSidebar.article')}</h3>
          <Link
            to="/projects/$projectId/articles/$articleId"
            params={{ projectId: pin.blog_project_id, articleId: article.id }}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
          >
            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="line-clamp-2">{article.title}</span>
          </Link>
        </div>
      )}

      {/* Actions footer */}
      <div className="pt-4 border-t space-y-3">
        <Link
          to="/projects/$projectId/pins/$pinId"
          params={{ projectId: pin.blog_project_id, pinId: pin.id }}
          className="w-full"
        >
          <Button variant="outline" className="w-full">
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('pinSidebar.openFullDetail')}
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={() => setDeleteDialogOpen(true)}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('common.delete')}
        </Button>
      </div>

      {/* Dialogs */}
      <MetadataHistoryDialog
        pinId={pin.id}
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
      />
      <RegenerateFeedbackDialog
        pinId={pin.id}
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
      />
      <DeletePinDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        pin={pin}
        onDeleted={onClose}
      />
    </>
  )
}

export function PinSidebar({ pinId, onClose }: PinSidebarProps) {
  const { t } = useTranslation()
  const { data: pin, isLoading } = usePin(pinId || '')
  const { data: boards } = usePinterestBoards(pin?.blog_project_id || '')
  const { data: article } = useArticle(pin?.blog_article_id || '')
  const { data: connectionData } = usePinterestConnection(pin?.blog_project_id || '')

  // Handle Escape key to close sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (pinId) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [pinId, onClose])

  // Don't render anything if no pin is selected
  if (!pinId) {
    return null
  }

  return createPortal(
    <div className="fixed right-0 inset-y-0 z-50 w-[420px] h-svh bg-white border-l border-slate-200 shadow-lg overflow-y-auto transition-transform duration-200">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t('pinSidebar.title')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <>
            <div className="h-[200px] bg-slate-100 rounded-lg animate-pulse" />
            <div className="space-y-3">
              <div className="h-4 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3" />
            </div>
          </>
        )}

        {/* Pin content — key forces remount so form + Radix Selects initialize with correct values */}
        {!isLoading && pin && (
          <PinSidebarForm
            key={pin.id}
            pin={pin}
            boards={boards}
            article={article}
            connectionData={connectionData}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

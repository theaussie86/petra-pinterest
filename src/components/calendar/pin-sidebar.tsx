import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, ExternalLink, Trash2, FileText } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { usePin, useUpdatePin, useBoards } from '@/lib/hooks/use-pins'
import { useArticle } from '@/lib/hooks/use-articles'
import { getPinImageUrl } from '@/lib/api/pins'
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
import { SchedulePinSection } from '@/components/pins/schedule-pin-section'
import { GenerateMetadataButton } from '@/components/pins/generate-metadata-button'
import { MetadataHistoryDialog } from '@/components/pins/metadata-history-dialog'
import { RegenerateFeedbackDialog } from '@/components/pins/regenerate-feedback-dialog'
import { DeletePinDialog } from '@/components/pins/delete-pin-dialog'
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
  board_id: z.string(),
  status: z.string(),
})

type EditPinFormData = z.infer<typeof editPinSchema>

export function PinSidebar({ pinId, onClose }: PinSidebarProps) {
  const { data: pin, isLoading } = usePin(pinId || '')
  const { data: boards } = useBoards(pin?.blog_project_id || '')
  const { data: article } = useArticle(pin?.blog_article_id || '')
  const updateMutation = useUpdatePin()

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const form = useForm<EditPinFormData>({
    resolver: zodResolver(editPinSchema),
    defaultValues: {
      title: '',
      description: '',
      alt_text: '',
      board_id: '',
      status: 'draft',
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form

  const currentStatus = watch('status')
  const currentBoardId = watch('board_id')

  // Reset form when pin changes
  useEffect(() => {
    if (pin) {
      reset({
        title: pin.title || '',
        description: pin.description || '',
        alt_text: pin.alt_text || '',
        board_id: pin.board_id || '',
        status: pin.status,
      })
    }
  }, [pin, reset])

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

  const onSubmit = async (data: EditPinFormData) => {
    if (!pin) return

    try {
      await updateMutation.mutateAsync({
        id: pin.id,
        title: data.title.trim() || null,
        description: data.description.trim() || null,
        alt_text: data.alt_text.trim() || null,
        board_id: data.board_id || null,
        status: data.status as PinStatus,
      })
      // Do NOT close sidebar after save - user stays to continue editing
    } catch (error) {
      // Error toast handled by mutation hook
      console.error('Failed to update pin:', error)
    }
  }

  // Determine which statuses are selectable
  const isStatusSelectable = (status: PinStatus): boolean => {
    if (ACTIVE_STATUSES.includes(status)) return true
    if (status === 'error') return true
    return false
  }

  // Don't render anything if no pin is selected
  if (!pinId) {
    return null
  }

  return (
    <>
      {/* Fixed sidebar */}
      <div className="fixed right-0 top-16 z-40 w-[350px] h-[calc(100vh-64px)] bg-white border-l border-slate-200 shadow-lg overflow-y-auto transition-transform duration-200">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Pin Details</h2>
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

          {/* Pin content */}
          {!isLoading && pin && (
            <>
              {/* Pin image */}
              <div className="rounded-lg bg-slate-100 overflow-hidden">
                <img
                  src={getPinImageUrl(pin.image_path)}
                  alt={pin.title || 'Pin image'}
                  className="max-h-[200px] w-full object-contain"
                />
              </div>

              {/* Inline edit form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sidebar-title">Title</Label>
                  <Input
                    id="sidebar-title"
                    {...register('title')}
                    placeholder="Pin title"
                    disabled={isSubmitting}
                  />
                  {errors.title && (
                    <p className="text-sm text-red-600">{errors.title.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sidebar-description">Description</Label>
                  <Textarea
                    id="sidebar-description"
                    {...register('description')}
                    placeholder="Pin description"
                    disabled={isSubmitting}
                    rows={3}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sidebar-alt-text">Alt Text</Label>
                  <Textarea
                    id="sidebar-alt-text"
                    {...register('alt_text')}
                    placeholder="Describe the image for accessibility"
                    disabled={isSubmitting}
                    rows={2}
                  />
                  {errors.alt_text && (
                    <p className="text-sm text-red-600">{errors.alt_text.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sidebar-board">Board</Label>
                  <Select
                    value={currentBoardId}
                    onValueChange={(value) => setValue('board_id', value === '__none__' ? '' : value)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="sidebar-board">
                      <SelectValue placeholder="Select a board" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not assigned</SelectItem>
                      {boards?.map((board) => (
                        <SelectItem key={board.id} value={board.id}>
                          {board.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sidebar-status">Status</Label>
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
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>

              {/* Schedule section */}
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

              {/* Article link */}
              {article && (
                <div className="pt-4 border-t">
                  <h3 className="text-xs font-medium text-slate-500 uppercase mb-2">Article</h3>
                  <Link
                    to="/articles/$articleId"
                    params={{ articleId: article.id }}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="line-clamp-2">{article.title}</span>
                  </Link>
                </div>
              )}

              {/* Actions footer */}
              <div className="pt-4 border-t space-y-2">
                <Link
                  to="/pins/$pinId"
                  params={{ pinId: pin.id }}
                  className="w-full"
                >
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Full Detail
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {pin && (
        <>
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
          <DeletePinDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            pin={pin}
            onDeleted={onClose}
          />
        </>
      )}
    </>
  )
}

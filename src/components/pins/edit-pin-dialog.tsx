import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { useUpdatePin, useBoards } from '@/lib/hooks/use-pins'
import {
  PIN_STATUS,
  ACTIVE_STATUSES,
  SYSTEM_MANAGED_STATUSES,
} from '@/types/pins'
import type { Pin, PinStatus } from '@/types/pins'

const editPinSchema = z.object({
  title: z.string().max(200, 'Title too long'),
  description: z.string().max(1000, 'Description too long'),
  alt_text: z.string().max(500, 'Alt text too long'),
  board_id: z.string(),
  status: z.string(),
})

type EditPinFormData = z.infer<typeof editPinSchema>

interface EditPinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pin: Pin
  projectId: string
}

export function EditPinDialog({ open, onOpenChange, pin, projectId }: EditPinDialogProps) {
  const updateMutation = useUpdatePin()
  const { data: boards } = useBoards(projectId)

  const form = useForm<EditPinFormData>({
    resolver: zodResolver(editPinSchema),
    defaultValues: {
      title: '',
      description: '',
      alt_text: '',
      board_id: '',
      status: 'entwurf',
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

  // Reset form when dialog opens or pin changes
  useEffect(() => {
    if (open) {
      reset({
        title: pin.title || '',
        description: pin.description || '',
        alt_text: pin.alt_text || '',
        board_id: pin.board_id || '',
        status: pin.status,
      })
    }
  }, [open, pin, reset])

  const onSubmit = async (data: EditPinFormData) => {
    try {
      await updateMutation.mutateAsync({
        id: pin.id,
        title: data.title.trim() || null,
        description: data.description.trim() || null,
        alt_text: data.alt_text.trim() || null,
        board_id: data.board_id || null,
        status: data.status as PinStatus,
      })
      onOpenChange(false)
    } catch (error) {
      // Error toast handled by mutation hook
      console.error('Failed to update pin:', error)
    }
  }

  // Determine which statuses are selectable
  const isStatusSelectable = (status: PinStatus): boolean => {
    if (ACTIVE_STATUSES.includes(status)) return true
    if (status === 'fehler') return true
    return false
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Pin</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              {...register('title')}
              placeholder="Pin title"
              disabled={isSubmitting}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              {...register('description')}
              placeholder="Pin description"
              disabled={isSubmitting}
              rows={4}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-alt-text">Alt Text</Label>
            <Textarea
              id="edit-alt-text"
              {...register('alt_text')}
              placeholder="Describe the image for accessibility"
              disabled={isSubmitting}
              rows={3}
            />
            {errors.alt_text && (
              <p className="text-sm text-red-600">{errors.alt_text.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-board">Board</Label>
            <Select
              value={currentBoardId}
              onValueChange={(value) => setValue('board_id', value === '__none__' ? '' : value)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="edit-board">
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
            <Label htmlFor="edit-status">Status</Label>
            <Select
              value={currentStatus}
              onValueChange={(value) => setValue('status', value)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PIN_STATUS) as PinStatus[]).map((status) => {
                  const selectable = isStatusSelectable(status)
                  const isDisabledStatus = SYSTEM_MANAGED_STATUSES.includes(status) || status === 'loeschen'
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Update'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

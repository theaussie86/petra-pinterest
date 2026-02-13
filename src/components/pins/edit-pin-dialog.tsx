import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { AlertTriangle, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdatePin } from '@/lib/hooks/use-pins'
import { usePinterestBoards, usePinterestConnection } from '@/lib/hooks/use-pinterest-connection'
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
  pinterest_board_id: z.string(),
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
  const { t } = useTranslation()
  const [boardPopoverOpen, setBoardPopoverOpen] = useState(false)
  const updateMutation = useUpdatePin()
  const { data: connectionData } = usePinterestConnection(projectId)
  const isConnected = connectionData?.connected === true && connectionData?.connection?.is_active !== false
  const { data: boards } = usePinterestBoards(projectId)

  const form = useForm<EditPinFormData>({
    resolver: zodResolver(editPinSchema),
    defaultValues: {
      title: '',
      description: '',
      alt_text: '',
      pinterest_board_id: '',
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
  const currentBoardId = watch('pinterest_board_id')

  // Reset form when dialog opens or pin changes
  useEffect(() => {
    if (open) {
      reset({
        title: pin.title || '',
        description: pin.description || '',
        alt_text: pin.alt_text || '',
        pinterest_board_id: pin.pinterest_board_id || '__none__',
        status: pin.status,
      })
    }
  }, [open, pin, reset])

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
        pinterest_board_id: selectedBoard?.pinterest_board_id || null,
        pinterest_board_name: selectedBoard?.name || null,
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
    if (status === 'error') return true
    return false
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editPin.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">{t('editPin.fieldTitle')}</Label>
            <Input
              id="edit-title"
              {...register('title')}
              placeholder={t('editPin.placeholderTitle')}
              disabled={isSubmitting}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">{t('editPin.fieldDescription')}</Label>
            <Textarea
              id="edit-description"
              {...register('description')}
              placeholder={t('editPin.placeholderDescription')}
              disabled={isSubmitting}
              rows={4}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-alt-text">{t('editPin.fieldAltText')}</Label>
            <Textarea
              id="edit-alt-text"
              {...register('alt_text')}
              placeholder={t('editPin.placeholderAltText')}
              disabled={isSubmitting}
              rows={3}
            />
            {errors.alt_text && (
              <p className="text-sm text-red-600">{errors.alt_text.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-board">{t('editPin.fieldBoard')}</Label>
            {!isConnected && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('editPin.pinterestNotConnected')}
                </AlertDescription>
              </Alert>
            )}
            <Popover open={boardPopoverOpen} onOpenChange={setBoardPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={boardPopoverOpen}
                  className="w-full justify-between font-normal"
                  disabled={!isConnected || isSubmitting}
                >
                  {currentBoardId && currentBoardId !== '__none__' ? (
                    <span className="truncate">
                      {boards?.find((b) => b.pinterest_board_id === currentBoardId)?.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t('common.notAssigned')}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('editPin.searchBoard')} />
                  <CommandList>
                    <CommandEmpty>{t('editPin.noBoardsFound')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value={t('common.notAssigned')}
                        onSelect={() => {
                          setValue('pinterest_board_id', '__none__')
                          setBoardPopoverOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            currentBoardId === '__none__' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {t('common.notAssigned')}
                      </CommandItem>
                      {boards?.map((board) => (
                        <CommandItem
                          key={board.pinterest_board_id}
                          value={board.name}
                          onSelect={() => {
                            setValue('pinterest_board_id', board.pinterest_board_id)
                            setBoardPopoverOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              currentBoardId === board.pinterest_board_id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {board.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">{t('editPin.fieldStatus')}</Label>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('common.saving') : t('common.update')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

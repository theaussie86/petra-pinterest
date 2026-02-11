import { Trans, useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDeletePin } from '@/lib/hooks/use-pins'
import type { Pin } from '@/types/pins'

interface DeletePinDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pin: Pin
  onDeleted?: () => void
}

export function DeletePinDialog({ open, onOpenChange, pin, onDeleted }: DeletePinDialogProps) {
  const { t } = useTranslation()
  const deleteMutation = useDeletePin()

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(pin.id)
      onOpenChange(false)
      onDeleted?.()
    } catch (error) {
      // Error toast handled by mutation hook
      console.error('Failed to delete pin:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deletePin.title')}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="deletePin.message"
              values={{ title: pin.title || t('common.untitled') }}
              components={{ strong: <strong /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

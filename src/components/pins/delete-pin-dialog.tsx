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
          <DialogTitle>Delete Pin</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <strong>{pin.title || 'Untitled'}</strong>? The associated image
            will also be removed from storage. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

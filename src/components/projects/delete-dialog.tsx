import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDeleteBlogProject } from '@/lib/hooks/use-blog-projects'
import type { BlogProject } from '@/types/blog-projects'

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: BlogProject | null
  onDeleted?: () => void
}

export function DeleteDialog({ open, onOpenChange, project, onDeleted }: DeleteDialogProps) {
  const deleteMutation = useDeleteBlogProject()

  const handleDelete = async () => {
    if (!project) return

    try {
      await deleteMutation.mutateAsync(project.id)
      onOpenChange(false)
      onDeleted?.()
    } catch (error) {
      // Error toast is handled by the mutation hook
      console.error('Failed to delete project:', error)
    }
  }

  if (!project) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be
            undone.
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

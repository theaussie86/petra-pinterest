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
import { useDeleteBlogProject } from '@/lib/hooks/use-blog-projects'
import type { BlogProject } from '@/types/blog-projects'

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: BlogProject | null
  onDeleted?: () => void
}

export function DeleteDialog({ open, onOpenChange, project, onDeleted }: DeleteDialogProps) {
  const { t } = useTranslation()
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
          <DialogTitle>{t('deleteProject.title')}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="deleteProject.message"
              values={{ name: project.name }}
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

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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAddArticle } from '@/lib/hooks/use-articles'

const articleSchema = z.object({
  url: z
    .string()
    .min(1, 'URL is required')
    .refine(
      (url) => {
        try {
          const parsed = new URL(url)
          return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: 'Must be a valid URL starting with http:// or https://' }
    ),
})

type ArticleFormData = {
  url: string
}

interface AddArticleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function AddArticleDialog({ open, onOpenChange, projectId }: AddArticleDialogProps) {
  const addMutation = useAddArticle()

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      url: '',
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setError,
  } = form

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset()
    }
  }, [open, reset])

  const onSubmit = async (data: ArticleFormData) => {
    try {
      await addMutation.mutateAsync({
        projectId,
        url: data.url,
      })
      onOpenChange(false)
    } catch (error) {
      setError('url', {
        message: 'Failed to add article. Please check the URL and try again.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Article</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Article URL *</Label>
            <Input
              id="url"
              {...register('url')}
              placeholder="https://example.com/article"
              disabled={isSubmitting}
            />
            {errors.url && (
              <p className="text-sm text-red-600">{errors.url.message}</p>
            )}
            <p className="text-xs text-slate-500">
              Enter the URL of the article you want to add. It will be scraped automatically.
            </p>
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
              {isSubmitting ? 'Adding...' : 'Add Article'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

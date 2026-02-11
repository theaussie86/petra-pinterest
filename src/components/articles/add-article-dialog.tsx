import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        message: t('addArticle.errorAddFailed'),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addArticle.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">{t('addArticle.fieldUrl')}</Label>
            <Input
              id="url"
              {...register('url')}
              placeholder={t('addArticle.placeholderUrl')}
              disabled={isSubmitting}
            />
            {errors.url && (
              <p className="text-sm text-red-600">{errors.url.message}</p>
            )}
            <p className="text-xs text-slate-500">
              {t('addArticle.hint')}
            </p>
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
              {isSubmitting ? t('addArticle.adding') : t('addArticle.addButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

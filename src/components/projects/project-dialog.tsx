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

import { useCreateBlogProject } from '@/lib/hooks/use-blog-projects'

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  blog_url: z.string().url('Must be a valid URL'),
  sitemap_url: z.string().optional(),
  scraping_frequency: z.enum(['daily', 'weekly', 'manual']),
})

type ProjectFormData = {
  name: string
  blog_url: string
  sitemap_url?: string
  scraping_frequency: 'daily' | 'weekly' | 'manual'
}

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectDialog({ open, onOpenChange }: ProjectDialogProps) {
  const { t } = useTranslation()
  const createMutation = useCreateBlogProject()

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      blog_url: '',
      sitemap_url: '',
      scraping_frequency: 'weekly',
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form



  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (!open) {
      reset({
        name: '',
        blog_url: '',
        sitemap_url: '',
        scraping_frequency: 'weekly',
      })
    }
  }, [open, reset])

  const onSubmit = async (data: ProjectFormData) => {
    // Validate sitemap URL if provided
    if (data.sitemap_url && data.sitemap_url.trim() !== '') {
      try {
        new URL(data.sitemap_url)
      } catch {
        form.setError('sitemap_url', { message: 'Must be a valid URL' })
        return
      }
    }

    try {
      await createMutation.mutateAsync({
        name: data.name,
        blog_url: data.blog_url,
      })
      onOpenChange(false)
    } catch (error) {
      // Error toast is handled by the mutation hooks
      console.error('Failed to save project:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('projectDialog.titleCreate')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('projectDialog.fieldName')}</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder={t('projectDialog.placeholderName')}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="blog_url">{t('projectDialog.fieldBlogUrl')}</Label>
            <Input
              id="blog_url"
              {...register('blog_url')}
              placeholder={t('projectDialog.placeholderBlogUrl')}
              disabled={isSubmitting}
            />
            {errors.blog_url && (
              <p className="text-sm text-red-600">{errors.blog_url.message}</p>
            )}
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
              {isSubmitting ? t('common.saving') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

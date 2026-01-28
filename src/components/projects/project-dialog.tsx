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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateBlogProject, useUpdateBlogProject } from '@/lib/hooks/use-blog-projects'
import type { BlogProject } from '@/types/blog-projects'

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
  project?: BlogProject
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const isEditMode = !!project
  const createMutation = useCreateBlogProject()
  const updateMutation = useUpdateBlogProject()

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
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form

  const scrapingFrequency = watch('scraping_frequency')

  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (open && project) {
      reset({
        name: project.name,
        blog_url: project.blog_url,
        sitemap_url: project.sitemap_url || '',
        scraping_frequency: project.scraping_frequency,
      })
    } else if (!open) {
      reset({
        name: '',
        blog_url: '',
        sitemap_url: '',
        scraping_frequency: 'weekly',
      })
    }
  }, [open, project, reset])

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
      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: project.id,
          name: data.name,
          blog_url: data.blog_url,
          sitemap_url: data.sitemap_url && data.sitemap_url.trim() !== '' ? data.sitemap_url : null,
          scraping_frequency: data.scraping_frequency,
        })
      } else {
        await createMutation.mutateAsync({
          name: data.name,
          blog_url: data.blog_url,
        })
      }
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
          <DialogTitle>{isEditMode ? 'Edit Project' : 'Create Project'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="My Blog"
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="blog_url">Blog URL *</Label>
            <Input
              id="blog_url"
              {...register('blog_url')}
              placeholder="https://myblog.com"
              disabled={isSubmitting}
            />
            {errors.blog_url && (
              <p className="text-sm text-red-600">{errors.blog_url.message}</p>
            )}
          </div>

          {isEditMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sitemap_url">Sitemap URL</Label>
                <Input
                  id="sitemap_url"
                  {...register('sitemap_url')}
                  placeholder="https://myblog.com/sitemap.xml"
                  disabled={isSubmitting}
                />
                {errors.sitemap_url && (
                  <p className="text-sm text-red-600">{errors.sitemap_url.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraping_frequency">Scraping Frequency</Label>
                <Select
                  value={scrapingFrequency}
                  onValueChange={(value) =>
                    setValue('scraping_frequency', value as 'daily' | 'weekly' | 'manual')
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="scraping_frequency">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

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
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useUpdateBlogProject } from '@/lib/hooks/use-blog-projects'
import type { BlogProject, BlogProjectUpdate } from '@/types/blog-projects'

export type FieldConfig = {
  key: keyof BlogProjectUpdate
  labelKey: string
  placeholderKey?: string
  type: 'input' | 'textarea' | 'frequency-select'
}

interface ProjectSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: BlogProject
  title: string
  fields: FieldConfig[]
}

export function ProjectSectionDialog({
  open,
  onOpenChange,
  project,
  title,
  fields,
}: ProjectSectionDialogProps) {
  const { t } = useTranslation()
  const updateMutation = useUpdateBlogProject()
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {}
      for (const field of fields) {
        const val = project[field.key as keyof BlogProject]
        initial[field.key] = typeof val === 'string' ? val : ''
      }
      setValues(initial)
    }
  }, [open, project, fields])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const updates: BlogProjectUpdate = { id: project.id }
    for (const field of fields) {
      if (field.key === 'id') continue
      const val = values[field.key]?.trim()
      if (field.type === 'frequency-select') {
        ;(updates as Record<string, unknown>)[field.key] = val || 'manual'
      } else {
        ;(updates as Record<string, unknown>)[field.key] = val || null
      }
    }

    try {
      await updateMutation.mutateAsync(updates)
      onOpenChange(false)
    } catch {
      // Error toast handled by mutation hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`section-${field.key}`}>{t(field.labelKey)}</Label>

              {field.type === 'input' && (
                <Input
                  id={`section-${field.key}`}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                  disabled={updateMutation.isPending}
                />
              )}

              {field.type === 'textarea' && (
                <Textarea
                  id={`section-${field.key}`}
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                  disabled={updateMutation.isPending}
                  rows={3}
                />
              )}

              {field.type === 'frequency-select' && (
                <Select
                  value={values[field.key] || 'manual'}
                  onValueChange={(val) =>
                    setValues((prev) => ({ ...prev, [field.key]: val }))
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger id={`section-${field.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('projectDialog.frequencyDaily')}</SelectItem>
                    <SelectItem value="weekly">{t('projectDialog.frequencyWeekly')}</SelectItem>
                    <SelectItem value="manual">{t('projectDialog.frequencyManual')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

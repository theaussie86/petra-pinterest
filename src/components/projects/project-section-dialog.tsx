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
import { ChevronsUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateBlogProject } from '@/lib/hooks/use-blog-projects'
import type { BlogProject, BlogProjectUpdate } from '@/types/blog-projects'

export type FieldConfig = {
  key: keyof BlogProjectUpdate
  labelKey: string
  placeholderKey?: string
  type: 'input' | 'textarea' | 'frequency-select' | 'language-combobox'
}

const LANGUAGE_OPTIONS = [
  { label: 'Deutsch', value: 'German' },
  { label: 'English', value: 'English' },
  { label: 'Français', value: 'French' },
  { label: 'Italiano', value: 'Italian' },
  { label: 'Español', value: 'Spanish' },
]

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
  const [langComboOpen, setLangComboOpen] = useState(false)
  const [langComboSearch, setLangComboSearch] = useState('')

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {}
      for (const field of fields) {
        const val = project[field.key as keyof BlogProject]
        initial[field.key] = typeof val === 'string' ? val : ''
      }
      setValues(initial)
      setLangComboSearch('')
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

  const handleLangSelect = (value: string) => {
    setValues((prev) => ({ ...prev, language: value }))
    setLangComboSearch('')
    setLangComboOpen(false)
  }

  const handleLangCustomSelect = () => {
    if (langComboSearch.trim()) {
      setValues((prev) => ({ ...prev, language: langComboSearch.trim() }))
      setLangComboSearch('')
      setLangComboOpen(false)
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

              {field.type === 'language-combobox' && (
                <div className="space-y-1.5">
                  <Popover open={langComboOpen} onOpenChange={setLangComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id={`section-${field.key}`}
                        variant="outline"
                        role="combobox"
                        aria-expanded={langComboOpen}
                        className="w-full justify-between font-normal"
                        disabled={updateMutation.isPending}
                        type="button"
                      >
                        <span className={cn(!values[field.key] && 'text-muted-foreground')}>
                          {values[field.key] ||
                            (field.placeholderKey ? t(field.placeholderKey) : t('projectBranding.languageCustomPlaceholder'))}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t('projectBranding.languageCustomPlaceholder')}
                          value={langComboSearch}
                          onValueChange={setLangComboSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {langComboSearch.trim() && (
                              <button
                                type="button"
                                className="w-full px-4 py-2 text-sm text-left hover:bg-accent cursor-pointer"
                                onClick={handleLangCustomSelect}
                              >
                                {t('projectBranding.languageUseCustom', { value: langComboSearch.trim() })}
                              </button>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {LANGUAGE_OPTIONS.map((option) => (
                              <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => handleLangSelect(option.value)}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    values[field.key] === option.value
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                {option.label}
                              </CommandItem>
                            ))}
                            {langComboSearch.trim() &&
                              !LANGUAGE_OPTIONS.some(
                                (o) =>
                                  o.label.toLowerCase() === langComboSearch.trim().toLowerCase() ||
                                  o.value.toLowerCase() === langComboSearch.trim().toLowerCase()
                              ) && (
                                <CommandItem
                                  key="__custom__"
                                  value={`__custom__${langComboSearch}`}
                                  onSelect={handleLangCustomSelect}
                                >
                                  <Check className="mr-2 h-4 w-4 opacity-0" />
                                  {t('projectBranding.languageUseCustom', { value: langComboSearch.trim() })}
                                </CommandItem>
                              )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">{t('projectBranding.languageHint')}</p>
                </div>
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

import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TemplateStatusBadge } from './template-status-badge'
import type { PinTemplate } from '@/types/pin-templates'

interface WorkshopTemplateListProps {
  templates: PinTemplate[]
}

/**
 * The first (overlay) line of a template, used as a compact preview in the list.
 */
function overlayPreview(overlay: string | null): string {
  if (!overlay) return ''
  return overlay.split('\n')[0] ?? ''
}

export function WorkshopTemplateList({ templates }: WorkshopTemplateListProps) {
  const { t } = useTranslation()

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t('workshop.noTemplates')}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">{t('workshop.col.position')}</TableHead>
          <TableHead>{t('workshop.col.pinType')}</TableHead>
          <TableHead>{t('workshop.col.title')}</TableHead>
          <TableHead>{t('workshop.col.overlay')}</TableHead>
          <TableHead>{t('workshop.col.status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => (
          <TableRow key={template.id}>
            <TableCell className="font-mono text-muted-foreground">{template.position}</TableCell>
            <TableCell>{template.pin_type ?? '—'}</TableCell>
            <TableCell className="max-w-xs truncate">{template.title ?? '—'}</TableCell>
            <TableCell className="max-w-xs truncate text-muted-foreground">
              {overlayPreview(template.overlay) || '—'}
            </TableCell>
            <TableCell>
              <TemplateStatusBadge status={template.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

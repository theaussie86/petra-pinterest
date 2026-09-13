import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getTemplateStatusBadgeClasses } from '@/types/pin-templates'
import type { PinTemplateStatus } from '@/types/pin-templates'

interface TemplateStatusBadgeProps {
  status: PinTemplateStatus
}

export function TemplateStatusBadge({ status }: TemplateStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        getTemplateStatusBadgeClasses(status),
      )}
    >
      {t('pinTemplateStatus.' + status)}
    </span>
  )
}

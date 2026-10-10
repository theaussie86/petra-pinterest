import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { PinPublishEventType } from '@/types/pins'

// Badge colour per publish event type (issue #110/#111): attempt_started
// neutral, succeeded green, retry_scheduled yellow, failed_final red, mail_sent
// blue. Shared by the pin-detail history and the global log so both read alike.
export const EVENT_BADGE_CLASSES: Record<PinPublishEventType, string> = {
  attempt_started: 'bg-slate-100 text-slate-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  retry_scheduled: 'bg-amber-100 text-amber-800',
  failed_final: 'bg-red-100 text-red-700',
  mail_sent: 'bg-blue-100 text-blue-700',
}

export function PublishEventBadge({ type }: { type: PinPublishEventType }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        EVENT_BADGE_CLASSES[type],
      )}
    >
      {t(`publishHistory.eventType.${type}`)}
    </span>
  )
}

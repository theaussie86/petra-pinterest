import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import { getPinImageUrl } from '@/lib/api/pins'
import type { Pin } from '@/types/pins'

interface ArticlePinCardProps {
  pin: Pin
  projectId: string
}

export function ArticlePinCard({ pin, projectId }: ArticlePinCardProps) {
  const { t, i18n } = useTranslation()

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const dateLabel = pin.published_at
    ? t('articleDetail.publishedAt', { date: formatDate(pin.published_at) })
    : pin.scheduled_at
      ? t('articleDetail.scheduledAt', { date: formatDate(pin.scheduled_at) })
      : null

  return (
    <Link
      to="/projects/$projectId/pins/$pinId"
      params={{ projectId, pinId: pin.id }}
      className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
        <img
          src={getPinImageUrl(pin.image_path)}
          alt={pin.title || 'Pin image'}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium truncate', !pin.title && 'italic text-muted-foreground')}>
          {pin.title || t('common.untitled')}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PinStatusBadge status={pin.status} />
          {dateLabel && (
            <span className="text-xs text-muted-foreground">{dateLabel}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

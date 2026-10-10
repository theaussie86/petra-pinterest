import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePinPublishEvents } from '@/lib/hooks/use-pin-publish-events'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import { PublishEventBadge } from '@/components/pins/publish-event-badge'
import { formatDateTime } from '@/lib/format'
import type { PinPublishEvent } from '@/types/pins'

interface PublishHistoryProps {
  pinId: string
}

export function PublishHistory({ pinId }: PublishHistoryProps) {
  const { t, i18n } = useTranslation()
  const { data: events, isLoading } = usePinPublishEvents(pinId)

  // Live updates: a new publish event (INSERT) for this pin refetches the list
  // without a reload. If Realtime is unavailable the query still refetches when
  // the detail page mounts (staleTime fallback).
  useRealtimeInvalidation(
    `pin-publish-events:${pinId}`,
    { event: 'INSERT', table: 'pin_publish_events', filter: `pin_id=eq.${pinId}` },
    [['pin-publish-events', pinId]],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('publishHistory.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">{t('publishHistory.empty')}</p>
        ) : (
          <ol className="space-y-4">
            {events.map((event) => (
              <PublishEventItem key={event.id} event={event} language={i18n.language} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function PublishEventItem({
  event,
  language,
}: {
  event: PinPublishEvent
  language: string
}) {
  const { t } = useTranslation()
  const nextRetryAt = getNextRetryAt(event)

  return (
    <li className="border-l-2 border-slate-200 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <PublishEventBadge type={event.event_type} />
        <time className="text-xs text-slate-500" dateTime={event.created_at}>
          {formatDateTime(event.created_at, language)}
        </time>
        {event.attempt != null && event.max_attempts != null && (
          <span className="text-xs text-slate-500">
            {t('publishHistory.attempt', {
              attempt: event.attempt,
              max: event.max_attempts,
            })}
          </span>
        )}
      </div>

      {event.message && (
        <p className="mt-1 text-sm text-slate-700">{event.message}</p>
      )}

      {nextRetryAt && (
        <p className="mt-1 text-xs text-slate-600">
          {t('publishHistory.nextRetry', {
            relative: formatRelative(nextRetryAt, language),
            absolute: formatDateTime(nextRetryAt, language),
          })}
        </p>
      )}

      {hasDetails(event.details) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
            {t('publishHistory.showDetails')}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
            {JSON.stringify(event.details, null, 2)}
          </pre>
        </details>
      )}
    </li>
  )
}

// The next-retry timestamp only exists on retry_scheduled events, and only
// when the worker recorded it as an ISO string in details.
function getNextRetryAt(event: PinPublishEvent): string | null {
  if (event.event_type !== 'retry_scheduled') return null
  const value = event.details?.next_retry_at
  return typeof value === 'string' ? value : null
}

function hasDetails(details: Record<string, unknown> | null | undefined): boolean {
  return !!details && Object.keys(details).length > 0
}

// Relative time ("in 5 Minuten" / "vor 2 Stunden") via Intl.RelativeTimeFormat.
function formatRelative(dateString: string, language: string): string {
  const diffMs = new Date(dateString).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
    numeric: 'auto',
  })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit)
    }
  }
  // Less than a minute away: fall back to minute granularity ("in 0 Minuten").
  return rtf.format(Math.round(diffMs / 60000), 'minute')
}

import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { subDays, subHours } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import { PublishEventBadge } from '@/components/pins/publish-event-badge'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { usePublishEvents, type PublishEventsFilters } from '@/lib/hooks/use-publish-events'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import type { PinPublishEventType, PublishLogEvent } from '@/types/pins'
import { PUBLISH_ERROR_EVENT_TYPES } from '@/types/pins'

export type PublishLogTimeRange = '24h' | '7d' | '30d' | '90d' | 'all'

const TIME_RANGES: PublishLogTimeRange[] = ['24h', '7d', '30d', '90d', 'all']

// The event types offered for the multi-select, in display order.
const EVENT_TYPES: PinPublishEventType[] = [
  'attempt_started',
  'succeeded',
  'retry_scheduled',
  'failed_final',
  'mail_sent',
]

export interface PublishLogUiState {
  projectId: string // 'all' or a project id
  selectedTypes: PinPublishEventType[]
  onlyErrors: boolean
  timeRange: PublishLogTimeRange
}

/**
 * Turn the filter-bar UI state into the query filters the log hook takes
 * (issue #111). "Only errors" overrides the manual event-type selection with
 * the error set; the time range becomes a `createdAfter` lower bound. Pure so
 * the filter logic is unit-testable without driving the Radix controls.
 */
export function resolvePublishEventFilters(
  ui: PublishLogUiState,
  now: Date = new Date(),
): PublishEventsFilters {
  const eventTypes = ui.onlyErrors
    ? PUBLISH_ERROR_EVENT_TYPES
    : ui.selectedTypes.length > 0
      ? ui.selectedTypes
      : undefined

  return {
    projectId: ui.projectId === 'all' ? undefined : ui.projectId,
    eventTypes,
    createdAfter: timeRangeStart(ui.timeRange, now),
  }
}

function timeRangeStart(range: PublishLogTimeRange, now: Date): Date | undefined {
  switch (range) {
    case '24h':
      return subHours(now, 24)
    case '7d':
      return subDays(now, 7)
    case '30d':
      return subDays(now, 30)
    case '90d':
      return subDays(now, 90)
    case 'all':
      return undefined
  }
}

export function PublishLog() {
  const { t, i18n } = useTranslation()
  const [projectId, setProjectId] = useState('all')
  const [selectedTypes, setSelectedTypes] = useState<PinPublishEventType[]>([])
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [timeRange, setTimeRange] = useState<PublishLogTimeRange>('30d')

  // Only the caller's own projects are offered in the dropdown; RLS already
  // scopes the events themselves to the tenant.
  const { data: projects } = useBlogProjects()
  const projectNameById = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p.name])),
    [projects],
  )

  const filters = resolvePublishEventFilters({
    projectId,
    selectedTypes,
    onlyErrors,
    timeRange,
  })

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePublishEvents(filters)

  // Live updates: any new publish event refetches the active (filtered) view
  // via the ['publish-events'] prefix, so new rows appear at the top without
  // clearing the filters. A row that doesn't match the current filters simply
  // doesn't surface.
  useRealtimeInvalidation(
    'publish-log',
    { event: 'INSERT', table: 'pin_publish_events' },
    [['publish-events']],
  )

  const events = data?.pages.flatMap((page) => page.events) ?? []

  const toggleType = (type: PinPublishEventType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('publishLog.filters.allProjects')}</SelectItem>
            {(projects ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={timeRange}
          onValueChange={(value) => setTimeRange(value as PublishLogTimeRange)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((range) => (
              <SelectItem key={range} value={range}>
                {t(`publishLog.filters.timeRange.${range}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Event-type multi-select as toggle chips. Disabled while "only
            errors" is active, since that overrides the selection. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {EVENT_TYPES.map((type) => {
            const active = !onlyErrors && selectedTypes.includes(type)
            return (
              <button
                key={type}
                type="button"
                disabled={onlyErrors}
                onClick={() => toggleType(type)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-violet-300 bg-violet-100 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  onlyErrors && 'opacity-40',
                )}
              >
                {t(`publishHistory.eventType.${type}`)}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setOnlyErrors((v) => !v)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
            onlyErrors
              ? 'border-red-300 bg-red-100 text-red-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
          aria-pressed={onlyErrors}
        >
          {t('publishLog.filters.onlyErrors')}
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : events.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">{t('publishLog.empty')}</p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('publishLog.columns.time')}</TableHead>
                  <TableHead>{t('publishLog.columns.project')}</TableHead>
                  <TableHead>{t('publishLog.columns.pin')}</TableHead>
                  <TableHead>{t('publishLog.columns.event')}</TableHead>
                  <TableHead>{t('publishLog.columns.attempt')}</TableHead>
                  <TableHead>{t('publishLog.columns.message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <PublishLogRow
                    key={event.id}
                    event={event}
                    projectName={projectNameById.get(event.blog_project_id)}
                    language={i18n.language}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('publishLog.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PublishLogRow({
  event,
  projectName,
  language,
}: {
  event: PublishLogEvent
  projectName: string | undefined
  language: string
}) {
  const { t } = useTranslation()

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-slate-500">
        {formatDateTime(event.created_at, language)}
      </TableCell>
      <TableCell className="text-sm text-slate-700">
        {projectName ?? '—'}
      </TableCell>
      <TableCell className="text-sm">
        <Link
          to="/projects/$projectId/pins/$pinId"
          params={{ projectId: event.blog_project_id, pinId: event.pin_id }}
          className="text-violet-600 hover:underline"
        >
          {event.pin?.title || t('publishLog.untitledPin')}
        </Link>
      </TableCell>
      <TableCell>
        <PublishEventBadge type={event.event_type} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-slate-500">
        {event.attempt != null && event.max_attempts != null
          ? t('publishHistory.attempt', { attempt: event.attempt, max: event.max_attempts })
          : '—'}
      </TableCell>
      <TableCell className="text-sm text-slate-700">{event.message || '—'}</TableCell>
    </TableRow>
  )
}

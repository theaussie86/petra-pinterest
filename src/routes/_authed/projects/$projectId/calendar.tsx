import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { usePins } from '@/lib/hooks/use-pins'
import { PIN_STATUS, getStatusBadgeClasses } from '@/types/pins'
import type { PinStatus } from '@/types/pins'
import { cn } from '@/lib/utils'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { PinSidebar } from '@/components/calendar/pin-sidebar'
import { UnscheduledPinsList } from '@/components/calendar/unscheduled-pins-list'

// Search params validation schema
type CalendarSearch = {
  statuses?: string[]
  tab?: 'calendar' | 'unscheduled'
  view?: 'month' | 'week'
}

export const Route = createFileRoute('/_authed/projects/$projectId/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    return {
      statuses: Array.isArray(search.statuses)
        ? search.statuses.filter((s): s is string => typeof s === 'string')
        : undefined,
      tab:
        search.tab === 'calendar' || search.tab === 'unscheduled'
          ? search.tab
          : 'calendar',
      view:
        search.view === 'month' || search.view === 'week'
          ? search.view
          : 'month',
    }
  },
  component: CalendarPage,
})

function CalendarPage() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: Route.fullPath })
  const { projectId } = Route.useParams()
  const searchParams = Route.useSearch()

  const { data: pins, isLoading } = usePins(projectId)

  const { statuses, tab, view } = searchParams

  // Sidebar state
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  // Filter by statuses
  const filteredPins = useMemo(() => {
    if (!pins) return []

    if (statuses && statuses.length > 0) {
      return pins.filter((pin) => statuses.includes(pin.status))
    }

    return pins
  }, [pins, statuses])

  // Split into scheduled and unscheduled
  const scheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at !== null),
    [filteredPins]
  )

  const unscheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at === null),
    [filteredPins]
  )

  // Handle status chip toggle
  const handleStatusToggle = (status: PinStatus) => {
    const currentStatuses = statuses || []
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status]

    navigate({
      search: (prev) => ({
        ...prev,
        statuses: newStatuses.length > 0 ? newStatuses : undefined,
      }),
    })
  }

  // Handle tab change
  const handleTabChange = (newTab: 'calendar' | 'unscheduled') => {
    navigate({
      search: (prev) => ({
        ...prev,
        tab: newTab,
      }),
    })
  }

  // Handle view change
  const handleViewChange = (newView: 'month' | 'week') => {
    navigate({
      search: (prev) => ({
        ...prev,
        view: newView,
      }),
    })
  }

  // Handle pin click - open sidebar
  const handlePinClick = (pinId: string) => {
    setSelectedPinId(pinId)
  }

  // Get filterable statuses (exclude 'deleted')
  const filterableStatuses = Object.keys(PIN_STATUS).filter(
    (status) => status !== 'deleted'
  ) as PinStatus[]

  return (
    <>
      <PageHeader title={t('calendar.title')} />
      <PageLayout maxWidth="wide" className={cn(selectedPinId && "mr-[350px]")}>
        {/* Toolbar row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Tab toggle */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                onClick={() => handleTabChange('calendar')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'calendar'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {t('calendar.tabCalendar')}
              </button>
              <button
                onClick={() => handleTabChange('unscheduled')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === 'unscheduled'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {t('calendar.tabUnscheduled')}
              </button>
            </div>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {filterableStatuses.map((status) => {
            const isActive = statuses?.includes(status) || false
            const colorClasses = getStatusBadgeClasses(status)
            const label = t('pinStatus.' + status)

            return (
              <button
                key={status}
                onClick={() => handleStatusToggle(status)}
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  isActive
                    ? colorClasses
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* Header skeleton */}
            <div className="grid grid-cols-7 border-b border-slate-200">
              {[t('calendar.dayMon'), t('calendar.dayTue'), t('calendar.dayWed'), t('calendar.dayThu'), t('calendar.dayFri'), t('calendar.daySat'), t('calendar.daySun')].map((day) => (
                <div
                  key={day}
                  className="bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-700 border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>
            {/* Grid skeleton */}
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }).map((_, i) => (
                <div
                  key={i}
                  className="border-r border-b min-h-[100px] p-2 bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        {!isLoading && (
          <>
            {tab === 'calendar' ? (
              scheduledPins.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <p className="text-slate-600">
                    {t('calendar.emptyScheduled')}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">
                    {t('calendar.emptyHint')}
                  </p>
                </div>
              ) : (
                <CalendarGrid
                  pins={scheduledPins}
                  view={view || 'month'}
                  onPinClick={handlePinClick}
                  onViewChange={handleViewChange}
                />
              )
            ) : (
              <UnscheduledPinsList
                pins={unscheduledPins}
                onPinClick={handlePinClick}
              />
            )}
          </>
        )}
      </PageLayout>

      {/* Pin Sidebar */}
      <PinSidebar
        pinId={selectedPinId}
        onClose={() => setSelectedPinId(null)}
      />
    </>
  )
}

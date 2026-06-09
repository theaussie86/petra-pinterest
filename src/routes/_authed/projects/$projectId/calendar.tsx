import { createFileRoute, useNavigate, CatchBoundary } from '@tanstack/react-router'
import { Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { usePinsSuspense } from '@/lib/hooks/use-pins'
import { pinsByProjectQueryOptions } from '@/lib/query/pins'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { PinSidebar } from '@/components/calendar/pin-sidebar'
import { PinListSidebar } from '@/components/calendar/pin-list-sidebar'
import { DaySidebar } from '@/components/calendar/day-sidebar'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import { PinStatusFilterBar, filterPinsByTab, STATUS_TABS, STATUS_TAB_GROUPS } from '@/components/pins/pin-status-filter-bar'
import type { StatusTab } from '@/components/pins/pin-status-filter-bar'

// Convert status tab to array of statuses for API filter
function getStatusFilterFromTab(tab: StatusTab): string[] | undefined {
  if (tab === 'all') return undefined
  return STATUS_TAB_GROUPS[tab]
}

// Search params validation schema
type CalendarSearch = {
  statusTab?: StatusTab
}

export const Route = createFileRoute('/_authed/projects/$projectId/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    return {
      statusTab: (STATUS_TABS as readonly string[]).includes(search.statusTab as string)
        ? (search.statusTab as StatusTab)
        : undefined,
    }
  },
  // Prefetch the project's pins server-side so the scheduled pins arrive in the
  // SSR HTML and the calendar hydrates without a client refetch (no loading
  // flash). Shares `pinsByProjectQueryOptions` (cache key `['pins', projectId]`)
  // with the consuming `usePinsSuspense` hook → one cache entry per project.
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(pinsByProjectQueryOptions(params.projectId)),
  component: CalendarRoute,
})

function CalendarRoute() {
  return (
    <CatchBoundary
      getResetKey={() => 'calendar'}
      errorComponent={({ error }) => (
        <PageLayout maxWidth="wide">
          <ErrorState error={error} />
        </PageLayout>
      )}
    >
      <Suspense
        fallback={
          <PageLayout maxWidth="wide">
            <LoadingSpinner />
          </PageLayout>
        }
      >
        <CalendarPage />
      </Suspense>
    </CatchBoundary>
  )
}

function CalendarPage() {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: Route.fullPath })
  const { projectId } = Route.useParams()
  const searchParams = Route.useSearch()

  useRealtimeInvalidation(
    `calendar-pins:${projectId}`,
    { event: 'UPDATE', table: 'pins', filter: `blog_project_id=eq.${projectId}` },
    [['pins', projectId]],
  )

  // Suspense + the loader prefetch guarantee `pins` is defined here; the Suspense
  // boundary covers the (already-resolved) loading state and CatchBoundary covers
  // errors. Background refetches (mutation/realtime invalidation) keep showing the
  // stale pins without re-triggering the fallback.
  const { data: pins } = usePinsSuspense(projectId)

  const { statusTab = 'all' } = searchParams

  // Sidebar state
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [pinListOpen, setPinListOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Determine if any sidebar is open
  const sidebarOpen = pinListOpen || selectedPinId !== null || selectedDay !== null

  // Filter by status tab
  const filteredPins = useMemo(() => filterPinsByTab(pins, statusTab), [pins, statusTab])

  // Split into scheduled and unscheduled
  const scheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at !== null),
    [filteredPins]
  )

  // Get pins for selected day
  const selectedDayPins = useMemo(() => {
    if (!selectedDay) return []
    const dateKey = format(selectedDay, 'yyyy-MM-dd')
    return scheduledPins.filter((pin) => {
      if (!pin.scheduled_at) return false
      const pinDateKey = format(new Date(pin.scheduled_at), 'yyyy-MM-dd')
      return pinDateKey === dateKey
    })
  }, [selectedDay, scheduledPins])

  // Handle status filter tab change
  const handleStatusTabChange = (newStatusTab: StatusTab) => {
    navigate({
      search: (prev) => ({
        ...prev,
        statusTab: newStatusTab === 'all' ? undefined : newStatusTab,
      }),
    })
  }

  // Handle pin click - close day sidebar and open pin sidebar
  const handlePinClick = (pinId: string) => {
    setSelectedDay(null)
    setSelectedPinId(pinId)
  }

  // Handle day click - open day sidebar
  const handleDayClick = (date: Date) => {
    setSelectedPinId(null)
    setPinListOpen(false)
    setSelectedDay(date)
  }

  // Handle day sidebar close
  const handleDaySidebarClose = () => {
    setSelectedDay(null)
  }

  return (
    <>
      <PageHeader title={t('calendar.title')} />
      <PageLayout maxWidth="wide">
        <div className={cn(sidebarOpen && "lg:mr-[420px]")}>
          {/* Status filter bar */}
          <div className="mb-4">
            <PinStatusFilterBar
              pins={pins}
              activeTab={statusTab}
              onTabChange={handleStatusTabChange}
            />
          </div>

          {/* Content area — Suspense guarantees pins are loaded here */}
          {scheduledPins.length === 0 ? (
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
              key={projectId}
              projectId={projectId}
              pins={scheduledPins}
              allPins={filteredPins}
              selectedDay={selectedDay}
              onPinClick={handlePinClick}
              onDayClick={handleDayClick}
              onTogglePinList={() => setPinListOpen((prev) => !prev)}
              pinListOpen={pinListOpen}
            />
          )}
        </div>
      </PageLayout>

      {/* Pin List Sidebar */}
      <PinListSidebar
        projectId={projectId}
        statusFilter={getStatusFilterFromTab(statusTab)}
        isOpen={pinListOpen}
        onClose={() => setPinListOpen(false)}
        onPinClick={handlePinClick}
      />

      {/* Day detail Sidebar */}
      <DaySidebar
        date={selectedDay}
        pins={selectedDayPins}
        isOpen={selectedDay !== null}
        onClose={handleDaySidebarClose}
        onPinClick={handlePinClick}
      />

      {/* Pin edit Sidebar */}
      <PinSidebar
        pinId={selectedPinId}
        onClose={() => setSelectedPinId(null)}
      />
    </>
  )
}

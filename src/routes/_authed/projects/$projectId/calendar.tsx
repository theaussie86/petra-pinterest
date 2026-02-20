import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { usePins } from '@/lib/hooks/use-pins'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { PinSidebar } from '@/components/calendar/pin-sidebar'
import { PinListSidebar } from '@/components/calendar/pin-list-sidebar'
import { useRealtimeInvalidation } from '@/lib/hooks/use-realtime'
import { PinStatusFilterBar, filterPinsByTab, STATUS_TABS } from '@/components/pins/pin-status-filter-bar'
import type { StatusTab } from '@/components/pins/pin-status-filter-bar'

// Search params validation schema
type CalendarSearch = {
  statusTab?: StatusTab
  view?: 'month' | 'week'
}

export const Route = createFileRoute('/_authed/projects/$projectId/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    return {
      statusTab: (STATUS_TABS as readonly string[]).includes(search.statusTab as string)
        ? (search.statusTab as StatusTab)
        : undefined,
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

  useRealtimeInvalidation(
    `calendar-pins:${projectId}`,
    { event: 'UPDATE', table: 'pins', filter: `blog_project_id=eq.${projectId}` },
    [['pins', projectId]],
  )

  const { data: pins, isLoading } = usePins(projectId)

  const { statusTab = 'all', view } = searchParams

  // Sidebar state
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [pinListOpen, setPinListOpen] = useState(false)
  const sidebarOpen = pinListOpen || selectedPinId !== null

  // Filter by status tab
  const filteredPins = useMemo(() => {
    if (!pins) return []
    return filterPinsByTab(pins, statusTab)
  }, [pins, statusTab])

  // Split into scheduled and unscheduled
  const scheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at !== null),
    [filteredPins]
  )

  // Handle status filter tab change
  const handleStatusTabChange = (newStatusTab: StatusTab) => {
    navigate({
      search: (prev) => ({
        ...prev,
        statusTab: newStatusTab === 'all' ? undefined : newStatusTab,
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

  return (
    <>
      <PageHeader title={t('calendar.title')} />
      <PageLayout maxWidth="wide">
        <div className={cn(sidebarOpen && "lg:mr-[420px]")}>
          {/* Status filter bar */}
          <div className="mb-4">
            <PinStatusFilterBar
              pins={pins || []}
              activeTab={statusTab}
              onTabChange={handleStatusTabChange}
            />
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
                allPins={filteredPins}
                view={view || 'month'}
                onPinClick={handlePinClick}
                onViewChange={handleViewChange}
                onTogglePinList={() => setPinListOpen((prev) => !prev)}
                pinListOpen={pinListOpen}
              />
            )
          )}
        </div>
      </PageLayout>

      {/* Pin List Sidebar */}
      <PinListSidebar
        pins={filteredPins}
        isOpen={pinListOpen}
        onClose={() => setPinListOpen(false)}
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

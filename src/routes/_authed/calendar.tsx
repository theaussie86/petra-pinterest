import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Header } from '@/components/layout/header'
import { useAllPins } from '@/lib/hooks/use-pins'
import { useBlogProjects } from '@/lib/hooks/use-blog-projects'
import { PIN_STATUS, getStatusBadgeClasses } from '@/types/pins'
import type { PinStatus } from '@/types/pins'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CalendarGrid } from '@/components/calendar/calendar-grid'
import { PinSidebar } from '@/components/calendar/pin-sidebar'

// Search params validation schema
type CalendarSearch = {
  project?: string
  statuses?: string[]
  tab?: 'calendar' | 'unscheduled'
  view?: 'month' | 'week'
}

export const Route = createFileRoute('/_authed/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    return {
      project: typeof search.project === 'string' ? search.project : undefined,
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
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()

  const { data: allPins, isLoading: pinsLoading } = useAllPins()
  const { data: projects, isLoading: projectsLoading } = useBlogProjects()

  const { project, statuses, tab, view } = searchParams

  // Sidebar state
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  // Client-side filtering
  const filteredPins = useMemo(() => {
    if (!allPins) return []

    let filtered = allPins

    // Filter by project
    if (project) {
      filtered = filtered.filter((pin) => pin.blog_project_id === project)
    }

    // Filter by statuses
    if (statuses && statuses.length > 0) {
      filtered = filtered.filter((pin) => statuses.includes(pin.status))
    }

    return filtered
  }, [allPins, project, statuses])

  // Split into scheduled and unscheduled
  const scheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at !== null),
    [filteredPins]
  )

  const unscheduledPins = useMemo(
    () => filteredPins.filter((pin) => pin.scheduled_at === null),
    [filteredPins]
  )

  // Handle project filter change
  const handleProjectChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        project: value === 'all' ? undefined : value,
      }),
    })
  }

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

  const isLoading = pinsLoading || projectsLoading

  // Get filterable statuses (exclude 'deleted')
  const filterableStatuses = Object.keys(PIN_STATUS).filter(
    (status) => status !== 'deleted'
  ) as PinStatus[]

  return (
    <div className="min-h-screen bg-slate-50">
      <Header user={user} />
      <main className={cn(
        "container mx-auto px-4 py-6 max-w-7xl transition-all duration-200",
        selectedPinId && "mr-[350px]"
      )}>
        {/* Toolbar row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Calendar</h1>
          <div className="flex items-center gap-3">
            {/* Project dropdown */}
            <Select
              value={project || 'all'}
              onValueChange={handleProjectChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
                Calendar
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
                Unscheduled
              </button>
            </div>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {filterableStatuses.map((status) => {
            const isActive = statuses?.includes(status) || false
            const colorClasses = getStatusBadgeClasses(status)
            const label = PIN_STATUS[status].label

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
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
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
                    No scheduled pins match your filters.
                  </p>
                  <p className="text-sm text-slate-500 mt-2">
                    Try adjusting your project or status filters.
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
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-slate-600">
                  Unscheduled view placeholder
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {unscheduledPins.length} unscheduled pins
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Pin Sidebar */}
      <PinSidebar
        pinId={selectedPinId}
        onClose={() => setSelectedPinId(null)}
      />
    </div>
  )
}

import { useState, useMemo } from 'react'
import {
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subMonths,
  subWeeks,
  isSameMonth,
  isToday,
  format,
} from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { Pin } from '@/types/pins'
import { CalendarHeader } from './calendar-header'
import { CalendarDayCell } from './calendar-day-cell'
import { useUpdatePin } from '@/lib/hooks/use-pins'

interface CalendarGridProps {
  pins: Pin[]
  view: 'month' | 'week'
  onPinClick: (pinId: string) => void
  onViewChange: (view: 'month' | 'week') => void
}

export function CalendarGrid({
  pins,
  view,
  onPinClick,
  onViewChange,
}: CalendarGridProps) {
  const { t } = useTranslation()
  const [currentDate, setCurrentDate] = useState(new Date())
  const updatePin = useUpdatePin()

  const DAYS_OF_WEEK = [
    t('calendar.dayMon'),
    t('calendar.dayTue'),
    t('calendar.dayWed'),
    t('calendar.dayThu'),
    t('calendar.dayFri'),
    t('calendar.daySat'),
    t('calendar.daySun'),
  ]

  // Group pins by date (yyyy-MM-dd format)
  const pinsByDate = useMemo(() => {
    const grouped = new Map<string, Pin[]>()
    pins.forEach((pin) => {
      if (pin.scheduled_at) {
        const dateKey = format(new Date(pin.scheduled_at), 'yyyy-MM-dd')
        if (!grouped.has(dateKey)) {
          grouped.set(dateKey, [])
        }
        grouped.get(dateKey)!.push(pin)
      }
    })
    return grouped
  }, [pins])

  // Handle pin drop - reschedule to new date, keeping same time
  const handlePinDrop = (pinId: string, targetDate: Date) => {
    // Find the pin to get its existing scheduled_at time
    const pin = pins.find((p) => p.id === pinId)
    if (!pin || !pin.scheduled_at) return

    const existingDate = new Date(pin.scheduled_at)
    const newDate = new Date(targetDate)
    // Keep the same time, change the date
    newDate.setHours(existingDate.getHours(), existingDate.getMinutes(), 0, 0)

    updatePin.mutate({
      id: pinId,
      scheduled_at: newDate.toISOString(),
    })
  }

  // Compute calendar grid days
  const calendarDays = useMemo(() => {
    if (view === 'month') {
      // 6 weeks x 7 days = 42 days
      const monthStart = startOfMonth(currentDate)
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday
      return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    } else {
      // 7 days for week view
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    }
  }, [currentDate, view])

  // Navigation handlers
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date())
    } else if (direction === 'prev') {
      setCurrentDate((prev) =>
        view === 'month' ? subMonths(prev, 1) : subWeeks(prev, 1)
      )
    } else {
      setCurrentDate((prev) =>
        view === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1)
      )
    }
  }

  return (
    <div>
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        onNavigate={handleNavigate}
        onViewChange={onViewChange}
      />

      {/* Calendar grid */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Day of week header */}
        <div className="grid grid-cols-7 border-b border-slate-200">
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-700 border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {view === 'month' ? (
          // Month view: 6 rows of 7 days
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const dayPins = pinsByDate.get(dateKey) || []
              return (
                <CalendarDayCell
                  key={dateKey}
                  date={date}
                  pins={dayPins}
                  isCurrentMonth={isSameMonth(date, currentDate)}
                  isToday={isToday(date)}
                  view={view}
                  onPinClick={onPinClick}
                  onPinDrop={handlePinDrop}
                />
              )
            })}
          </div>
        ) : (
          // Week view: 1 row of 7 days
          <div className="grid grid-cols-7">
            {calendarDays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const dayPins = pinsByDate.get(dateKey) || []
              return (
                <CalendarDayCell
                  key={dateKey}
                  date={date}
                  pins={dayPins}
                  isCurrentMonth={true} // All days in week view are "current"
                  isToday={isToday(date)}
                  view={view}
                  onPinClick={onPinClick}
                  onPinDrop={handlePinDrop}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

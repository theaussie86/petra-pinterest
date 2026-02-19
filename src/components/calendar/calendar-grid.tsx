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
import { CalendarWeekGrid } from './calendar-week-grid'
import { useUpdatePin } from '@/lib/hooks/use-pins'

interface CalendarGridProps {
  pins: Pin[]
  allPins: Pin[]
  view: 'month' | 'week'
  onPinClick: (pinId: string) => void
  onViewChange: (view: 'month' | 'week') => void
  onTogglePinList: () => void
  pinListOpen: boolean
}

export function CalendarGrid({
  pins,
  allPins,
  view,
  onPinClick,
  onViewChange,
  onTogglePinList,
  pinListOpen,
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

  // Handle pin drop - reschedule to new date
  const handlePinDrop = (pinId: string, targetDate: Date) => {
    if (view === 'week') {
      // Week view: targetDate already has correct hour/minute from drop position
      updatePin.mutate({
        id: pinId,
        scheduled_at: targetDate.toISOString(),
      })
    } else {
      // Month view: keep existing time, or default to 09:00 for unscheduled pins
      const pin = allPins.find((p) => p.id === pinId)
      if (!pin) return

      const newDate = new Date(targetDate)
      if (pin.scheduled_at) {
        const existingDate = new Date(pin.scheduled_at)
        newDate.setHours(existingDate.getHours(), existingDate.getMinutes(), 0, 0)
      } else {
        newDate.setHours(9, 0, 0, 0)
      }

      updatePin.mutate({
        id: pinId,
        scheduled_at: newDate.toISOString(),
      })
    }
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
        onTogglePinList={onTogglePinList}
        pinListOpen={pinListOpen}
      />

      {/* Calendar grid */}
      {view === 'week' ? (
        <CalendarWeekGrid
          pins={pins}
          currentDate={currentDate}
          onPinClick={onPinClick}
          onPinDrop={handlePinDrop}
        />
      ) : (
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

          {/* Month view: 6 rows of 7 days */}
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
        </div>
      )}
    </div>
  )
}

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { startOfWeek, addDays, format, isToday, isSameWeek } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { Pin } from '@/types/pins'
import { PIN_STATUS } from '@/types/pins'
import { PinMediaPreview } from '@/components/pins/pin-media-preview'
import { useDateLocale } from '@/lib/date-locale'
import { cn } from '@/lib/utils'

interface CalendarWeekGridProps {
  pins: Pin[]
  currentDate: Date
  onPinClick: (pinId: string) => void
  onPinDrop: (pinId: string, targetDate: Date) => void
}

// Constants
const START_HOUR = 6
const END_HOUR = 22 // 10 PM
const HOUR_HEIGHT = 60 // px per hour (1min ≈ 1px)
const PIN_HEIGHT = 45 // px
const GUTTER_WIDTH = 60 // px
const SNAP_MINUTES = 15
const TOTAL_HOURS = END_HOUR - START_HOUR

// Status → bg + left-border color classes
const STATUS_BG_CLASSES: Record<string, string> = {
  slate: 'bg-slate-100 border-l-slate-400',
  blue: 'bg-blue-100 border-l-blue-400',
  violet: 'bg-violet-100 border-l-violet-400',
  teal: 'bg-teal-100 border-l-teal-400',
  green: 'bg-green-100 border-l-green-400',
  amber: 'bg-amber-100 border-l-amber-400',
  emerald: 'bg-emerald-100 border-l-emerald-400',
  red: 'bg-red-100 border-l-red-400',
  gray: 'bg-gray-100 border-l-gray-300',
}

function getStatusBlockClasses(status: Pin['status']): string {
  const color = PIN_STATUS[status].color
  return STATUS_BG_CLASSES[color] || 'bg-slate-100 border-l-slate-300'
}

/** Convert a Date's hour/minute to a pixel offset from the top of the grid */
function timeToPixels(date: Date): number {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  return (hours - START_HOUR) * HOUR_HEIGHT + minutes
}

/** Snap minutes to nearest SNAP_MINUTES interval */
function snapMinutes(totalMinutes: number): number {
  return Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES
}

/** Convert a pixel Y offset back to hours and minutes (snapped) */
function pixelsToTime(px: number): { hours: number; minutes: number } {
  const totalMinutes = snapMinutes((px / HOUR_HEIGHT) * 60)
  const hours = START_HOUR + Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return {
    hours: Math.max(START_HOUR, Math.min(END_HOUR - 1, hours)),
    minutes: Math.max(0, Math.min(59, minutes)),
  }
}

interface PositionedPin {
  pin: Pin
  top: number // px from grid top
  dayIndex: number // 0-6
  overlapCount: number // total pins in overlap group
  overlapIndex: number // this pin's position in group
}

export function CalendarWeekGrid({
  pins,
  currentDate,
  onPinClick,
  onPinDrop,
}: CalendarWeekGridProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowOffset, setNowOffset] = useState<number | null>(null)
  const [dragOverState, setDragOverState] = useState<{
    dayIndex: number
    top: number
  } | null>(null)

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  )

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const isCurrentWeek = useMemo(
    () => isSameWeek(new Date(), currentDate, { weekStartsOn: 1 }),
    [currentDate]
  )

  // Position pins on the grid
  const positionedPins = useMemo(() => {
    const result: PositionedPin[] = []

    // Group pins by day
    const pinsByDay = new Map<number, { pin: Pin; top: number }[]>()

    for (const pin of pins) {
      if (!pin.scheduled_at) continue
      const pinDate = new Date(pin.scheduled_at)

      // Find which day column this pin belongs to
      const dayIndex = weekDays.findIndex(
        (day) => format(day, 'yyyy-MM-dd') === format(pinDate, 'yyyy-MM-dd')
      )
      if (dayIndex === -1) continue

      const top = timeToPixels(pinDate)
      // Only include pins within the visible time range
      if (top < 0 || top >= TOTAL_HOURS * HOUR_HEIGHT) continue

      if (!pinsByDay.has(dayIndex)) pinsByDay.set(dayIndex, [])
      pinsByDay.get(dayIndex)!.push({ pin, top })
    }

    // For each day, detect overlaps and assign positions
    for (const [dayIndex, dayPins] of pinsByDay) {
      // Sort by top position
      dayPins.sort((a, b) => a.top - b.top)

      // Group overlapping pins (within PIN_HEIGHT px of each other)
      const groups: { pin: Pin; top: number }[][] = []
      let currentGroup: { pin: Pin; top: number }[] = []

      for (const p of dayPins) {
        if (
          currentGroup.length === 0 ||
          p.top - currentGroup[0].top < PIN_HEIGHT
        ) {
          currentGroup.push(p)
        } else {
          groups.push(currentGroup)
          currentGroup = [p]
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup)

      for (const group of groups) {
        group.forEach((item, idx) => {
          result.push({
            pin: item.pin,
            top: item.top,
            dayIndex,
            overlapCount: group.length,
            overlapIndex: idx,
          })
        })
      }
    }

    return result
  }, [pins, weekDays])

  // Current time indicator
  useEffect(() => {
    if (!isCurrentWeek) {
      setNowOffset(null)
      return
    }

    const update = () => {
      const now = new Date()
      const offset = timeToPixels(now)
      setNowOffset(offset >= 0 && offset <= TOTAL_HOURS * HOUR_HEIGHT ? offset : null)
    }

    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [isCurrentWeek])

  // Auto-scroll to current time (or 9 AM) on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const targetHour = isCurrentWeek
      ? Math.max(START_HOUR, now.getHours() - 2)
      : 9
    const scrollTop = (targetHour - START_HOUR) * HOUR_HEIGHT
    scrollRef.current.scrollTop = scrollTop
  }, [isCurrentWeek])

  // Hour labels
  const hours = useMemo(() => {
    return Array.from({ length: TOTAL_HOURS }, (_, i) => {
      const date = new Date()
      date.setHours(START_HOUR + i, 0, 0, 0)
      return { hour: START_HOUR + i, label: format(date, 'h a', { locale }) }
    })
  }, [locale])

  // Drag handlers for day columns
  const handleColumnDragOver = useCallback(
    (e: React.DragEvent, dayIndex: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'

      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const snappedMinutes = snapMinutes(
        ((y / HOUR_HEIGHT) * 60)
      )
      const snappedTop = (snappedMinutes / 60) * HOUR_HEIGHT

      setDragOverState({ dayIndex, top: snappedTop })
    },
    []
  )

  const handleColumnDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (
        e.currentTarget === e.target ||
        !e.currentTarget.contains(e.relatedTarget as Node)
      ) {
        setDragOverState(null)
      }
    },
    []
  )

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, dayIndex: number) => {
      e.preventDefault()
      setDragOverState(null)

      const pinId = e.dataTransfer.getData('text/plain')
      if (!pinId) return

      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const { hours: dropHours, minutes: dropMinutes } = pixelsToTime(y)

      const targetDate = new Date(weekDays[dayIndex])
      targetDate.setHours(dropHours, dropMinutes, 0, 0)

      onPinDrop(pinId, targetDate)
    },
    [weekDays, onPinDrop]
  )

  // Drag start for pin blocks
  const handlePinDragStart = useCallback(
    (e: React.DragEvent, pin: Pin) => {
      e.dataTransfer.setData('text/plain', pin.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Sticky day header row */}
      <div
        className="grid border-b border-slate-200"
        style={{
          gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, 1fr)`,
        }}
      >
        {/* Empty gutter cell */}
        <div className="bg-slate-50 border-r border-slate-200" />

        {/* Day headers */}
        {weekDays.map((day, i) => {
          const today = isToday(day)
          return (
            <div
              key={i}
              className={cn(
                'bg-slate-50 px-2 py-3 text-center border-r last:border-r-0 border-slate-200',
                today && 'bg-blue-50/50'
              )}
            >
              <div className="text-xs font-medium text-slate-500 uppercase">
                {format(day, 'EEE', { locale })}
              </div>
              <div
                className={cn(
                  'text-lg font-semibold mt-0.5 inline-flex items-center justify-center',
                  today
                    ? 'bg-blue-600 text-white rounded-full w-8 h-8'
                    : 'text-slate-900'
                )}
              >
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 280px)' }}
      >
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, 1fr)`,
            height: `${TOTAL_HOURS * HOUR_HEIGHT}px`,
          }}
        >
          {/* Time gutter */}
          <div className="sticky left-0 z-10 bg-white border-r border-slate-200">
            {hours.map(({ hour, label }) => (
              <div
                key={hour}
                className="absolute right-2 text-xs text-slate-400 -translate-y-1/2"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className="relative border-r last:border-r-0 border-slate-200"
              onDragOver={(e) => handleColumnDragOver(e, dayIndex)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, dayIndex)}
            >
              {/* Hour gridlines */}
              {hours.map(({ hour }) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                />
              ))}

              {/* Half-hour gridlines */}
              {hours.map(({ hour }) => (
                <div
                  key={`half-${hour}`}
                  className="absolute inset-x-0 border-t border-slate-50"
                  style={{
                    top: `${(hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px`,
                  }}
                />
              ))}

              {/* Drop preview indicator */}
              {dragOverState?.dayIndex === dayIndex && (
                <div
                  className="absolute inset-x-1 h-[2px] bg-blue-400 rounded z-20 pointer-events-none"
                  style={{ top: `${dragOverState.top}px` }}
                />
              )}

              {/* Pin blocks for this day */}
              {positionedPins
                .filter((pp) => pp.dayIndex === dayIndex)
                .map((pp) => {
                  const widthPercent = 100 / pp.overlapCount
                  const leftPercent = pp.overlapIndex * widthPercent
                  const pinTime = pp.pin.scheduled_at
                    ? format(new Date(pp.pin.scheduled_at), 'h:mm a', { locale })
                    : ''

                  return (
                    <div
                      key={pp.pin.id}
                      draggable
                      onDragStart={(e) => handlePinDragStart(e, pp.pin)}
                      onClick={() => onPinClick(pp.pin.id)}
                      className={cn(
                        'absolute rounded border-l-4 px-1.5 py-1 cursor-pointer hover:shadow-md transition-shadow overflow-hidden z-10',
                        getStatusBlockClasses(pp.pin.status)
                      )}
                      style={{
                        top: `${pp.top}px`,
                        height: `${PIN_HEIGHT}px`,
                        left: `calc(${leftPercent}% + 2px)`,
                        width: `calc(${widthPercent}% - 4px)`,
                      }}
                      title={pp.pin.title || t('common.untitled')}
                    >
                      <div className="flex items-center gap-1.5 h-full min-w-0">
                        <div className="w-6 h-6 rounded overflow-hidden shrink-0">
                          <PinMediaPreview pin={pp.pin} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-900 truncate leading-tight">
                            {pp.pin.title || t('common.untitled')}
                          </p>
                          <p className="text-[10px] text-slate-500 leading-tight">
                            {pinTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}

          {/* Current time indicator (red line) */}
          {nowOffset !== null && (
            <div
              className="absolute pointer-events-none z-30"
              style={{
                top: `${nowOffset}px`,
                left: `${GUTTER_WIDTH}px`,
                right: 0,
              }}
            >
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                <div className="flex-1 h-[2px] bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

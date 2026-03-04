import { format } from 'date-fns'
import { useState, memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Pin } from '@/types/pins'
import { PIN_STATUS } from '@/types/pins'
import { PinMediaPreview } from '@/components/pins/pin-media-preview'
import { cn } from '@/lib/utils'

interface CalendarDayCellProps {
  date: Date
  pins: Pin[]
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  view: 'month' | 'week'
  onPinClick: (pinId: string) => void
  onPinDrop: (pinId: string, targetDate: Date) => void
  onDayClick: (date: Date) => void
}

// Map status colors to border classes
const STATUS_BORDER_CLASSES: Record<string, string> = {
  slate: 'border-slate-400',
  blue: 'border-blue-400',
  violet: 'border-violet-400',
  teal: 'border-teal-400',
  green: 'border-green-400',
  emerald: 'border-emerald-400',
  red: 'border-red-400',
  gray: 'border-gray-300',
}

// Map status colors to background classes (for month view rows)
const STATUS_BG_CLASSES: Record<string, string> = {
  slate: 'bg-slate-100',
  blue: 'bg-blue-100',
  violet: 'bg-violet-100',
  teal: 'bg-teal-100',
  green: 'bg-green-100',
  emerald: 'bg-emerald-100',
  red: 'bg-red-100',
  gray: 'bg-gray-100',
}

function getStatusBorderClass(status: Pin['status']): string {
  const color = PIN_STATUS[status].color
  return STATUS_BORDER_CLASSES[color] || 'border-slate-300'
}

function getStatusBgClass(status: Pin['status']): string {
  const color = PIN_STATUS[status].color
  return STATUS_BG_CLASSES[color] || 'bg-slate-100'
}

function getPinTime(pin: Pin): string {
  const dateStr = pin.scheduled_at || pin.published_at
  if (!dateStr) return ''
  return format(new Date(dateStr), 'HH:mm')
}

const CalendarDayCellComponent = ({
  date,
  pins,
  isCurrentMonth,
  isToday,
  isSelected,
  view,
  onPinClick,
  onPinDrop,
  onDayClick,
}: CalendarDayCellProps) => {
  const { t } = useTranslation()

  // Determine thumbnail size and max visible count based on view
  const thumbnailSize = view === 'month' ? 32 : 48
  const maxVisible = view === 'month' ? 4 : 6

  const sortedPins = [...pins].sort((a, b) => {
    const aTime = a.scheduled_at || a.published_at || ''
    const bTime = b.scheduled_at || b.published_at || ''
    return aTime.localeCompare(bTime)
  })
  const visiblePins = sortedPins.slice(0, maxVisible)
  const overflowCount = sortedPins.length - maxVisible

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null)

  // Drag handlers for pin thumbnails
  const handleDragStart = (e: React.DragEvent, pin: Pin) => {
    e.dataTransfer.setData('text/plain', pin.id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingPinId(pin.id)
  }

  const handleDragEnd = () => {
    setDraggingPinId(null)
  }

  // Drop target handlers for day cell
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only remove highlight if leaving the cell itself, not child elements
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const pinId = e.dataTransfer.getData('text/plain')
    if (pinId) {
      onPinDrop(pinId, date)
    }
  }

  // Handle cell click - select this day
  const handleCellClick = (e: React.MouseEvent) => {
    // Only trigger if clicking on the cell background, not on pins
    if (e.target === e.currentTarget) {
      onDayClick(date)
    }
  }

  return (
    <div
      onClick={handleCellClick}
      className={cn(
        'border-r border-b p-2 transition-colors cursor-pointer',
        view === 'month' ? 'min-h-[100px]' : 'min-h-[160px]',
        isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50',
        isToday && 'ring-2 ring-blue-400 ring-inset',
        isSelected && 'ring-2 ring-slate-400 bg-slate-100',
        isDragOver && 'ring-2 ring-blue-400 bg-blue-50'
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Day number */}
      <div
        onClick={() => onDayClick(date)}
        className={cn(
          'text-sm font-medium mb-2 hover:underline cursor-pointer inline-block',
          isCurrentMonth ? 'text-slate-900' : 'text-slate-400'
        )}
      >
        {format(date, 'd')}
      </div>

      {/* Pin list */}
      <div className={cn(
          view === 'month' ? 'space-y-0.5' : 'space-y-1'
        )}>
        {visiblePins.map((pin) =>
          view === 'month' ? (
            // Month view: row with time + title + thumbnail
            <div
              key={pin.id}
              draggable
              onDragStart={(e) => handleDragStart(e, pin)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                e.stopPropagation()
                onPinClick(pin.id)
              }}
              className={cn(
                'flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer transition-opacity text-xs',
                getStatusBgClass(pin.status),
                draggingPinId === pin.id && 'opacity-50'
              )}
            >
              <span className="shrink-0 w-9 font-medium text-slate-700 tabular-nums">
                {getPinTime(pin)}
              </span>
              <span className="flex-1 min-w-0 truncate text-slate-900">
                {pin.title || t('common.untitled')}
              </span>
              <div className="shrink-0 w-7 h-7 rounded overflow-hidden">
                <PinMediaPreview pin={pin} displayWidth={48} />
              </div>
            </div>
          ) : (
            // Week view: thumbnail only (unchanged)
            <div
              key={pin.id}
              draggable
              onDragStart={(e) => handleDragStart(e, pin)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                e.stopPropagation()
                onPinClick(pin.id)
              }}
              className="cursor-pointer"
              title={pin.title || t('common.untitled')}
            >
              <div
                className={cn(
                  'rounded border-2 overflow-hidden transition-opacity',
                  getStatusBorderClass(pin.status),
                  draggingPinId === pin.id && 'opacity-50'
                )}
                style={{
                  width: `${thumbnailSize}px`,
                  height: `${thumbnailSize}px`,
                }}
              >
                <PinMediaPreview pin={pin} displayWidth={48} />
              </div>
            </div>
          )
        )}

        {/* Overflow button */}
        {overflowCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDayClick(date)
            }}
            className="w-full text-left text-xs text-slate-500 hover:text-slate-700 px-1 py-0.5 transition-colors"
          >
            {t('unscheduledPins.more', { count: overflowCount })}
          </button>
        )}
      </div>
    </div>
  )
}

// Memoize with custom comparison to prevent unnecessary re-renders during drag
export const CalendarDayCell = memo(CalendarDayCellComponent, (prev, next) => {
  // Only re-render if date, view, or pin count/IDs change
  if (prev.date.getTime() !== next.date.getTime()) return false
  if (prev.view !== next.view) return false
  if (prev.isCurrentMonth !== next.isCurrentMonth) return false
  if (prev.isToday !== next.isToday) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.pins.length !== next.pins.length) return false

  // Check if pin IDs changed (shallow comparison)
  for (let i = 0; i < prev.pins.length; i++) {
    if (prev.pins[i].id !== next.pins[i].id) return false
  }

  return true
})

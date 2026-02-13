import { format } from 'date-fns'
import { useState, memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Pin } from '@/types/pins'
import { PIN_STATUS } from '@/types/pins'
import { getPinImageUrl } from '@/lib/api/pins'
import { useDateLocale } from '@/lib/date-locale'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'

interface CalendarDayCellProps {
  date: Date
  pins: Pin[]
  isCurrentMonth: boolean
  isToday: boolean
  view: 'month' | 'week'
  onPinClick: (pinId: string) => void
  onPinDrop: (pinId: string, targetDate: Date) => void
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

function getStatusBorderClass(status: Pin['status']): string {
  const color = PIN_STATUS[status].color
  return STATUS_BORDER_CLASSES[color] || 'border-slate-300'
}

const CalendarDayCellComponent = ({
  date,
  pins,
  isCurrentMonth,
  isToday,
  view,
  onPinClick,
  onPinDrop,
}: CalendarDayCellProps) => {
  const { t } = useTranslation()
  const locale = useDateLocale()

  // Determine thumbnail size and max visible count based on view
  const thumbnailSize = view === 'month' ? 32 : 48
  const maxVisible = view === 'month' ? 3 : 6

  const visiblePins = pins.slice(0, maxVisible)
  const overflowCount = pins.length - maxVisible

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

  return (
    <div
      className={cn(
        'border-r border-b p-2 transition-colors',
        view === 'month' ? 'min-h-[100px]' : 'min-h-[160px]',
        isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50',
        isToday && 'ring-2 ring-blue-400 ring-inset',
        isDragOver && 'ring-2 ring-blue-400 bg-blue-50'
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Day number */}
      <div
        className={cn(
          'text-sm font-medium mb-2',
          isCurrentMonth ? 'text-slate-900' : 'text-slate-400'
        )}
      >
        {format(date, 'd')}
      </div>

      {/* Pin thumbnails */}
      <div className="space-y-1">
        {visiblePins.map((pin) => (
          <div
            key={pin.id}
            draggable
            onDragStart={(e) => handleDragStart(e, pin)}
            onDragEnd={handleDragEnd}
            onClick={() => onPinClick(pin.id)}
            className="cursor-pointer"
            title={pin.title || t('common.untitled')}
          >
            <img
              src={getPinImageUrl(pin.image_path)}
              alt={pin.title || 'Pin'}
              loading="lazy"
              className={cn(
                'rounded border-2 object-cover transition-opacity',
                getStatusBorderClass(pin.status),
                draggingPinId === pin.id && 'opacity-50'
              )}
              style={{
                width: `${thumbnailSize}px`,
                height: `${thumbnailSize}px`,
              }}
            />
          </div>
        ))}

        {/* Overflow badge */}
        {overflowCount > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-xs px-2 py-0.5 font-medium hover:bg-slate-200 transition-colors">
                {t('unscheduledPins.more', { count: overflowCount })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 mb-3">
                  {t('calendar.allPinsFor', { date: format(date, 'MMM d, yyyy', { locale }) })}
                </p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {pins.map((pin) => (
                    <div
                      key={pin.id}
                      onClick={() => onPinClick(pin.id)}
                      className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <img
                        src={getPinImageUrl(pin.image_path)}
                        alt={pin.title || 'Pin'}
                        className={cn(
                          'w-6 h-6 rounded border object-cover',
                          getStatusBorderClass(pin.status)
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate">
                          {pin.title || t('common.untitled')}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-xs shrink-0"
                      >
                        {t('pinStatus.' + pin.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
  if (prev.pins.length !== next.pins.length) return false

  // Check if pin IDs changed (shallow comparison)
  for (let i = 0; i < prev.pins.length; i++) {
    if (prev.pins[i].id !== next.pins[i].id) return false
  }

  return true
})

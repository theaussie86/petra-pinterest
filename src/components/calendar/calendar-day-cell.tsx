import { format } from 'date-fns'
import type { Pin } from '@/types/pins'
import { PIN_STATUS } from '@/types/pins'
import { getPinImageUrl } from '@/lib/api/pins'
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

export function CalendarDayCell({
  date,
  pins,
  isCurrentMonth,
  isToday,
  view,
  onPinClick,
}: CalendarDayCellProps) {
  // Determine thumbnail size and max visible count based on view
  const thumbnailSize = view === 'month' ? 32 : 48
  const maxVisible = view === 'month' ? 3 : 6

  const visiblePins = pins.slice(0, maxVisible)
  const overflowCount = pins.length - maxVisible

  return (
    <div
      className={cn(
        'border-r border-b p-2 transition-colors',
        view === 'month' ? 'min-h-[100px]' : 'min-h-[160px]',
        isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50',
        isToday && 'ring-2 ring-blue-400 ring-inset'
      )}
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
            onClick={() => onPinClick(pin.id)}
            className="cursor-pointer"
            title={pin.title || 'Untitled Pin'}
          >
            <img
              src={getPinImageUrl(pin.image_path)}
              alt={pin.title || 'Pin'}
              loading="lazy"
              className={cn(
                'rounded border-2 object-cover',
                getStatusBorderClass(pin.status)
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
                +{overflowCount} more
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 mb-3">
                  All pins for {format(date, 'MMM d, yyyy')}
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
                          {pin.title || 'Untitled Pin'}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-xs shrink-0"
                      >
                        {PIN_STATUS[pin.status].label}
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

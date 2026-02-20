import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getPinImageUrl } from '@/lib/api/pins'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useDateLocale } from '@/lib/date-locale'
import { PIN_STATUS } from '@/types/pins'
import type { Pin } from '@/types/pins'

interface PinListSidebarProps {
  pins: Pin[]
  isOpen: boolean
  onClose: () => void
  onPinClick: (pinId: string) => void
}

type FilterMode = 'all' | 'with-date' | 'without-date'

// Tailwind classes must be complete strings for purge to work
const STATUS_ACCENT_CLASSES: Record<string, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-blue-400',
  violet: 'bg-violet-400',
  teal: 'bg-teal-400',
  green: 'bg-green-400',
  emerald: 'bg-emerald-500',
  red: 'bg-red-400',
  gray: 'bg-gray-300',
}

function getStatusAccentClass(status: Pin['status']): string {
  const color = PIN_STATUS[status]?.color
  return STATUS_ACCENT_CLASSES[color] || 'bg-slate-400'
}

function PinCard({ pin, onClick }: { pin: Pin; onClick: () => void }) {
  const locale = useDateLocale()
  const imageUrl = pin.image_path ? getPinImageUrl(pin.image_path) : null
  const [isDragging, setIsDragging] = useState(false)

  const dateLabel = pin.scheduled_at
    ? format(new Date(pin.scheduled_at), 'dd. MMM yyyy, HH:mm', { locale })
    : null

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', pin.id)
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-b-0 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Left accent bar — color reflects pin status */}
      <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 ${getStatusAccentClass(pin.status)}`} />

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">
          {pin.title || '—'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {dateLabel ?? 'No date'}
        </p>
      </div>

      {/* Thumbnail */}
      <div className="h-12 w-12 flex-shrink-0 rounded overflow-hidden bg-slate-200">
        {imageUrl && (
          <OptimizedImage
            src={imageUrl}
            width={48}
            alt={pin.alt_text || pin.title || ''}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
      </div>
    </div>
  )
}

export function PinListSidebar({ pins, isOpen, onClose, onPinClick }: PinListSidebarProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [filter, setFilter] = useState<FilterMode>('all')

  const filteredPins = useMemo(() => {
    if (filter === 'with-date') return pins.filter((p) => p.scheduled_at !== null)
    if (filter === 'without-date') return pins.filter((p) => p.scheduled_at === null)
    return pins
  }, [pins, filter])

  // Group scheduled pins by date
  const { scheduledGroups, unscheduledPins } = useMemo(() => {
    const scheduled = filteredPins.filter((p) => p.scheduled_at !== null)
    const unscheduled = filteredPins.filter((p) => p.scheduled_at === null)

    const groups = new Map<string, { label: string; pins: Pin[] }>()
    for (const pin of scheduled) {
      const dateKey = format(new Date(pin.scheduled_at!), 'yyyy-MM-dd')
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          label: format(new Date(pin.scheduled_at!), 'd. MMMM yyyy', { locale }),
          pins: [],
        })
      }
      groups.get(dateKey)!.pins.push(pin)
    }

    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
    return { scheduledGroups: sortedGroups, unscheduledPins: unscheduled }
  }, [filteredPins, locale])

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-16 z-30 w-[350px] h-[calc(100vh-4rem)] bg-white border-l border-slate-200 shadow-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('calendar.pinListFilterAll')}</SelectItem>
            <SelectItem value="with-date">{t('calendar.pinListFilterWithDate')}</SelectItem>
            <SelectItem value="without-date">{t('calendar.pinListFilterWithoutDate')}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable pin list */}
      <div className="flex-1 overflow-y-auto">
        {filteredPins.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Keine Pins gefunden.
          </div>
        )}

        {/* Drag hint for unscheduled filter */}
        {filter === 'without-date' && unscheduledPins.length > 0 && (
          <div className="mx-3 my-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
            {t('calendar.dragHint')}
          </div>
        )}

        {/* Scheduled groups */}
        {scheduledGroups.map(([dateKey, group]) => (
          <div key={dateKey}>
            <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              {group.label}
            </div>
            {group.pins.map((pin) => (
              <PinCard key={pin.id} pin={pin} onClick={() => onPinClick(pin.id)} />
            ))}
          </div>
        ))}

        {/* Unscheduled section */}
        {unscheduledPins.length > 0 && (
          <div>
            {scheduledGroups.length > 0 && (
              <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                {t('calendar.pinListFilterWithoutDate')}
              </div>
            )}
            {unscheduledPins.map((pin) => (
              <PinCard key={pin.id} pin={pin} onClick={() => onPinClick(pin.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

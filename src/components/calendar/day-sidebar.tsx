import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Pin } from '@/types/pins'
import { PIN_STATUS } from '@/types/pins'
import { PinMediaPreview } from '@/components/pins/pin-media-preview'
import { useDateLocale } from '@/lib/date-locale'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DaySidebarProps {
  date: Date | null
  pins: Pin[]
  isOpen: boolean
  onClose: () => void
  onPinClick: (pinId: string) => void
}

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

function getStatusBgClass(status: Pin['status']): string {
  const color = PIN_STATUS[status].color
  return STATUS_BG_CLASSES[color] || 'bg-slate-100'
}

function getPinTime(pin: Pin): string {
  const dateStr = pin.scheduled_at || pin.published_at
  if (!dateStr) return ''
  return format(new Date(dateStr), 'HH:mm')
}

export function DaySidebar({ date, pins, isOpen, onClose, onPinClick }: DaySidebarProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()

  // Handle Escape key to close sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Sort pins by time
  const sortedPins = useMemo(() => {
    return [...pins].sort((a, b) => {
      const aTime = a.scheduled_at || a.published_at || ''
      const bTime = b.scheduled_at || b.published_at || ''
      return aTime.localeCompare(bTime)
    })
  }, [pins])

  if (!isOpen || !date) {
    return null
  }

  const handlePinClick = (pinId: string) => {
    onClose()
    onPinClick(pinId)
  }

  return createPortal(
    <div className="fixed right-0 inset-y-0 z-40 w-[420px] h-svh bg-white border-l border-slate-200 shadow-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-900">
          {format(date, 'EEEE, d. MMMM', { locale })}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Pin list */}
      <div className="flex-1 overflow-y-auto">
        {sortedPins.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {t('calendar.noPinsForDay')}
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            {sortedPins.map((pin) => (
              <button
                key={pin.id}
                onClick={() => handlePinClick(pin.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors text-left',
                  getStatusBgClass(pin.status),
                  'hover:ring-2 hover:ring-slate-300'
                )}
              >
                <span className="shrink-0 w-12 font-medium text-slate-700 tabular-nums text-sm">
                  {getPinTime(pin)}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-slate-900">
                  {pin.title || t('common.untitled')}
                </span>
                <div className="shrink-0 w-12 h-12 rounded overflow-hidden">
                  <PinMediaPreview pin={pin} displayWidth={48} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

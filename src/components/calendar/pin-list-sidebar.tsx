import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { getPinImageUrl, type PaginatedPinsResult } from '@/lib/api/pins'
import { usePinsPaginated } from '@/lib/hooks/use-pins'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { useDateLocale } from '@/lib/date-locale'
import { PIN_STATUS } from '@/types/pins'
import type { Pin } from '@/types/pins'

interface PinListSidebarProps {
  projectId: string
  statusFilter?: string[]
  isOpen: boolean
  onClose: () => void
  onPinClick: (pinId: string) => void
}

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
  const { t } = useTranslation()
  const imageUrl = pin.image_path ? getPinImageUrl(pin.image_path) : null
  const [isDragging, setIsDragging] = useState(false)

  const scheduledLabel = pin.scheduled_at
    ? format(new Date(pin.scheduled_at), 'dd. MMM, HH:mm', { locale })
    : t('calendar.noDate')

  const uploadedLabel = formatDistanceToNow(new Date(pin.created_at), {
    addSuffix: true,
    locale,
  })

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
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500">{scheduledLabel}</span>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-400">{uploadedLabel}</span>
        </div>
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

export function PinListSidebar({
  projectId,
  statusFilter,
  isOpen,
  onClose,
  onPinClick,
}: PinListSidebarProps) {
  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePinsPaginated(projectId, { statusFilter })

  // Flatten all pages into a single list
  const allPins = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page: PaginatedPinsResult) => page.pins)
  }, [data])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed right-0 inset-y-0 z-40 w-[420px] h-svh bg-white border-l border-slate-200 shadow-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-medium text-slate-700">
          {t('calendar.recentPins')}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable pin list */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && allPins.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">
              {t('calendar.noRecentPins')}
            </p>
            {hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t('calendar.loadOlderPins')}
              </Button>
            )}
          </div>
        )}

        {/* Pin list - flat, sorted by upload time */}
        {allPins.map((pin) => (
          <PinCard key={pin.id} pin={pin} onClick={() => onPinClick(pin.id)} />
        ))}

        {/* Load more button */}
        {!isLoading && allPins.length > 0 && hasNextPage && (
          <div className="p-4 border-t border-slate-100">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t('calendar.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

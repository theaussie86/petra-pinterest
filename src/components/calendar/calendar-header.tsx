import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CalendarHeaderProps {
  currentDate: Date
  view: 'month' | 'week'
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onViewChange: (view: 'month' | 'week') => void
}

export function CalendarHeader({
  currentDate,
  view,
  onNavigate,
  onViewChange,
}: CalendarHeaderProps) {
  const { t } = useTranslation()

  // Format the current period label
  const periodLabel =
    view === 'month'
      ? format(currentDate, 'MMMM yyyy')
      : format(currentDate, 'MMM d, yyyy')

  return (
    <div className="flex items-center justify-between mb-6 bg-white rounded-lg border border-slate-200 p-4">
      {/* Left: Navigation buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onNavigate('prev')}
          className="h-9 w-9"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate('today')}
          className="h-9 px-3"
        >
          {t('calendar.today')}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onNavigate('next')}
          className="h-9 w-9"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Center: Period label */}
      <div className="text-lg font-semibold text-slate-900">{periodLabel}</div>

      {/* Right: View toggle */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => onViewChange('month')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'month'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          {t('calendar.viewMonth')}
        </button>
        <button
          onClick={() => onViewChange('week')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'week'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          {t('calendar.viewWeek')}
        </button>
      </div>
    </div>
  )
}

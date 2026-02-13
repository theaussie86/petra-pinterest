import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, addDays } from 'date-fns'
import { CalendarIcon, Clock } from 'lucide-react'
import { useDateLocale } from '@/lib/date-locale'
import { useBulkSchedulePins } from '@/lib/hooks/use-pins'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface BulkScheduleDialogProps {
  pinIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PRESET_TIMES = [
  { label: '6:00', value: '06:00' },
  { label: '9:00', value: '09:00' },
  { label: '12:00', value: '12:00' },
  { label: '15:00', value: '15:00' },
  { label: '18:00', value: '18:00' },
  { label: '21:00', value: '21:00' },
]

export function BulkScheduleDialog({
  pinIds,
  open,
  onOpenChange,
}: BulkScheduleDialogProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const [dateOpen, setDateOpen] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [time, setTime] = useState<string>('')
  const [intervalDays, setIntervalDays] = useState<number>(2)

  const bulkSchedule = useBulkSchedulePins()

  const handleScheduleAll = () => {
    if (!startDate || !time) return

    bulkSchedule.mutate(
      {
        pin_ids: pinIds,
        start_date: startDate,
        interval_days: intervalDays,
        time,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          // Reset form
          setStartDate(undefined)
          setTime('')
          setIntervalDays(2)
        },
      }
    )
  }

  // Generate preview dates
  const previewDates = startDate
    ? pinIds.slice(0, 3).map((_, index) => {
        const date = addDays(startDate, index * intervalDays)
        return format(date, 'PPP', { locale })
      })
    : []

  const remainingCount = pinIds.length - 3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bulkSchedule.title')}</DialogTitle>
          <DialogDescription>
            {t('bulkSchedule.description', { count: pinIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Picker */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('bulkSchedule.fieldStartDate')}</label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'PPP', { locale }) : t('bulkSchedule.placeholderDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  defaultMonth={startDate}
                  captionLayout="dropdown"
                  onSelect={(d) => {
                    setStartDate(d)
                    setDateOpen(false)
                  }}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={locale}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Picker */}
          <div>
            <label className="text-sm font-medium mb-2 block flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('bulkSchedule.fieldTime')}
            </label>

            {/* Preset Times */}
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TIMES.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={time === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTime(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Custom Time Input */}
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>

          {/* Interval Input */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('bulkSchedule.fieldInterval')}
            </label>
            <Input
              type="number"
              min="1"
              max="30"
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            />
          </div>

          {/* Preview */}
          {startDate && time && previewDates.length > 0 && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-2">{t('bulkSchedule.previewTitle')}</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {previewDates.map((date, index) => (
                  <li key={index}>
                    {t('bulkSchedule.previewItem', { n: index + 1, date, time })}
                  </li>
                ))}
                {remainingCount > 0 && (
                  <li>{t('bulkSchedule.previewMore', { count: remainingCount })}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleScheduleAll}
            disabled={!startDate || !time || bulkSchedule.isPending}
          >
            {bulkSchedule.isPending ? t('bulkSchedule.scheduling') : t('bulkSchedule.scheduleAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

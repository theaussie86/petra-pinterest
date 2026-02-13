import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CalendarIcon, Clock, X } from 'lucide-react'
import { useDateLocale } from '@/lib/date-locale'
import { useUpdatePin } from '@/lib/hooks/use-pins'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Pin } from '@/types/pins'

interface SchedulePinSectionProps {
  pin: Pin
}

const PRESET_TIMES = [
  { label: '6:00', value: '06:00' },
  { label: '9:00', value: '09:00' },
  { label: '12:00', value: '12:00' },
  { label: '15:00', value: '15:00' },
  { label: '18:00', value: '18:00' },
  { label: '21:00', value: '21:00' },
]

export function SchedulePinSection({ pin }: SchedulePinSectionProps) {
  const { t } = useTranslation()
  const locale = useDateLocale()
  const hasMetadata = !!pin.title && !!pin.description
  const existingDate = pin.scheduled_at ? new Date(pin.scheduled_at) : undefined

  const [dateOpen, setDateOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>(existingDate)
  const [time, setTime] = useState<string>(
    existingDate ? format(existingDate, 'HH:mm') : ''
  )

  const updatePin = useUpdatePin()

  const handleSchedule = () => {
    if (!date || !time) return

    const [hours, minutes] = time.split(':').map(Number)
    const scheduledDate = new Date(date)
    scheduledDate.setHours(hours, minutes, 0, 0)

    updatePin.mutate({
      id: pin.id,
      scheduled_at: scheduledDate.toISOString(),
      status: 'ready_to_schedule',
    })
  }

  const handleClearSchedule = () => {
    updatePin.mutate({
      id: pin.id,
      scheduled_at: null,
    })
    setDate(undefined)
    setTime('')
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4">{t('schedulePin.title')}</h3>

        {!hasMetadata ? (
          <p className="text-sm text-muted-foreground">
            {t('schedulePin.noMetadata')}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Date Picker */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t('schedulePin.fieldDate')}</label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP', { locale }) : t('schedulePin.placeholderDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    defaultMonth={date}
                    captionLayout="dropdown"
                    onSelect={(d) => {
                      setDate(d)
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
                {t('schedulePin.fieldTime')}
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

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={handleSchedule}
                disabled={!date || !time || updatePin.isPending}
              >
                {t('schedulePin.schedule')}
              </Button>

              {pin.scheduled_at && (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  disabled={updatePin.isPending}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  {t('schedulePin.clearSchedule')}
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

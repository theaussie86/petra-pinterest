import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CalendarIcon, Clock, X } from 'lucide-react'
import { useDateLocale } from '@/lib/date-locale'
import { useUpdatePin } from '@/lib/hooks/use-pins'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACTIVE_STATUSES, type Pin, type PinStatus } from '@/types/pins'

interface Board {
  pinterest_board_id: string
  name: string
}

interface PinRowExpansionProps {
  pin: Pin
  boards: Board[] | undefined
  boardsLoading: boolean
}

const PRESET_TIMES = [
  { label: '6:00', value: '06:00' },
  { label: '9:00', value: '09:00' },
  { label: '12:00', value: '12:00' },
  { label: '15:00', value: '15:00' },
  { label: '18:00', value: '18:00' },
  { label: '21:00', value: '21:00' },
]

export const PinRowExpansion = memo(function PinRowExpansion({ pin, boards, boardsLoading }: PinRowExpansionProps) {
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

  const handleBoardChange = (value: string) => {
    if (value === '__none__') {
      updatePin.mutate({ id: pin.id, pinterest_board_id: null, pinterest_board_name: null })
    } else {
      const board = boards?.find((b) => b.pinterest_board_id === value)
      if (board) {
        updatePin.mutate({
          id: pin.id,
          pinterest_board_id: board.pinterest_board_id,
          pinterest_board_name: board.name,
        })
      }
    }
  }

  const handleSchedule = () => {
    if (!date || !time) return

    const [hours, minutes] = time.split(':').map(Number)
    const scheduledDate = new Date(date)
    scheduledDate.setHours(hours, minutes, 0, 0)

    updatePin.mutate({
      id: pin.id,
      scheduled_at: scheduledDate.toISOString(),
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

  const handleStatusChange = (newStatus: PinStatus) => {
    updatePin.mutate({
      id: pin.id,
      status: newStatus,
    })
  }

  return (
    <div className="bg-muted/50 px-4 py-4 border-t">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metadata Display (read-only) */}
        <div className="md:col-span-2 space-y-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('pinTable.columnTitle')}
            </span>
            <p className="mt-1 text-sm">
              {pin.title || <span className="text-muted-foreground italic">{t('common.empty')}</span>}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('pinRowExpansion.description')}
            </span>
            <p className="mt-1 text-sm line-clamp-3">
              {pin.description || <span className="text-muted-foreground italic">{t('common.empty')}</span>}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('pinRowExpansion.altText')}
            </span>
            <p className="mt-1 text-sm">
              {pin.alt_text || <span className="text-muted-foreground italic">{t('common.empty')}</span>}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {/* Status Dropdown */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              {t('pinTable.columnStatus')}
            </label>
            <Select
              value={pin.status}
              onValueChange={(value) => handleStatusChange(value as PinStatus)}
              disabled={updatePin.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`pinStatus.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Board Selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              {t('pinRowExpansion.board')}
            </label>
            {boards === undefined && !boardsLoading ? (
              <p className="text-sm text-muted-foreground">
                {t('pinRowExpansion.pinterestNotConnected')}
              </p>
            ) : (
              <Select
                value={pin.pinterest_board_id ?? '__none__'}
                onValueChange={handleBoardChange}
                disabled={updatePin.isPending || boardsLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('pinRowExpansion.placeholderBoard')} />
                </SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  <SelectItem value="__none__">
                    {t('pinRowExpansion.noBoard')}
                  </SelectItem>
                  {boards?.map((board) => (
                    <SelectItem key={board.pinterest_board_id} value={board.pinterest_board_id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Scheduling */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              {t('schedulePin.title')}
            </label>

            {!hasMetadata ? (
              <p className="text-sm text-muted-foreground">
                {t('schedulePin.noMetadata')}
              </p>
            ) : (
              <div className="space-y-3">
                {/* Date Picker */}
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      disabled={updatePin.isPending}
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

                {/* Time Picker */}
                <div>
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {t('schedulePin.fieldTime')}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {PRESET_TIMES.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        variant={time === preset.value ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setTime(preset.value)}
                        disabled={updatePin.isPending}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={updatePin.isPending}
                    className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    size="sm"
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
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      {t('schedulePin.clearSchedule')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

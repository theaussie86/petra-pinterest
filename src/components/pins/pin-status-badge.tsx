import { cn } from '@/lib/utils'
import { PIN_STATUS, getStatusBadgeClasses } from '@/types/pins'
import type { PinStatus } from '@/types/pins'

interface PinStatusBadgeProps {
  status: PinStatus
  disabled?: boolean
}

export function PinStatusBadge({ status, disabled }: PinStatusBadgeProps) {
  const { label } = PIN_STATUS[status]
  const colorClasses = getStatusBadgeClasses(status)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClasses,
        disabled && 'opacity-50'
      )}
    >
      {label}
    </span>
  )
}

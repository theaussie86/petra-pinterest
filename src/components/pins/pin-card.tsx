import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { PinStatusBadge } from '@/components/pins/pin-status-badge'
import type { Pin } from '@/types/pins'

interface PinCardProps {
  pin: Pin
  selected: boolean
  onToggleSelect: (id: string) => void
  imageUrl: string
}

export function PinCard({ pin, selected, onToggleSelect, imageUrl }: PinCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link to="/projects/$projectId/pins/$pinId" params={{ projectId: pin.blog_project_id, pinId: pin.id }} className="block">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-100">
          <img
            src={imageUrl}
            alt={pin.title || 'Pin image'}
            className="h-full w-full object-cover"
            loading="lazy"
          />

          {/* Bottom gradient overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
            <p className={cn(
              'text-sm font-medium text-white line-clamp-2',
              !pin.title && 'italic text-white/70'
            )}>
              {pin.title || 'Untitled'}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <PinStatusBadge status={pin.status} />
              {pin.scheduled_at && (
                <span className="text-xs text-white/80">
                  {new Date(pin.scheduled_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Checkbox overlay - visible on hover or when selected */}
      <div
        className={cn(
          'absolute left-2 top-2 transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(pin.id)}
          className="h-5 w-5 border-2 border-white bg-white/80 shadow-sm data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
        />
      </div>
    </div>
  )
}

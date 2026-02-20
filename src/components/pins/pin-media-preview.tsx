import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getPinImageUrl } from '@/lib/api/pins'
import { OptimizedImage } from '@/components/ui/optimized-image'
import type { Pin } from '@/types/pins'

interface PinMediaPreviewProps {
  pin: Pick<Pin, 'image_path' | 'media_type' | 'title' | 'pinterest_pin_url'>
  className?: string
  /** Show controls on video elements (for lightbox usage) */
  controls?: boolean
  /** Hint for Vercel image optimization. Match the rendered CSS width. */
  displayWidth?: number
}

export function PinMediaPreview({ pin, className, controls = false, displayWidth = 400 }: PinMediaPreviewProps) {
  const { t } = useTranslation()

  // Cleaned-up image: published pin with no storage image remaining
  if (pin.image_path === null) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2 bg-muted', className)}>
        <img
          src="/logo.svg"
          alt="Petra Pinterest logo"
          className="h-10 w-10 opacity-40"
        />
        {pin.pinterest_pin_url && (
          <a
            href={pin.pinterest_pin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('pinSidebar.viewOnPinterest')}
          </a>
        )}
      </div>
    )
  }

  const url = getPinImageUrl(pin.image_path)

  if (pin.media_type === 'video') {
    return (
      <div className="relative h-full w-full">
        <video
          src={url}
          muted
          playsInline
          controls={controls}
          className={cn('h-full w-full object-cover', className)}
        />
        {!controls && (
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {t('imageUpload.videoBadge')}
          </span>
        )}
      </div>
    )
  }

  return (
    <OptimizedImage
      src={url}
      width={displayWidth}
      alt={pin.title || 'Pin image'}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getPinImageUrl } from '@/lib/api/pins'
import type { Pin } from '@/types/pins'

interface PinMediaPreviewProps {
  pin: Pick<Pin, 'image_path' | 'media_type' | 'title'>
  className?: string
  /** Show controls on video elements (for lightbox usage) */
  controls?: boolean
}

export function PinMediaPreview({ pin, className, controls = false }: PinMediaPreviewProps) {
  const { t } = useTranslation()
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
    <img
      src={url}
      alt={pin.title || 'Pin image'}
      className={cn('h-full w-full object-cover', className)}
      loading="lazy"
    />
  )
}

import { useTranslation } from 'react-i18next'
import { ExternalLink, Send, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { usePublishPin } from '@/lib/hooks/use-pinterest-publishing'
import type { PinStatus } from '@/types/pins'
import { Link } from '@tanstack/react-router'

interface PublishPinButtonProps {
  pinId: string
  pinStatus: PinStatus
  hasPinterestConnection: boolean
  hasPinterestBoard: boolean
  pinterestPinUrl?: string | null
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm'
}

export function PublishPinButton({
  pinId,
  pinStatus,
  hasPinterestConnection,
  hasPinterestBoard,
  pinterestPinUrl,
  variant = 'outline',
  size = 'sm',
}: PublishPinButtonProps) {
  const { t } = useTranslation()
  const publishMutation = usePublishPin()

  const handlePublish = () => {
    publishMutation.mutate({ pin_id: pinId })
  }

  // Published state: show badge with external link
  if (pinStatus === 'published') {
    if (pinterestPinUrl) {
      return (
        <Link
          to={pinterestPinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
        >
          {t('publishPin.published')}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-700">
        {t('publishPin.published')}
      </Badge>
    )
  }

  // Error state: show retry button
  if (pinStatus === 'error') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handlePublish}
        disabled={publishMutation.isPending}
        className="border-red-300 text-red-600 hover:bg-red-50"
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {publishMutation.isPending ? t('publishPin.retrying') : t('publishPin.retryPublish')}
      </Button>
    )
  }

  // No Pinterest connection: show disabled button with tooltip
  if (!hasPinterestConnection) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button variant={variant} size={size} disabled>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t('publishPin.publish')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('publishPin.tooltipNoConnection')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // No Pinterest board assigned: show disabled button with tooltip
  if (!hasPinterestBoard) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button variant={variant} size={size} disabled>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t('publishPin.publish')}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('publishPin.tooltipNoBoard')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Ready to publish: show active publish button
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePublish}
      disabled={publishMutation.isPending}
    >
      <Send className="mr-1.5 h-3.5 w-3.5" />
      {publishMutation.isPending ? t('publishPin.publishing') : t('publishPin.publish')}
    </Button>
  )
}

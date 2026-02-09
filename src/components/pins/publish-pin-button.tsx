import { ExternalLink, Send, Loader2, RotateCcw } from 'lucide-react'
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
  const publishMutation = usePublishPin()

  const handlePublish = () => {
    publishMutation.mutate({ pin_id: pinId })
  }

  // Published state: show badge with external link
  if (pinStatus === 'published') {
    if (pinterestPinUrl) {
      return (
        <a
          href={pinterestPinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
        >
          Published
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )
    }
    return (
      <Badge className="bg-emerald-100 text-emerald-700">
        Published
      </Badge>
    )
  }

  // Publishing state: show loading spinner
  if (pinStatus === 'publishing') {
    return (
      <Button variant={variant} size={size} disabled>
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        Publishing...
      </Button>
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
        {publishMutation.isPending ? 'Retrying...' : 'Retry Publish'}
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
                Publish
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Connect Pinterest in project settings</p>
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
                Publish
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Assign a Pinterest board first</p>
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
      {publishMutation.isPending ? 'Publishing...' : 'Publish'}
    </Button>
  )
}

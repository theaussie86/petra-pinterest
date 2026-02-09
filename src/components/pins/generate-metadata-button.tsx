import { Sparkles, History, RefreshCw, Loader2 } from 'lucide-react'
import { useGenerateMetadata } from '@/lib/hooks/use-metadata'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Pin } from '@/types/pins'

interface GenerateMetadataButtonProps {
  pin: Pin
  onHistoryOpen: () => void
  onRegenerateOpen: () => void
}

export function GenerateMetadataButton({
  pin,
  onHistoryOpen,
  onRegenerateOpen,
}: GenerateMetadataButtonProps) {
  const generateMetadata = useGenerateMetadata()

  const hasMetadata = pin.title || pin.description
  const isGenerating = pin.status === 'generating_metadata'
  const isDisabled = generateMetadata.isPending || isGenerating

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">AI Metadata</h2>

        {isGenerating && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating metadata...</span>
          </div>
        )}

        {!hasMetadata ? (
          <Button
            onClick={() => generateMetadata.mutate({ pin_id: pin.id })}
            disabled={isDisabled}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Metadata
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={onRegenerateOpen}
              disabled={isDisabled}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate with Feedback
            </Button>
            <Button
              variant="outline"
              onClick={onHistoryOpen}
              disabled={isDisabled}
              className="w-full"
            >
              <History className="mr-2 h-4 w-4" />
              View History
            </Button>
            <Button
              variant="outline"
              onClick={() => generateMetadata.mutate({ pin_id: pin.id })}
              disabled={isDisabled}
              className="w-full"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

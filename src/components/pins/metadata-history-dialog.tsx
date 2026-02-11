import { useTranslation } from 'react-i18next'
import { useMetadataHistory, useRestoreMetadataGeneration } from '@/lib/hooks/use-metadata'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

interface MetadataHistoryDialogProps {
  pinId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MetadataHistoryDialog({
  pinId,
  open,
  onOpenChange,
}: MetadataHistoryDialogProps) {
  const { t, i18n } = useTranslation()
  const { data: history, isLoading } = useMetadataHistory(pinId)
  const restoreGeneration = useRestoreMetadataGeneration()

  const handleRestore = async (generationId: string) => {
    await restoreGeneration.mutateAsync({ pinId, generationId })
    onOpenChange(false)
  }

  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('metadataHistory.title')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            {t('metadataHistory.empty')}
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((generation, index) => (
              <div
                key={generation.id}
                className="border rounded-lg p-4 space-y-3 bg-slate-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {formatDateTime(generation.created_at)}
                      </span>
                      {index === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {t('metadataHistory.current')}
                        </Badge>
                      )}
                    </div>
                    {generation.feedback && (
                      <p className="text-sm italic text-slate-600">
                        {t('metadataHistory.feedback', { feedback: generation.feedback })}
                      </p>
                    )}
                  </div>
                  {index !== 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(generation.id)}
                      disabled={restoreGeneration.isPending}
                    >
                      {t('metadataHistory.useVersion')}
                    </Button>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-700">{t('metadataHistory.fieldTitle')}</span>
                    <span className="text-slate-600">
                      {truncate(generation.title, 60)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">{t('metadataHistory.fieldDescription')}</span>
                    <span className="text-slate-600">
                      {truncate(generation.description, 100)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">{t('metadataHistory.fieldAltText')}</span>
                    <span className="text-slate-600">
                      {truncate(generation.alt_text, 60)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

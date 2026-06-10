import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useGenerateMetadata } from '@/lib/hooks/use-metadata'
import { usePublishPin } from '@/lib/hooks/use-pinterest-publishing'
import { useUpdatePin } from '@/lib/hooks/use-pins'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface PinErrorAlertProps {
  pin: { id: string; error_message: string | null; previous_status: string | null }
}

/**
 * Shared error banner with a context-aware retry action. The retry routes back to
 * the operation that failed (metadata generation, publish, or a plain status reset)
 * based on `previous_status`. Used by the pin detail view and the pin-table row.
 */
export function PinErrorAlert({ pin }: PinErrorAlertProps) {
  const { t } = useTranslation()
  const generateMetadata = useGenerateMetadata()
  const publishPin = usePublishPin()
  const updatePin = useUpdatePin()

  const isMetadataError = ['generate_metadata', 'generating_metadata'].includes(pin.previous_status || '')
  const isPublishError = pin.previous_status === 'metadata_created'

  const handleRetry = () => {
    if (isMetadataError) {
      generateMetadata.mutate({ pin_id: pin.id })
    } else if (isPublishError) {
      publishPin.mutate({ pin_id: pin.id })
    } else {
      updatePin.mutate({ id: pin.id, status: 'draft', error_message: null })
    }
  }

  const isPending = generateMetadata.isPending || publishPin.isPending || updatePin.isPending

  const buttonText = isMetadataError
    ? (isPending ? t('publishPin.retrying') : t('publishPin.retryGenerate'))
    : isPublishError
      ? (isPending ? t('publishPin.retrying') : t('publishPin.retryPublish'))
      : (isPending ? t('pinDetail.resetting') : t('pinDetail.resetStatus'))

  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('pinDetail.errorTitle')}</AlertTitle>
      <AlertDescription className="mt-1">
        <p className="mb-3">{pin.error_message || t('pinDetail.unknownError')}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetry}
          disabled={isPending}
          className="border-red-300 hover:bg-red-100"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {buttonText}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

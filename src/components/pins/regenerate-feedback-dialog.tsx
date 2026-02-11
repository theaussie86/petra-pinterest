import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGenerateMetadataWithFeedback } from '@/lib/hooks/use-metadata'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface RegenerateFeedbackDialogProps {
  pinId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegenerateFeedbackDialog({
  pinId,
  open,
  onOpenChange,
}: RegenerateFeedbackDialogProps) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState('')
  const regenerateWithFeedback = useGenerateMetadataWithFeedback()

  const handleSubmit = async () => {
    if (!feedback.trim()) return

    await regenerateWithFeedback.mutateAsync({ pin_id: pinId, feedback: feedback.trim() })
    setFeedback('')
    onOpenChange(false)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFeedback('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('regenerateFeedback.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">{t('regenerateFeedback.fieldFeedback')}</Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t('regenerateFeedback.placeholderFeedback')}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={regenerateWithFeedback.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!feedback.trim() || regenerateWithFeedback.isPending}
          >
            {regenerateWithFeedback.isPending ? t('regenerateFeedback.regenerating') : t('regenerateFeedback.regenerate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

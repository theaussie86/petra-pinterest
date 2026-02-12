import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Key, Trash2 } from 'lucide-react'
import {
  useGeminiKeyStatus,
  useStoreGeminiKey,
  useDeleteGeminiKey,
} from '@/lib/hooks/use-gemini-key'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface GeminiApiKeyCardProps {
  blogProjectId: string
}

export function GeminiApiKeyCard({ blogProjectId }: GeminiApiKeyCardProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useGeminiKeyStatus(blogProjectId)
  const storeMutation = useStoreGeminiKey()
  const deleteMutation = useDeleteGeminiKey()

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isReplacing, setIsReplacing] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)

  const hasKey = data?.has_key ?? false

  const handleSave = () => {
    if (!apiKeyInput.trim()) return
    storeMutation.mutate(
      { blog_project_id: blogProjectId, api_key: apiKeyInput.trim() },
      {
        onSuccess: () => {
          setApiKeyInput('')
          setIsReplacing(false)
        },
      }
    )
  }

  const handleRemove = () => {
    deleteMutation.mutate(
      { blog_project_id: blogProjectId },
      {
        onSuccess: () => {
          setRemoveDialogOpen(false)
        },
      }
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('geminiApiKey.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('geminiApiKey.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* No key configured */}
          {!hasKey && !isReplacing && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {t('geminiApiKey.description')}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={t('geminiApiKey.placeholder')}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <Button
                  onClick={handleSave}
                  disabled={!apiKeyInput.trim() || storeMutation.isPending}
                >
                  {storeMutation.isPending
                    ? t('common.saving')
                    : t('common.save')}
                </Button>
              </div>
            </div>
          )}

          {/* Key configured */}
          {hasKey && !isReplacing && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm font-medium">
                  {t('geminiApiKey.configured')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsReplacing(true)}
                >
                  {t('geminiApiKey.replace')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setRemoveDialogOpen(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('geminiApiKey.remove')}
                </Button>
              </div>
            </div>
          )}

          {/* Replace mode */}
          {isReplacing && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {t('geminiApiKey.replaceDescription')}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={t('geminiApiKey.placeholder')}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <Button
                  onClick={handleSave}
                  disabled={!apiKeyInput.trim() || storeMutation.isPending}
                >
                  {storeMutation.isPending
                    ? t('common.saving')
                    : t('common.save')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsReplacing(false)
                    setApiKeyInput('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remove confirmation dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('geminiApiKey.removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('geminiApiKey.removeMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t('common.deleting')
                : t('geminiApiKey.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

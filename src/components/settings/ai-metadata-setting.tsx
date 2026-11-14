import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAiMetadataEnabled, useSetAiMetadataEnabled } from '@/lib/hooks/use-tenant-settings'

/**
 * "KI-Metadaten" settings section (ADR-0009). The user switches automatic AI
 * metadata generation (Gemini) for the whole account on or off. Off hides the
 * generate actions, skips the auto trigger after pin creation and hides the
 * MCP tool `generate_metadata`; the database refuses to enqueue as well.
 */
export function AiMetadataSetting() {
  const { t } = useTranslation()
  const { enabled, isLoading } = useAiMetadataEnabled()
  const setEnabled = useSetAiMetadataEnabled()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.aiMetadata.title')}</CardTitle>
        <CardDescription>{t('settings.aiMetadata.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="ai-metadata-enabled">{t('settings.aiMetadata.label')}</Label>
            <p className="text-sm text-slate-500">
              {isLoading ? t('settings.aiMetadata.loading') : t('settings.aiMetadata.offExplanation')}
            </p>
          </div>
          <Switch
            id="ai-metadata-enabled"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled.mutate(checked)}
            disabled={isLoading || setEnabled.isPending}
          />
        </div>
      </CardContent>
    </Card>
  )
}

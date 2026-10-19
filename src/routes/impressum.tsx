import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { ImpressumContent } from '@/components/legal/legal-content'

export const Route = createFileRoute('/impressum')({
  component: ImpressumPage,
})

function ImpressumPage() {
  const { t } = useTranslation()
  return (
    <LegalPage title={t('legal.impressum')}>
      <ImpressumContent />
    </LegalPage>
  )
}

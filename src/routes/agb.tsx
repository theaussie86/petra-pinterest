import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { AgbContent } from '@/components/legal/legal-content'

export const Route = createFileRoute('/agb')({
  component: AgbPage,
})

function AgbPage() {
  const { t } = useTranslation()
  return (
    <LegalPage title={t('legal.agb')}>
      <AgbContent />
    </LegalPage>
  )
}

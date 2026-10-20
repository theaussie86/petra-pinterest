import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { DatenschutzContent } from '@/components/legal/legal-content'

export const Route = createFileRoute('/datenschutz')({
  component: DatenschutzPage,
})

function DatenschutzPage() {
  const { t } = useTranslation()
  return (
    <LegalPage title={t('legal.datenschutz')}>
      <DatenschutzContent />
    </LegalPage>
  )
}

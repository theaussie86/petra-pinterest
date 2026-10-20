import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { ConnectedAgents } from '@/components/settings/connected-agents'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <PageLayout maxWidth="wide">
        <ConnectedAgents />
      </PageLayout>
    </>
  )
}

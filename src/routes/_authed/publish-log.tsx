import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { PublishLog } from '@/components/publish-log/publish-log'

export const Route = createFileRoute('/_authed/publish-log')({
  component: PublishLogPage,
})

function PublishLogPage() {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t('publishLog.title')} description={t('publishLog.description')} />
      <PageLayout maxWidth="wide">
        <PublishLog />
      </PageLayout>
    </>
  )
}

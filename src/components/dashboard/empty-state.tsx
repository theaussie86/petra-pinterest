import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface EmptyDashboardStateProps {
  onCreateProject: () => void
}

export function EmptyDashboardState({ onCreateProject }: EmptyDashboardStateProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center max-w-md px-4">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          {t('dashboard.empty.heading')}
        </h1>
        <p className="text-slate-600 mb-8">
          {t('dashboard.empty.message')}
        </p>
        <Button size="lg" onClick={onCreateProject}>
          {t('dashboard.empty.button')}
        </Button>
      </div>
    </div>
  )
}

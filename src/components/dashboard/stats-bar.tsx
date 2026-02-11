import { useTranslation } from 'react-i18next'
import { Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface StatsBarProps {
  stats: { scheduled: number; published: number; pending: number }
  loading?: boolean
}

export function StatsBar({ stats, loading }: StatsBarProps) {
  const { t } = useTranslation()

  const items = [
    {
      label: t('stats.scheduled'),
      count: stats.scheduled,
      icon: Clock,
      color: 'text-blue-600',
    },
    {
      label: t('stats.published'),
      count: stats.published,
      icon: CheckCircle,
      color: 'text-green-600',
    },
    {
      label: t('stats.pending'),
      count: stats.pending,
      icon: AlertCircle,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {items.map((stat) => (
        <Card
          key={stat.label}
          className="cursor-pointer transition-colors hover:bg-slate-50"
          onClick={() => {
            // Navigation wired in future phases
          }}
        >
          <CardContent className="flex items-center gap-4 p-6">
            <div className={`${stat.color}`}>
              <stat.icon className="h-8 w-8" />
            </div>
            <div>
              {loading ? (
                <Skeleton className="h-9 w-12 mb-1" />
              ) : (
                <p className="text-3xl font-bold text-slate-900">{stat.count}</p>
              )}
              <p className="text-sm text-slate-600">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

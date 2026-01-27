import { Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function StatsBar() {
  // Phase 2: All counts are 0 (articles/pins don't exist yet)
  // Structure is ready for real data in future phases
  const stats = [
    {
      label: 'Scheduled',
      count: 0,
      icon: Clock,
      color: 'text-blue-600',
    },
    {
      label: 'Published',
      count: 0,
      icon: CheckCircle,
      color: 'text-green-600',
    },
    {
      label: 'Pending',
      count: 0,
      icon: AlertCircle,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      {stats.map((stat) => (
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
              <p className="text-3xl font-bold text-slate-900">{stat.count}</p>
              <p className="text-sm text-slate-600">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

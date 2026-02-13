import { useMemo } from 'react'
import { useAllPins } from './use-pins'
import { useAllArticles } from './use-articles'
import type { PinStatus } from '@/types/pins'

const PUBLISHED_STATUSES: PinStatus[] = ['published', 'publishing']
const PENDING_STATUSES: PinStatus[] = [
  'draft',
  'ready_for_generation',
  'generate_metadata',
  'generating_metadata',
  'metadata_created',
]

export function useProjectStats() {
  const { data: allPins, isLoading: pinsLoading } = useAllPins()
  const { data: allArticles, isLoading: articlesLoading } = useAllArticles()

  const loading = pinsLoading || articlesLoading

  const globalStats = useMemo(() => {
    const pins = allPins ?? []
    const now = new Date()
    return {
      scheduled: pins.filter((p) => p.scheduled_at != null && !PUBLISHED_STATUSES.includes(p.status)).length,
      published: pins.filter((p) => PUBLISHED_STATUSES.includes(p.status)).length,
      pending: pins.filter((p) => PENDING_STATUSES.includes(p.status)).length,
      overdue: pins.filter((p) => p.scheduled_at != null && new Date(p.scheduled_at) < now && !PUBLISHED_STATUSES.includes(p.status)).length,
    }
  }, [allPins])

  const projectStatsMap = useMemo(() => {
    const pins = allPins ?? []
    const articles = allArticles ?? []
    const map = new Map<string, { articles: number; scheduled: number; published: number }>()

    for (const article of articles) {
      const entry = map.get(article.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
      entry.articles++
      map.set(article.blog_project_id, entry)
    }

    for (const pin of pins) {
      const entry = map.get(pin.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
      if (pin.scheduled_at != null && !PUBLISHED_STATUSES.includes(pin.status)) entry.scheduled++
      if (PUBLISHED_STATUSES.includes(pin.status)) entry.published++
      map.set(pin.blog_project_id, entry)
    }

    return map
  }, [allPins, allArticles])

  return { globalStats, projectStatsMap, loading }
}

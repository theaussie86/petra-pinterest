import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  pinTemplatesByArticleQueryOptions,
  pinTemplateCountsQueryOptions,
} from '@/lib/query/pin-templates'

/**
 * Templates for a single article, ordered by position. `enabled` guards against
 * an empty article id (nothing selected yet).
 */
export function usePinTemplatesByArticle(articleId: string) {
  return useQuery({
    ...pinTemplatesByArticleQueryOptions(articleId),
    enabled: !!articleId,
  })
}

/**
 * Suspense variant for the workshop route which prefetches the selected
 * article's templates in its loader. Shares the query options (and cache key)
 * with `usePinTemplatesByArticle` and the loader, so loader-prefetched data
 * hydrates without a client refetch.
 */
export function usePinTemplatesByArticleSuspense(articleId: string) {
  return useSuspenseQuery(pinTemplatesByArticleQueryOptions(articleId))
}

/**
 * Per-article template counts for a project (left-column badges).
 */
export function usePinTemplateCounts(projectId: string) {
  return useQuery({
    ...pinTemplateCountsQueryOptions(projectId),
    enabled: !!projectId,
  })
}

/**
 * Suspense variant for the workshop route which prefetches the counts in its
 * loader.
 */
export function usePinTemplateCountsSuspense(projectId: string) {
  return useSuspenseQuery(pinTemplateCountsQueryOptions(projectId))
}

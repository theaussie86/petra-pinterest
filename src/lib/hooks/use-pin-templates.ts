import { useQuery } from '@tanstack/react-query'
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
 * Per-article template counts for a project (left-column badges).
 */
export function usePinTemplateCounts(projectId: string) {
  return useQuery({
    ...pinTemplateCountsQueryOptions(projectId),
    enabled: !!projectId,
  })
}

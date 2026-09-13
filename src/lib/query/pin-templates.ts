import { queryOptions } from '@tanstack/react-query'
import {
  getPinTemplatesByArticle,
  getPinTemplateCountsByProject,
} from '@/lib/api/pin-templates'
import type { PinTemplate } from '@/types/pin-templates'

/**
 * The cache key for an article's templates. Nested under `['pin-templates']` so
 * a broad template invalidation (`['pin-templates']`) refreshes it by prefix,
 * while keeping a distinct entry per article id.
 */
export function pinTemplatesByArticleQueryKey(articleId: string) {
  return ['pin-templates', 'article', articleId] as const
}

/**
 * Shared query options for an article's templates — the single source of truth
 * referenced by both the workshop route loader (`ensureQueryData(...)`) and the
 * consuming hook, so templates arrive in the SSR HTML and hydrate without a
 * client refetch.
 */
export function pinTemplatesByArticleQueryOptions(articleId: string) {
  return queryOptions<PinTemplate[]>({
    queryKey: pinTemplatesByArticleQueryKey(articleId),
    queryFn: () => getPinTemplatesByArticle(articleId),
    staleTime: 30 * 1000,
  })
}

/**
 * The cache key for a project's per-article template counts (the left-column
 * badges). Nested under `['pin-templates']` so a broad template invalidation
 * refreshes it by prefix.
 */
export function pinTemplateCountsQueryKey(projectId: string) {
  return ['pin-templates', 'counts', projectId] as const
}

/**
 * Shared query options for a project's per-article template counts — the single
 * source of truth for both the workshop route loader and the consuming hook.
 */
export function pinTemplateCountsQueryOptions(projectId: string) {
  return queryOptions<Record<string, number>>({
    queryKey: pinTemplateCountsQueryKey(projectId),
    queryFn: () => getPinTemplateCountsByProject(projectId),
    staleTime: 30 * 1000,
  })
}

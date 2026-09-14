import { queryOptions } from '@tanstack/react-query'
import {
  getPinTemplatesByArticle,
  getOpenPinTemplateCountsByProject,
  getPinTemplateRevisions,
} from '@/lib/api/pin-templates'
import type { PinTemplate, PinTemplateRevision } from '@/types/pin-templates'

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
 * for the consuming hook. Templates load client-side once an article is
 * selected, so they are not prefetched in the workshop route loader.
 */
export function pinTemplatesByArticleQueryOptions(articleId: string) {
  return queryOptions<PinTemplate[]>({
    queryKey: pinTemplatesByArticleQueryKey(articleId),
    queryFn: () => getPinTemplatesByArticle(articleId),
    staleTime: 30 * 1000,
  })
}

/**
 * The cache key for a project's per-article *open* template counts (the
 * left-column badges). Nested under `['pin-templates']` so a broad template
 * invalidation refreshes it by prefix — a status change updates the badges
 * without a reload.
 */
export function pinTemplateOpenCountsQueryKey(projectId: string) {
  return ['pin-templates', 'open-counts', projectId] as const
}

/**
 * Shared query options for a project's per-article open template counts — the
 * single source of truth for both the workshop route loader and the consuming
 * hook.
 */
export function pinTemplateOpenCountsQueryOptions(projectId: string) {
  return queryOptions<Record<string, number>>({
    queryKey: pinTemplateOpenCountsQueryKey(projectId),
    queryFn: () => getOpenPinTemplateCountsByProject(projectId),
    staleTime: 30 * 1000,
  })
}

/**
 * The cache key for a template's revision history. Nested under
 * `['pin-templates']` so a broad template invalidation refreshes it by prefix —
 * submitting a revision request updates the history without a reload.
 */
export function pinTemplateRevisionsQueryKey(templateId: string) {
  return ['pin-templates', 'revisions', templateId] as const
}

/**
 * Shared query options for a template's revision history (last 3, newest first).
 * Loaded client-side once a template is selected, so it is not prefetched in the
 * workshop route loader.
 */
export function pinTemplateRevisionsQueryOptions(templateId: string) {
  return queryOptions<PinTemplateRevision[]>({
    queryKey: pinTemplateRevisionsQueryKey(templateId),
    queryFn: () => getPinTemplateRevisions(templateId),
    staleTime: 30 * 1000,
  })
}

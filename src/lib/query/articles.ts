import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query'
import {
  getArticle,
  getArticlesPaginated,
  getArchivedArticlesPaginated,
  type PaginatedArticlesResult,
} from '@/lib/api/articles'
import type { Article } from '@/types/articles'

/**
 * The cache key for a single article record. Nested under `['articles']` so the
 * existing article mutation invalidation (`['articles']`) refreshes the detail
 * too (prefix match), while keeping a distinct entry per article id.
 */
export function articleQueryKey(id: string) {
  return ['articles', 'detail', id] as const
}

/**
 * Shared query options for a single article record — the single source of truth
 * referenced by both the article-detail route loader
 * (`ensureQueryData(articleQueryOptions(id))`) and the consuming suspense hook,
 * so the record arrives in the SSR HTML and hydrates without a client refetch.
 */
export function articleQueryOptions(id: string) {
  return queryOptions<Article>({
    queryKey: articleQueryKey(id),
    queryFn: () => getArticle(id),
    staleTime: 30 * 1000,
  })
}

export interface ArticlesPaginatedOptions {
  pageSize?: number
}

/**
 * The cache key for a project's paginated (active) articles. Matches the key the
 * articles-list realtime invalidation targets (`['articles', projectId, 'paginated']`)
 * and nests under `['articles']` so article mutations also refresh it by prefix.
 */
export function articlesPaginatedQueryKey(projectId: string) {
  return ['articles', projectId, 'paginated'] as const
}

/**
 * Shared infinite-query options for a project's paginated active articles — the
 * single source of truth referenced by both the articles-list route loader
 * (`prefetchInfiniteQuery`, which fetches the first page server-side) and the
 * consuming `useSuspenseInfiniteQuery` hook, so the first page arrives in the
 * SSR HTML and additional pages stream via the existing offset pagination.
 */
export function articlesPaginatedQueryOptions(
  projectId: string,
  options: ArticlesPaginatedOptions = {},
) {
  const { pageSize = 20 } = options

  return infiniteQueryOptions({
    queryKey: articlesPaginatedQueryKey(projectId),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getArticlesPaginated(projectId, { offset: pageParam, limit: pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PaginatedArticlesResult, allPages: PaginatedArticlesResult[]) =>
      lastPage.hasMore ? allPages.length * pageSize : undefined,
    staleTime: 30 * 1000,
  })
}

/**
 * The cache key for a project's paginated archived articles. Matches the key the
 * articles-list realtime invalidation targets
 * (`['articles', projectId, 'archived', 'paginated']`).
 */
export function archivedArticlesPaginatedQueryKey(projectId: string) {
  return ['articles', projectId, 'archived', 'paginated'] as const
}

/**
 * Shared infinite-query options for a project's paginated archived articles.
 * The archived tab is below the fold (loads on tab switch), so it is not
 * prefetched in the loader, but it shares this factory with `useArchivedArticlesPaginated`
 * to keep its cache key centralized alongside the active-articles factory.
 */
export function archivedArticlesPaginatedQueryOptions(
  projectId: string,
  options: ArticlesPaginatedOptions = {},
) {
  const { pageSize = 20 } = options

  return infiniteQueryOptions({
    queryKey: archivedArticlesPaginatedQueryKey(projectId),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getArchivedArticlesPaginated(projectId, { offset: pageParam, limit: pageSize }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PaginatedArticlesResult, allPages: PaginatedArticlesResult[]) =>
      lastPage.hasMore ? allPages.length * pageSize : undefined,
    staleTime: 30 * 1000,
  })
}

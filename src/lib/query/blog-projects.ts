import { queryOptions } from '@tanstack/react-query'
import { getBlogProjects } from '@/lib/api/blog-projects'
import type { BlogProject } from '@/types/blog-projects'

/**
 * The single cache key for the blog-projects list. Shared by the projects-list
 * route loader (prefetch via `ensureQueryData`) and the consuming suspense hook
 * so loader-prefetched data and the hook always hit the same cache entry — and
 * the existing mutation/optimistic/realtime invalidation on `['blog-projects']`
 * keeps targeting it.
 */
export const BLOG_PROJECTS_QUERY_KEY = ['blog-projects'] as const

/**
 * Shared query options for the blog-projects list — the single source of truth
 * referenced by both the route loader and the consuming hook (Workstream 2
 * Query SSR). The route loader awaits `ensureQueryData(blogProjectsQueryOptions())`
 * so the list arrives in the SSR HTML and hydrates without a client refetch.
 */
export function blogProjectsQueryOptions() {
  return queryOptions<BlogProject[]>({
    queryKey: BLOG_PROJECTS_QUERY_KEY,
    queryFn: getBlogProjects,
    staleTime: 30 * 1000,
  })
}

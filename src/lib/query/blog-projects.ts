import { queryOptions } from '@tanstack/react-query'
import { getBlogProjects, getBlogProject } from '@/lib/api/blog-projects'
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

/**
 * The cache key for a single blog-project record. Nested under
 * `BLOG_PROJECTS_QUERY_KEY` (`['blog-projects']`) so the existing
 * mutation/optimistic/realtime invalidation on `['blog-projects']` refreshes the
 * detail too (prefix match), while keeping a distinct entry per project id.
 */
export function blogProjectQueryKey(id: string) {
  return [...BLOG_PROJECTS_QUERY_KEY, id] as const
}

/**
 * Shared query options for a single blog-project record — the single source of
 * truth referenced by both the project-detail route loader
 * (`ensureQueryData(blogProjectQueryOptions(id))`) and the consuming suspense
 * hook, so prefetched data hydrates without a client refetch and the detail
 * arrives in the SSR HTML.
 */
export function blogProjectQueryOptions(id: string) {
  return queryOptions<BlogProject>({
    queryKey: blogProjectQueryKey(id),
    queryFn: () => getBlogProject(id),
    staleTime: 30 * 1000,
  })
}

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  getAllArticles,
  getArticlesByProject,
  getArchivedArticles,
  archiveArticle,
  restoreArticle,
  updateArticleContent,
  scrapeBlog,
  addArticleManually,
  deleteArticle,
  deleteArticles,
  archiveArticles,
  restoreArticles,
} from '@/lib/api/articles'
import {
  articleQueryOptions,
  articlesPaginatedQueryOptions,
  archivedArticlesPaginatedQueryOptions,
  type ArticlesPaginatedOptions,
} from '@/lib/query/articles'

export function useAllArticles() {
  return useQuery({
    queryKey: ['articles', 'all'],
    queryFn: getAllArticles,
    staleTime: 30000
  })
}

export function useArticles(projectId: string) {
  return useQuery({
    queryKey: ['articles', projectId],
    queryFn: () => getArticlesByProject(projectId),
    enabled: !!projectId,
    staleTime: 30000
  })
}

export function useArticle(id: string) {
  return useQuery({
    ...articleQueryOptions(id),
    enabled: !!id,
  })
}

/**
 * Suspense variant for the article-detail route that prefetches the record in its
 * loader (SSR). Shares `articleQueryOptions` (cache key `['articles', 'detail', id]`)
 * with `useArticle` and the loader, so loader-prefetched data hydrates without a
 * client refetch and `data` is always defined.
 */
export function useArticleSuspense(id: string) {
  return useSuspenseQuery(articleQueryOptions(id))
}

export function useArchivedArticles(projectId: string) {
  return useQuery({
    queryKey: ['articles', projectId, 'archived'],
    queryFn: () => getArchivedArticles(projectId),
    enabled: !!projectId
  })
}

export function useScrapeBlog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: scrapeBlog,
    onSuccess: (_data, variables) => {
      toast.success(i18n.t('toast.article.scrapeStarted'))
      queryClient.invalidateQueries({ queryKey: ['articles', variables.blog_project_id] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.scrapeFailed'))
    }
  })
}

export function useArchiveArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: archiveArticle,
    onSuccess: () => {
      toast.success(i18n.t('toast.article.archived'))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.archiveFailed'))
    }
  })
}

export function useRestoreArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: restoreArticle,
    onSuccess: () => {
      toast.success(i18n.t('toast.article.restored'))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.restoreFailed'))
    }
  })
}

export function useUpdateArticleContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      updateArticleContent(id, content),
    onSuccess: () => {
      toast.success(i18n.t('toast.article.contentUpdated'))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.contentUpdateFailed'))
    }
  })
}

export function useAddArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, url }: { projectId: string; url: string }) =>
      addArticleManually(projectId, url),
    onSuccess: (_data, variables) => {
      toast.success(i18n.t('toast.article.added'))
      queryClient.invalidateQueries({ queryKey: ['articles', variables.projectId] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.addFailed'))
    }
  })
}

// Delete single article
export function useDeleteArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteArticle,
    onSuccess: () => {
      toast.success(i18n.t('toast.article.deleted'))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.deleteFailed'))
    }
  })
}

// Bulk delete articles
export function useBulkDeleteArticles() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteArticles,
    onSuccess: (_data, ids) => {
      toast.success(i18n.t('toast.article.multipleDeleted', { count: ids.length }))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.multipleDeleteFailed'))
    }
  })
}

// Bulk archive articles
export function useBulkArchiveArticles() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: archiveArticles,
    onSuccess: (_data, ids) => {
      toast.success(i18n.t('toast.article.multipleArchived', { count: ids.length }))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.multipleArchiveFailed'))
    }
  })
}

// Bulk restore articles
export function useBulkRestoreArticles() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: restoreArticles,
    onSuccess: (_data, ids) => {
      toast.success(i18n.t('toast.article.multipleRestored', { count: ids.length }))
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error(i18n.t('toast.article.multipleRestoreFailed'))
    }
  })
}

// Paginated articles (active) - offset-based
export function useArticlesPaginated(projectId: string, options: ArticlesPaginatedOptions = {}) {
  return useInfiniteQuery({
    ...articlesPaginatedQueryOptions(projectId, options),
    enabled: !!projectId,
  })
}

/**
 * Suspense variant for the articles-list route that prefetches the first page of
 * active articles in its loader (SSR) via `prefetchInfiniteQuery`. Shares
 * `articlesPaginatedQueryOptions` (cache key `['articles', projectId, 'paginated']`)
 * with `useArticlesPaginated` and the loader, so the first page hydrates without a
 * client refetch (no loading flash) and `data.pages` is always defined.
 */
export function useArticlesPaginatedSuspense(
  projectId: string,
  options: ArticlesPaginatedOptions = {},
) {
  return useSuspenseInfiniteQuery(articlesPaginatedQueryOptions(projectId, options))
}

// Paginated archived articles - offset-based
export function useArchivedArticlesPaginated(
  projectId: string,
  options: ArticlesPaginatedOptions = {},
) {
  return useInfiniteQuery({
    ...archivedArticlesPaginatedQueryOptions(projectId, options),
    enabled: !!projectId,
  })
}

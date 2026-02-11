import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  getAllArticles,
  getArticlesByProject,
  getArticle,
  getArchivedArticles,
  archiveArticle,
  restoreArticle,
  scrapeBlog,
  addArticleManually
} from '@/lib/api/articles'

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
    queryKey: ['articles', 'detail', id],
    queryFn: () => getArticle(id),
    enabled: !!id
  })
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

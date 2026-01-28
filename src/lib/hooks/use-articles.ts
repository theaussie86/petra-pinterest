import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getArticlesByProject,
  getArticle,
  getArchivedArticles,
  archiveArticle,
  restoreArticle,
  scrapeBlog,
  addArticleManually
} from '@/lib/api/articles'

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
      toast.success('Blog scrape started. Articles will appear shortly.')
      queryClient.invalidateQueries({ queryKey: ['articles', variables.blog_project_id] })
    },
    onError: () => {
      toast.error('Failed to scrape blog. Check your blog URL and try again.')
    }
  })
}

export function useArchiveArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: archiveArticle,
    onSuccess: () => {
      toast.success('Article archived')
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error('Failed to archive article')
    }
  })
}

export function useRestoreArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: restoreArticle,
    onSuccess: () => {
      toast.success('Article restored')
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
    onError: () => {
      toast.error('Failed to restore article')
    }
  })
}

export function useAddArticle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, url }: { projectId: string; url: string }) =>
      addArticleManually(projectId, url),
    onSuccess: (_data, variables) => {
      toast.success('Article added successfully')
      queryClient.invalidateQueries({ queryKey: ['articles', variables.projectId] })
    },
    onError: () => {
      toast.error('Failed to add article. Check the URL and try again.')
    }
  })
}

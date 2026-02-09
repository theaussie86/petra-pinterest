import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getBlogProjects,
  getBlogProject,
  createBlogProject,
  updateBlogProject,
  deleteBlogProject
} from '@/lib/api/blog-projects'
import type { BlogProject, BlogProjectInsert } from '@/types/blog-projects'

export function useBlogProjects() {
  return useQuery({
    queryKey: ['blog-projects'],
    queryFn: getBlogProjects,
    staleTime: 30000
  })
}

export function useBlogProject(id: string) {
  return useQuery({
    queryKey: ['blog-projects', id],
    queryFn: () => getBlogProject(id),
    enabled: !!id
  })
}

export function useCreateBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBlogProject,
    onMutate: async (newProject: BlogProjectInsert) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['blog-projects'] })

      // Snapshot previous data
      const previousProjects = queryClient.getQueryData<BlogProject[]>(['blog-projects'])

      // Optimistically add temp item to cache
      if (previousProjects) {
        queryClient.setQueryData<BlogProject[]>(['blog-projects'], [
          {
            id: 'temp-' + Date.now(),
            tenant_id: 'temp',
            name: newProject.name,
            blog_url: newProject.blog_url,
            rss_url: newProject.rss_url ?? null,
            sitemap_url: newProject.sitemap_url ?? null,
            scraping_frequency: newProject.scraping_frequency ?? 'manual',
            description: newProject.description ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          ...previousProjects
        ])
      }

      // Return snapshot for rollback
      return { previousProjects }
    },
    onError: (_error, _variables, context) => {
      // Rollback to snapshot
      if (context?.previousProjects) {
        queryClient.setQueryData(['blog-projects'], context.previousProjects)
      }
      toast.error('Failed to create project')
    },
    onSuccess: () => {
      toast.success('Project created')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    }
  })
}

export function useUpdateBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateBlogProject,
    onSuccess: () => {
      toast.success('Project updated')
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    },
    onError: () => {
      toast.error('Failed to update project')
    }
  })
}

export function useDeleteBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBlogProject,
    onSuccess: () => {
      toast.success('Project deleted')
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    },
    onError: () => {
      toast.error('Failed to delete project')
    }
  })
}

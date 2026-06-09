import { useQuery, useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  getBlogProject,
  createBlogProject,
  updateBlogProject,
  deleteBlogProject
} from '@/lib/api/blog-projects'
import { blogProjectsQueryOptions, BLOG_PROJECTS_QUERY_KEY } from '@/lib/query/blog-projects'
import type { BlogProject, BlogProjectInsert } from '@/types/blog-projects'

export function useBlogProjects() {
  return useQuery(blogProjectsQueryOptions())
}

/**
 * Suspense variant for routes that prefetch the list in their loader (SSR).
 * Shares `blogProjectsQueryOptions` (and thus the `BLOG_PROJECTS_QUERY_KEY` cache
 * entry) with `useBlogProjects` and the route loader, so loader-prefetched data
 * hydrates without a client refetch and `data` is always defined.
 */
export function useBlogProjectsSuspense() {
  return useSuspenseQuery(blogProjectsQueryOptions())
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
      await queryClient.cancelQueries({ queryKey: BLOG_PROJECTS_QUERY_KEY })

      // Snapshot previous data
      const previousProjects = queryClient.getQueryData<BlogProject[]>(BLOG_PROJECTS_QUERY_KEY)

      // Optimistically add temp item to cache
      if (previousProjects) {
        queryClient.setQueryData<BlogProject[]>(BLOG_PROJECTS_QUERY_KEY, [
          {
            id: 'temp-' + Date.now(),
            tenant_id: 'temp',
            name: newProject.name,
            blog_url: newProject.blog_url,
            sitemap_url: newProject.sitemap_url ?? null,
            scraping_frequency: newProject.scraping_frequency ?? 'manual',
            description: newProject.description ?? null,
            language: null,
            target_audience: null,
            brand_voice: null,
            visual_style: null,
            general_keywords: null,
            value_proposition: null,
            style_options: null,
            content_type: null,
            main_motifs: null,
            color_palette: null,
            text_instructions: null,
            blog_niche: null,
            additional_instructions: null,
            topic_context: null,
            visual_audience: null,
            lighting_description: null,
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
        queryClient.setQueryData(BLOG_PROJECTS_QUERY_KEY, context.previousProjects)
      }
      toast.error(i18n.t('toast.project.createFailed'))
    },
    onSuccess: () => {
      toast.success(i18n.t('toast.project.created'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BLOG_PROJECTS_QUERY_KEY })
    }
  })
}

export function useUpdateBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateBlogProject,
    onSuccess: () => {
      toast.success(i18n.t('toast.project.updated'))
      queryClient.invalidateQueries({ queryKey: BLOG_PROJECTS_QUERY_KEY })
    },
    onError: () => {
      toast.error(i18n.t('toast.project.updateFailed'))
    }
  })
}

export function useDeleteBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBlogProject,
    onSuccess: () => {
      toast.success(i18n.t('toast.project.deleted'))
      queryClient.invalidateQueries({ queryKey: BLOG_PROJECTS_QUERY_KEY })
    },
    onError: () => {
      toast.error(i18n.t('toast.project.deleteFailed'))
    }
  })
}

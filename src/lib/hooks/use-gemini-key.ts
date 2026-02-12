import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  storeGeminiKeyFn,
  deleteGeminiKeyFn,
  getGeminiKeyStatusFn,
} from '@/lib/server/gemini-key'

/**
 * Hook: Check if a Gemini API key is configured for a blog project.
 */
export function useGeminiKeyStatus(blogProjectId: string) {
  return useQuery({
    queryKey: ['gemini-key-status', blogProjectId],
    queryFn: async () => {
      const result = await getGeminiKeyStatusFn({
        data: { blog_project_id: blogProjectId },
      })
      return result
    },
    staleTime: 30_000,
  })
}

/**
 * Hook: Store a Gemini API key for a blog project.
 */
export function useStoreGeminiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      blog_project_id,
      api_key,
    }: {
      blog_project_id: string
      api_key: string
    }) => {
      const result = await storeGeminiKeyFn({
        data: { blog_project_id, api_key },
      })
      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['gemini-key-status', variables.blog_project_id],
      })
      toast.success(i18n.t('toast.gemini.saved'))
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.gemini.saveFailed'))
    },
  })
}

/**
 * Hook: Delete the Gemini API key for a blog project.
 */
export function useDeleteGeminiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      blog_project_id,
    }: {
      blog_project_id: string
    }) => {
      const result = await deleteGeminiKeyFn({
        data: { blog_project_id },
      })
      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['gemini-key-status', variables.blog_project_id],
      })
      toast.success(i18n.t('toast.gemini.deleted'))
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.gemini.deleteFailed'))
    },
  })
}

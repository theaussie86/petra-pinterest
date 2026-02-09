import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  initPinterestOAuthFn,
  disconnectPinterestFn,
  getPinterestConnectionFn,
} from '@/lib/server/pinterest-oauth'
import { fetchPinterestBoardsFn } from '@/lib/server/pinterest-boards'

/**
 * Hook: Get Pinterest connection status for a blog project
 */
export function usePinterestConnection(blogProjectId: string) {
  return useQuery({
    queryKey: ['pinterest-connection', blogProjectId],
    queryFn: async () => {
      const result = await getPinterestConnectionFn({ data: { blog_project_id: blogProjectId } })
      if (!result.success) {
        throw new Error(result.error)
      }
      return result
    },
    staleTime: 30_000, // 30 seconds
  })
}

/**
 * Hook: Initiate Pinterest OAuth flow
 */
export function useConnectPinterest() {
  return useMutation({
    mutationFn: async ({ blog_project_id }: { blog_project_id: string }) => {
      const result = await initPinterestOAuthFn({ data: { blog_project_id } })
      if (!result.success) {
        throw new Error(result.error || 'Failed to initiate OAuth')
      }
      return result
    },
    onSuccess: (result) => {
      // Redirect to Pinterest OAuth
      if (result.authUrl) {
        window.location.href = result.authUrl
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook: Disconnect Pinterest account from blog project
 */
export function useDisconnectPinterest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ blog_project_id }: { blog_project_id: string }) => {
      const result = await disconnectPinterestFn({ data: { blog_project_id } })
      if (!result.success) {
        throw new Error(result.error || 'Failed to disconnect')
      }
      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-connection', variables.blog_project_id] })
      queryClient.invalidateQueries({ queryKey: ['pinterest-boards'] })
      toast.success('Pinterest disconnected')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook: Fetch boards from Pinterest API (cached for 5 minutes)
 */
export function usePinterestBoards(blogProjectId: string) {
  return useQuery({
    queryKey: ['pinterest-boards', blogProjectId],
    queryFn: async () => {
      const result = await fetchPinterestBoardsFn({ data: { blog_project_id: blogProjectId } })
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch boards')
      }
      return result.boards
    },
    enabled: !!blogProjectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

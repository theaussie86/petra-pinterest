import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  listConnectedAgents,
  revokeConnectedAgent,
} from '@/lib/api/connected-agents'

const QUERY_KEY = ['connected-agents'] as const

/**
 * Hook: list the user's Connected Agents (OAuth grants).
 *
 * The grants come from the browser Supabase client under the caller's session,
 * so this only resolves once hydrated — keep it client-driven.
 */
export function useConnectedAgents() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: listConnectedAgents,
    staleTime: 30_000,
  })
}

/**
 * Hook: revoke a Connected Agent, then refresh the list so the row disappears.
 */
export function useRevokeConnectedAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (clientId: string) => revokeConnectedAgent(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success(i18n.t('toast.connectedAgents.revoked'))
    },
    onError: () => {
      toast.error(i18n.t('toast.connectedAgents.revokeFailed'))
    },
  })
}

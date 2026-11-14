import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { getAiMetadataEnabled, setAiMetadataEnabled } from '@/lib/api/tenant-settings'

export const AI_METADATA_SETTING_QUERY_KEY = ['tenant-settings', 'ai-metadata-enabled'] as const

/**
 * Hook: is automatic AI metadata generation (Gemini) on for this account?
 * Defaults to `true` while loading or when the read fails, the same default the
 * database uses (no row = on). The server and the DB still enforce the real
 * value, so a stale `true` here can never start a Gemini run.
 */
export function useAiMetadataEnabled() {
  const query = useQuery({
    queryKey: AI_METADATA_SETTING_QUERY_KEY,
    queryFn: () => getAiMetadataEnabled(),
    staleTime: 30_000,
  })
  return { enabled: query.data ?? true, isLoading: query.isLoading, isError: query.isError }
}

/** Hook: switch AI metadata generation on or off for this account. */
export function useSetAiMetadataEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => setAiMetadataEnabled(enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: AI_METADATA_SETTING_QUERY_KEY })
      const previous = queryClient.getQueryData<boolean>(AI_METADATA_SETTING_QUERY_KEY)
      queryClient.setQueryData(AI_METADATA_SETTING_QUERY_KEY, enabled)
      return { previous }
    },
    onSuccess: (_data, enabled) => {
      toast.success(i18n.t(enabled ? 'toast.aiMetadataSetting.enabled' : 'toast.aiMetadataSetting.disabled'))
    },
    onError: (_error, _enabled, context) => {
      queryClient.setQueryData(AI_METADATA_SETTING_QUERY_KEY, context?.previous)
      toast.error(i18n.t('toast.aiMetadataSetting.saveFailed'))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: AI_METADATA_SETTING_QUERY_KEY })
    },
  })
}

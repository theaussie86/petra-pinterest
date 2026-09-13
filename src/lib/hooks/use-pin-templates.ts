import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { updatePinTemplateStatus } from '@/lib/api/pin-templates'
import {
  pinTemplatesByArticleQueryOptions,
  pinTemplateOpenCountsQueryOptions,
} from '@/lib/query/pin-templates'
import type { PinTemplateStatus } from '@/types/pin-templates'

/**
 * Templates for a single article, ordered by position. `enabled` guards against
 * an empty article id (nothing selected yet).
 */
export function usePinTemplatesByArticle(articleId: string) {
  return useQuery({
    ...pinTemplatesByArticleQueryOptions(articleId),
    enabled: !!articleId,
  })
}

/**
 * Per-article *open* template counts for a project (left-column badges).
 */
export function usePinTemplateOpenCounts(projectId: string) {
  return useQuery({
    ...pinTemplateOpenCountsQueryOptions(projectId),
    enabled: !!projectId,
  })
}

/**
 * Change a template's review status. Invalidates the whole `['pin-templates']`
 * prefix so both the selected article's template list (tab counters) and the
 * left-column open counts refresh without a reload. Failures surface as a toast.
 */
export function useUpdatePinTemplateStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PinTemplateStatus }) =>
      updatePinTemplateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pin-templates'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pinTemplate.statusUpdateFailed', { error: error.message }))
    },
  })
}

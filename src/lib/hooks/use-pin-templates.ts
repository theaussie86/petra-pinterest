import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  updatePinTemplateStatus,
  requestPinTemplateRevision,
} from '@/lib/api/pin-templates'
import {
  pinTemplatesByArticleQueryOptions,
  pinTemplateCountsQueryOptions,
  pinTemplateRevisionsQueryOptions,
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
 * Per-article workspace counts for a project (left-column progress + badges).
 */
export function usePinTemplateCounts(projectId: string) {
  return useQuery({
    ...pinTemplateCountsQueryOptions(projectId),
    enabled: !!projectId,
  })
}

/**
 * Change a template's review status. Invalidates the whole `['pin-templates']`
 * prefix so both the selected article's template list (tab counters) and the
 * left-column counts refresh without a reload. Failures surface as a toast.
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

/**
 * Revision history (last 3, newest first) for a template. `enabled` guards
 * against an empty template id (nothing selected yet).
 */
export function usePinTemplateRevisions(templateId: string) {
  return useQuery({
    ...pinTemplateRevisionsQueryOptions(templateId),
    enabled: !!templateId,
  })
}

/**
 * Request a revision on a template: records the feedback and moves the template
 * to `needs_revision` in one step. Invalidates the whole `['pin-templates']`
 * prefix so the detail history, the tab counters and the left-column counts
 * all refresh without a reload. Failures surface as a toast.
 */
export function useRequestPinTemplateRevision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) =>
      requestPinTemplateRevision(id, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pin-templates'] })
      toast.success(i18n.t('toast.pinTemplate.revisionRequested'))
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pinTemplate.revisionRequestFailed', { error: error.message }))
    },
  })
}

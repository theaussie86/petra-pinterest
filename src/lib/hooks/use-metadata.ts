import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { generateMetadataFn, generateMetadataWithFeedbackFn, triggerBulkMetadataFn } from '@/lib/server/metadata'
import { getMetadataHistory, restoreMetadataGeneration } from '@/lib/api/metadata'

/**
 * Query hook: Get metadata generation history for a pin.
 * Returns up to last 3 generations.
 */
export function useMetadataHistory(pinId: string) {
  return useQuery({
    queryKey: ['metadata-history', pinId],
    queryFn: () => getMetadataHistory(pinId),
    enabled: !!pinId,
    staleTime: 30000,
  })
}

/**
 * Mutation hook: Generate metadata for a single pin.
 * Calls server function, invalidates pin and history queries on success.
 */
export function useGenerateMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_id }: { pin_id: string }) => {
      return await generateMetadataFn({ data: { pin_id } })
    },
    onSuccess: () => {
      toast.success('Metadata generated')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      queryClient.invalidateQueries({ queryKey: ['metadata-history'] })
    },
    onError: () => {
      toast.error('Failed to generate metadata')
    },
  })
}

/**
 * Mutation hook: Generate metadata with feedback for a single pin.
 * Uses conversation history to refine based on user feedback.
 */
export function useGenerateMetadataWithFeedback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_id, feedback }: { pin_id: string; feedback: string }) => {
      return await generateMetadataWithFeedbackFn({ data: { pin_id, feedback } })
    },
    onSuccess: () => {
      toast.success('Metadata regenerated')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      queryClient.invalidateQueries({ queryKey: ['metadata-history'] })
    },
    onError: () => {
      toast.error('Failed to regenerate metadata')
    },
  })
}

/**
 * Mutation hook: Trigger bulk metadata generation for multiple pins.
 * Sends Inngest event for async processing.
 */
export function useTriggerBulkMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_ids }: { pin_ids: string[] }) => {
      return await triggerBulkMetadataFn({ data: { pin_ids } })
    },
    onSuccess: (data) => {
      toast.success(`Metadata generation started for ${data.pins_queued} pins`)
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to start bulk metadata generation')
    },
  })
}

/**
 * Mutation hook: Restore a previous metadata generation to the pin.
 * Updates the pin with the selected generation's metadata.
 */
export function useRestoreMetadataGeneration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pinId, generationId }: { pinId: string; generationId: string }) => {
      return await restoreMetadataGeneration(pinId, generationId)
    },
    onSuccess: () => {
      toast.success('Metadata restored')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      queryClient.invalidateQueries({ queryKey: ['metadata-history'] })
    },
    onError: () => {
      toast.error('Failed to restore metadata')
    },
  })
}

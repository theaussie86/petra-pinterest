import { useQuery } from '@tanstack/react-query'
import { getPinPublishEvents } from '@/lib/api/pin-publish-events'

/**
 * Query hook: publish event history for a pin (newest first).
 * Realtime inserts are picked up via useRealtimeInvalidation in the consuming
 * component; this query also refetches whenever the pin detail mounts.
 */
export function usePinPublishEvents(pinId: string) {
  return useQuery({
    queryKey: ['pin-publish-events', pinId],
    queryFn: () => getPinPublishEvents(pinId),
    enabled: !!pinId,
    staleTime: 30000,
  })
}

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userQueryOptions } from '@/lib/query/user'
import { subscribeTenantBroadcast } from '@/lib/realtime/tenant-broadcast'

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimeInvalidationConfig {
  event: PostgresEvent
  table: string
  /**
   * Optional client-side filter: only invalidate when the broadcast payload's
   * `column` equals `value` (e.g. `{ column: 'blog_project_id', value: id }`).
   * Omit to react to every change of the table in the tenant.
   */
  filter?: { column: string; value: string }
}

/**
 * Invalidate TanStack Query keys when a matching change is broadcast on the
 * user's private tenant channel (issue #153). This replaces the old
 * `postgres_changes` subscription: the source is now a DB-trigger Broadcast
 * (see `src/lib/realtime/tenant-broadcast.ts`), filtered client-side by table,
 * operation and an optional column match. The contract is otherwise unchanged —
 * a change comes in, the given query keys are invalidated.
 */
export function useRealtimeInvalidation(
  config: RealtimeInvalidationConfig,
  queryKeys: string[][],
) {
  const queryClient = useQueryClient()
  const { data: user } = useQuery(userQueryOptions())
  const tenantId = user?.tenant_id

  const { event, table } = config
  const filterColumn = config.filter?.column
  const filterValue = config.filter?.value

  // Keep the latest queryKeys without resubscribing on every render (a new
  // array identity each render would otherwise tear down and rebuild the
  // listener needlessly).
  const queryKeysRef = useRef(queryKeys)
  queryKeysRef.current = queryKeys

  useEffect(() => {
    if (!tenantId) return

    return subscribeTenantBroadcast(tenantId, (change) => {
      if (change.table !== table) return
      if (event !== '*' && change.operation !== event) return
      if (
        filterColumn !== undefined &&
        String(change[filterColumn] ?? '') !== filterValue
      ) {
        return
      }
      for (const key of queryKeysRef.current) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    })
  }, [tenantId, event, table, filterColumn, filterValue, queryClient])
}

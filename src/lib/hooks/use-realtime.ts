import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export function useRealtimeInvalidation(
  channelName: string,
  config: {
    event: PostgresEvent
    table: string
    filter?: string
  },
  queryKeys: string[][],
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: config.event,
          schema: 'public',
          table: config.table,
          ...(config.filter && { filter: config.filter }),
        },
        () => {
          for (const key of queryKeys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, config.event, config.table, config.filter, queryClient])
}

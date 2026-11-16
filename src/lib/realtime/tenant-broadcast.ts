import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Tenant-scoped Realtime via Broadcast (issue #153, "Skalierung 2b").
 *
 * Instead of each view opening its own `postgres_changes` subscription — which
 * makes Realtime poll the WAL and run RLS per event, by far the biggest DB-time
 * item in `pg_stat_statements` — the whole app shares ONE private Broadcast
 * channel per tenant: topic `tenant:<tenant_id>`. Database triggers emit a
 * minimal change notification with `realtime.send` (see the
 * `00044_realtime_broadcast_changes` migration); the client fans those out to
 * the registered listeners and each decides whether to invalidate.
 *
 * The channel is ref-counted: the first listener for a tenant opens the channel,
 * the last one to leave removes it. This keeps a single socket subscription no
 * matter how many components mount `useRealtimeInvalidation`, and avoids the
 * "duplicate topic" problem of opening the same Broadcast topic twice.
 */

/** Minimal change notification carried by a tenant Broadcast message. */
export interface TenantBroadcastChange {
  table: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  blog_project_id?: string | null
  pin_id?: string | null
  tenant_id?: string | null
  id?: string | null
  [key: string]: unknown
}

type Listener = (change: TenantBroadcastChange) => void

interface TenantSubscription {
  channel: RealtimeChannel
  listeners: Set<Listener>
}

const subscriptions = new Map<string, TenantSubscription>()

/**
 * Register a listener on the tenant's private Broadcast channel. Returns an
 * unsubscribe function; when the last listener for a tenant unsubscribes, the
 * underlying channel is removed.
 *
 * `client` is injectable for tests; production callers use the default browser
 * client.
 */
export function subscribeTenantBroadcast(
  tenantId: string,
  listener: Listener,
  client: SupabaseClient = supabase,
): () => void {
  let subscription = subscriptions.get(tenantId)

  if (!subscription) {
    const channel = client.channel(`tenant:${tenantId}`, {
      config: { private: true },
    })
    const sub: TenantSubscription = { channel, listeners: new Set() }
    subscription = sub

    channel.on('broadcast', { event: '*' }, (message) => {
      const change = (message as { payload?: TenantBroadcastChange }).payload
      if (!change) return
      for (const l of sub.listeners) l(change)
    })

    // Private channels authorize against RLS on `realtime.messages`, which needs
    // the user's access token set on the Realtime socket.
    void client.realtime.setAuth()
    channel.subscribe()

    subscriptions.set(tenantId, sub)
  }

  subscription.listeners.add(listener)

  return () => {
    const current = subscriptions.get(tenantId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      void client.removeChannel(current.channel)
      subscriptions.delete(tenantId)
    }
  }
}

/** Test seam: drop all channels/listeners between tests. */
export function __resetTenantBroadcastForTests() {
  subscriptions.clear()
}

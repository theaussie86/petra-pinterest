import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// The module imports the browser client at load; tests inject their own fake
// client, so stub the singleton to avoid the env-var guard in supabase.ts.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
  __resetTenantBroadcastForTests,
  subscribeTenantBroadcast,
  type TenantBroadcastChange,
} from './tenant-broadcast'

interface FakeChannel {
  topic: string
  config: unknown
  handler?: (message: { payload: TenantBroadcastChange }) => void
  subscribed: boolean
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function makeClient() {
  const channels: FakeChannel[] = []
  const setAuth = vi.fn().mockResolvedValue(undefined)
  const removeChannel = vi.fn().mockResolvedValue('ok')

  const client = {
    realtime: { setAuth },
    removeChannel,
    channel: vi.fn((topic: string, config: unknown) => {
      const ch: FakeChannel = {
        topic,
        config,
        subscribed: false,
        on: vi.fn((_type: string, _filter: unknown, cb: FakeChannel['handler']) => {
          ch.handler = cb
          return ch
        }),
        subscribe: vi.fn(() => {
          ch.subscribed = true
          return ch
        }),
      }
      channels.push(ch)
      return ch
    }),
  }

  return { client: client as unknown as SupabaseClient, channels, setAuth, removeChannel }
}

afterEach(() => {
  __resetTenantBroadcastForTests()
  vi.clearAllMocks()
})

describe('subscribeTenantBroadcast', () => {
  it('opens one private channel on the tenant topic and authorizes it', () => {
    const { client, channels, setAuth } = makeClient()

    subscribeTenantBroadcast('tenant-a', () => {}, client)

    expect(channels).toHaveLength(1)
    expect(channels[0].topic).toBe('tenant:tenant-a')
    expect(channels[0].config).toEqual({ config: { private: true } })
    expect(channels[0].subscribed).toBe(true)
    expect(setAuth).toHaveBeenCalledTimes(1)
  })

  it('dispatches broadcast payloads to every registered listener', () => {
    const { client, channels } = makeClient()
    const a = vi.fn()
    const b = vi.fn()

    subscribeTenantBroadcast('tenant-a', a, client)
    subscribeTenantBroadcast('tenant-a', b, client)

    // Second listener reuses the single channel (ref-counted).
    expect(channels).toHaveLength(1)

    const change: TenantBroadcastChange = { table: 'pins', operation: 'UPDATE' }
    channels[0].handler?.({ payload: change })

    expect(a).toHaveBeenCalledWith(change)
    expect(b).toHaveBeenCalledWith(change)
  })

  it('ignores a message with no payload', () => {
    const { client, channels } = makeClient()
    const listener = vi.fn()
    subscribeTenantBroadcast('tenant-a', listener, client)

    channels[0].handler?.({} as { payload: TenantBroadcastChange })

    expect(listener).not.toHaveBeenCalled()
  })

  it('removes the channel only after the last listener unsubscribes', () => {
    const { client, channels, removeChannel } = makeClient()
    const unsubA = subscribeTenantBroadcast('tenant-a', () => {}, client)
    const unsubB = subscribeTenantBroadcast('tenant-a', () => {}, client)

    unsubA()
    expect(removeChannel).not.toHaveBeenCalled()

    unsubB()
    expect(removeChannel).toHaveBeenCalledWith(channels[0])
  })

  it('keeps separate channels per tenant', () => {
    const { client, channels } = makeClient()
    subscribeTenantBroadcast('tenant-a', () => {}, client)
    subscribeTenantBroadcast('tenant-b', () => {}, client)

    expect(channels.map((c) => c.topic)).toEqual([
      'tenant:tenant-a',
      'tenant:tenant-b',
    ])
  })
})

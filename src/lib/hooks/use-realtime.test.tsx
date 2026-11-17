import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { USER_QUERY_KEY } from '@/lib/query/user'
import type { TenantBroadcastChange } from '@/lib/realtime/tenant-broadcast'
import {
  useRealtimeInvalidation,
  type RealtimeInvalidationConfig,
} from './use-realtime'

// Capture the listener registered with the shared broadcast manager so tests
// can push synthetic changes without a real Supabase channel.
const { subscribeMock, lastTenant, listeners } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  lastTenant: { value: '' },
  listeners: [] as Array<(change: TenantBroadcastChange) => void>,
}))

vi.mock('@/lib/realtime/tenant-broadcast', () => ({
  subscribeTenantBroadcast: (
    tenantId: string,
    listener: (change: TenantBroadcastChange) => void,
  ) => {
    subscribeMock(tenantId)
    lastTenant.value = tenantId
    listeners.push(listener)
    return () => {
      const i = listeners.indexOf(listener)
      if (i >= 0) listeners.splice(i, 1)
    }
  },
}))

function Harness({ config }: { config: RealtimeInvalidationConfig }) {
  useRealtimeInvalidation(config, [['pins', 'p1']])
  return null
}

function renderWithUser(
  ui: React.ReactElement,
  tenantId: string | null = 'tenant-a',
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(
    USER_QUERY_KEY,
    tenantId ? { id: 'u1', email: '', tenant_id: tenantId, display_name: '', features: [] } : null,
  )
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  return {
    invalidateSpy,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  }
}

function emit(change: TenantBroadcastChange) {
  for (const l of listeners) l(change)
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.length = 0
  lastTenant.value = ''
})

afterEach(() => {
  cleanup()
})

describe('useRealtimeInvalidation', () => {
  it('subscribes to the current user tenant channel', () => {
    renderWithUser(
      <Harness config={{ event: 'UPDATE', table: 'pins' }} />,
      'tenant-xyz',
    )
    expect(subscribeMock).toHaveBeenCalledWith('tenant-xyz')
  })

  it('does not subscribe when the tenant is unknown', () => {
    renderWithUser(<Harness config={{ event: 'UPDATE', table: 'pins' }} />, null)
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it('invalidates the keys on a matching table + operation', () => {
    const { invalidateSpy } = renderWithUser(
      <Harness config={{ event: 'UPDATE', table: 'pins' }} />,
    )
    emit({ table: 'pins', operation: 'UPDATE' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pins', 'p1'] })
  })

  it('ignores a different table', () => {
    const { invalidateSpy } = renderWithUser(
      <Harness config={{ event: 'UPDATE', table: 'pins' }} />,
    )
    emit({ table: 'blog_articles', operation: 'UPDATE' })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('ignores a different operation', () => {
    const { invalidateSpy } = renderWithUser(
      <Harness config={{ event: 'UPDATE', table: 'pins' }} />,
    )
    emit({ table: 'pins', operation: 'INSERT' })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('applies a column filter against the payload', () => {
    const { invalidateSpy } = renderWithUser(
      <Harness
        config={{
          event: 'UPDATE',
          table: 'pins',
          filter: { column: 'blog_project_id', value: 'proj-1' },
        }}
      />,
    )
    emit({ table: 'pins', operation: 'UPDATE', blog_project_id: 'proj-2' })
    expect(invalidateSpy).not.toHaveBeenCalled()

    emit({ table: 'pins', operation: 'UPDATE', blog_project_id: 'proj-1' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pins', 'p1'] })
  })

  it('matches any operation when event is "*"', () => {
    const { invalidateSpy } = renderWithUser(
      <Harness config={{ event: '*', table: 'pins' }} />,
    )
    emit({ table: 'pins', operation: 'DELETE' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pins', 'p1'] })
  })
})

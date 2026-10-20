import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleMcpRequest } from '../handler'
import type { McpHandlerDeps, McpUserContext } from '../context'

// The tools pull in the API layer, which imports the browser client and the
// isomorphic selector at module load. Every tool here uses the injected
// `ctx.supabase`, so these defaults are never used — stub them so module load
// doesn't demand real Supabase env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/supabase-iso', () => ({ getSupabaseClient: () => ({}) }))

const BASE_URL = 'https://pinfinity.test'

/** 15 minutes, the minimum schedule buffer (ADR-0006). */
const BUFFER_MS = 15 * 60 * 1000

interface FakeCalls {
  updates: Array<{ id: unknown; value: Record<string, unknown> }>
}

/**
 * A recording fake Supabase client keyed by pin id. `from('pins')` resolves
 * selects to the stored pin (for getPin) and updates to the stored pin merged
 * with the patch (for updateAgentPin), recording each update.
 */
function fakeSupabase(pins: Record<string, Record<string, unknown>> = {}): {
  client: SupabaseClient
  calls: FakeCalls
} {
  const calls: FakeCalls = { updates: [] }

  const from = () => {
    const state: {
      op: 'update' | null
      payload: Record<string, unknown>
      id: unknown
    } = { op: null, payload: {}, id: undefined }
    const builder: Record<string, unknown> = {
      update(value: Record<string, unknown>) {
        state.op = 'update'
        state.payload = value
        return builder
      },
      select: () => builder,
      eq(_col: string, value: unknown) {
        state.id = value
        return builder
      },
      single: () => builder,
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        const existing = pins[String(state.id)]
        if (!existing) {
          return Promise.resolve({ data: null, error: { message: 'not found' } }).then(
            resolve,
          )
        }
        let data: unknown
        if (state.op === 'update') {
          calls.updates.push({ id: state.id, value: state.payload })
          data = { ...existing, ...state.payload }
        } else {
          data = existing
        }
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return builder
  }

  const client = {
    from,
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/pin-images/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient

  return { client, calls }
}

function userContext(overrides: Partial<McpUserContext> = {}): McpUserContext {
  const { client } = fakeSupabase()
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    displayName: 'Petra',
    email: 'petra@example.com',
    features: [],
    oauthClientId: 'client-abc',
    supabase: client,
    syncPublishJobs: vi.fn(async () => {}),
    ...overrides,
  }
}

function makeDeps(ctx: McpUserContext): McpHandlerDeps {
  return {
    authenticate: async (token) => (token === 'valid-token' ? ctx : null),
    baseUrl: BASE_URL,
    authServerUrl: 'https://project.supabase.co',
  }
}

function rpcRequest(body: unknown): Request {
  return new Request(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer valid-token',
    },
    body: JSON.stringify(body),
  })
}

async function listTools(ctx: McpUserContext) {
  const res = await handleMcpRequest(
    rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    makeDeps(ctx),
  )
  const body = await res.json()
  return body.result.tools as Array<{
    name: string
    description: string
    inputSchema: { properties?: Record<string, unknown> }
  }>
}

async function callTool(ctx: McpUserContext, name: string, args: unknown = {}) {
  const res = await handleMcpRequest(
    rpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    makeDeps(ctx),
  )
  const body = await res.json()
  const result = body.result as {
    content: Array<{ text: string }>
    isError?: boolean
  }
  const text = result?.content?.[0]?.text
  let payload: any
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    payload = undefined
  }
  return { res, result, payload, text }
}

/** A `scheduled_at` safely past the 15-minute buffer. */
function futureIso(msFromNow = BUFFER_MS + 60 * 60 * 1000): string {
  return new Date(Date.now() + msFromNow).toISOString()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('schedule tools — tools/list', () => {
  it('lists schedule_pins (with dry_run) and unschedule_pin', async () => {
    const tools = await listTools(userContext())

    const schedule = tools.find((t) => t.name === 'schedule_pins')
    expect(schedule).toBeDefined()
    expect(schedule?.description && schedule.description.length).toBeTruthy()
    expect(schedule?.inputSchema.properties).toHaveProperty('dry_run')

    const unschedule = tools.find((t) => t.name === 'unschedule_pin')
    expect(unschedule).toBeDefined()
  })

  it('exposes no immediate-publish action tool (out of v1, ADR-0006)', async () => {
    const tools = await listTools(userContext())
    expect(
      tools.some((t) => /^(publish|veroeffentlich)/i.test(t.name) || /publish_(pin|now)/i.test(t.name)),
    ).toBe(false)
  })
})

describe('schedule_pins', () => {
  it('previews the plan without saving on the default dry run', async () => {
    const { client, calls } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'metadata_created' },
    })
    const ctx = userContext({ supabase: client })
    const when = futureIso()

    const { payload, result } = await callTool(ctx, 'schedule_pins', {
      schedule: [{ pin_id: 'pin-1', scheduled_at: when }],
    })

    expect(result.isError).toBeFalsy()
    expect(payload.dry_run).toBe(true)
    expect(payload.saved).toBe(false)
    expect(payload.scheduled).toBe(1)
    expect(payload.plan[0]).toMatchObject({ pin_id: 'pin-1', accepted: true })
    expect(calls.updates).toHaveLength(0)
    expect(ctx.syncPublishJobs).not.toHaveBeenCalled()
  })

  it('rejects a pin whose status is not metadata_created, with a reason', async () => {
    const { client } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'draft' },
    })
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'schedule_pins', {
      schedule: [{ pin_id: 'pin-1', scheduled_at: futureIso() }],
    })

    const entry = payload.plan[0]
    expect(entry.accepted).toBe(false)
    expect(entry.reason).toMatch(/status/i)
    expect(payload.rejected).toBe(1)
  })

  it('rejects a time less than 15 minutes in the future, with a reason', async () => {
    const { client } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'metadata_created' },
    })
    const ctx = userContext({ supabase: client })
    // 5 minutes ahead — inside the buffer.
    const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { payload } = await callTool(ctx, 'schedule_pins', {
      schedule: [{ pin_id: 'pin-1', scheduled_at: tooSoon }],
    })

    const entry = payload.plan[0]
    expect(entry.accepted).toBe(false)
    expect(entry.reason).toMatch(/15/)
  })

  it('saves accepted pins and syncs the publish jobs when dry_run is false', async () => {
    const { client, calls } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'metadata_created' },
      'pin-2': { id: 'pin-2', status: 'draft' },
    })
    const ctx = userContext({ supabase: client })
    const when = futureIso()

    const { payload } = await callTool(ctx, 'schedule_pins', {
      dry_run: false,
      schedule: [
        { pin_id: 'pin-1', scheduled_at: when },
        { pin_id: 'pin-2', scheduled_at: when },
      ],
    })

    expect(payload.saved).toBe(true)
    expect(payload.scheduled).toBe(1)
    expect(payload.rejected).toBe(1)

    // Only the accepted pin was written, with provenance.
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].id).toBe('pin-1')
    expect(calls.updates[0].value.scheduled_at).toBe(when)
    expect(calls.updates[0].value.source).toBe('mcp')
    expect(calls.updates[0].value.oauth_client_id).toBe('client-abc')

    // Only the accepted pin's job was reconciled.
    expect(ctx.syncPublishJobs).toHaveBeenCalledWith(['pin-1'])
  })

  it('does not touch the queue when nothing is accepted', async () => {
    const { client, calls } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'draft' },
    })
    const ctx = userContext({ supabase: client })

    await callTool(ctx, 'schedule_pins', {
      dry_run: false,
      schedule: [{ pin_id: 'pin-1', scheduled_at: futureIso() }],
    })

    expect(calls.updates).toHaveLength(0)
    expect(ctx.syncPublishJobs).not.toHaveBeenCalled()
  })
})

describe('unschedule_pin', () => {
  it('clears scheduled_at, stamps provenance and syncs the publish job', async () => {
    const { client, calls } = fakeSupabase({
      'pin-1': { id: 'pin-1', status: 'metadata_created', scheduled_at: futureIso() },
    })
    const ctx = userContext({ supabase: client })

    const { payload, result } = await callTool(ctx, 'unschedule_pin', {
      pin_id: 'pin-1',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.updates[0].value.scheduled_at).toBeNull()
    expect(calls.updates[0].value.source).toBe('mcp')
    expect(payload.scheduled_at).toBeNull()
    expect(ctx.syncPublishJobs).toHaveBeenCalledWith(['pin-1'])
  })

  it('errors when the pin does not exist', async () => {
    const { client } = fakeSupabase({})
    const ctx = userContext({ supabase: client })

    const { result } = await callTool(ctx, 'unschedule_pin', { pin_id: 'ghost' })
    expect(result.isError).toBe(true)
    expect(ctx.syncPublishJobs).not.toHaveBeenCalled()
  })
})

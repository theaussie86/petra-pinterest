import { describe, expect, it, vi } from 'vitest'
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

interface FakeCalls {
  inserts: Array<Record<string, unknown>>
  updates: Array<{ id: unknown; value: Record<string, unknown> }>
  uploads: Array<{ path: string; contentType: string | undefined }>
}

/**
 * A recording fake Supabase client for the write tools. `from(table)` builds a
 * query builder that resolves inserts (payload + id), updates (existing pin +
 * patch) and plain selects (the existing pin, for getPin); storage records
 * uploads and builds a CDN URL — no network, in-memory.
 */
function fakeSupabase(opts: { existingPin?: Record<string, unknown> } = {}): {
  client: SupabaseClient
  calls: FakeCalls
} {
  const calls: FakeCalls = { inserts: [], updates: [], uploads: [] }

  const from = () => {
    const state: {
      op: 'insert' | 'update' | null
      payload: Record<string, unknown>
      id: unknown
    } = { op: null, payload: {}, id: undefined }
    const builder: Record<string, unknown> = {
      insert(value: Record<string, unknown>) {
        state.op = 'insert'
        state.payload = value
        calls.inserts.push(value)
        return builder
      },
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
        let data: unknown
        if (state.op === 'insert') {
          data = { id: 'pin-new', ...state.payload }
        } else if (state.op === 'update') {
          calls.updates.push({ id: state.id, value: state.payload })
          data = { ...(opts.existingPin ?? {}), ...state.payload }
        } else {
          data = opts.existingPin ?? null
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
        upload: (path: string, _body: unknown, options?: { contentType?: string }) => {
          calls.uploads.push({ path, contentType: options?.contentType })
          return Promise.resolve({ error: null })
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/pin-images/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient

  return { client, calls }
}

function imageFetch(contentType = 'image/png', byteLength = 1024) {
  return async () => ({ contentType, bytes: new ArrayBuffer(byteLength) })
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
    fetchRemoteImage: imageFetch(),
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
  return body.result.tools as Array<{ name: string; description: string }>
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

const WRITE_TOOLS = ['create_pin', 'set_pin_metadata', 'update_pin']

describe('write tools — tools/list', () => {
  it('lists the three pin write tools with German descriptions', async () => {
    const tools = await listTools(userContext())
    for (const name of WRITE_TOOLS) {
      const tool = tools.find((t) => t.name === name)
      expect(tool).toBeDefined()
      expect(tool?.description && tool.description.length).toBeTruthy()
    }
  })

  it('exposes no delete tool (no deletes in v1, ADR-0006)', async () => {
    const tools = await listTools(userContext())
    expect(tools.some((t) => /delete|remove|loesch/i.test(t.name))).toBe(false)
  })
})

describe('create_pin', () => {
  it('downloads the image, stores it in the tenant folder and stamps provenance', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload, result } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.uploads).toHaveLength(1)
    expect(calls.uploads[0].path).toMatch(/^tenant-1\/.*\.png$/)
    expect(calls.uploads[0].contentType).toBe('image/png')

    const inserted = calls.inserts[0]
    expect(inserted.source).toBe('mcp')
    expect(inserted.oauth_client_id).toBe('client-abc')
    expect(inserted.tenant_id).toBe('tenant-1')
    expect(payload.id).toBe('pin-new')
  })

  it('leaves a pin without full metadata as a draft (never enqueues Gemini)', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
      title: 'Nur Titel',
    })

    expect(calls.inserts[0].status).toBe('draft')
  })

  it('promotes a pin with full metadata to metadata_created', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
      title: 'Titel',
      description: 'Beschreibung',
      board_id: 'board-1',
      board_name: 'Rezepte',
    })

    expect(calls.inserts[0].status).toBe('metadata_created')
    expect(payload.status).toBe('metadata_created')
    expect(payload.board).toEqual({ id: 'board-1', name: 'Rezepte' })
  })

  it('rejects a non-HTTPS image_url', async () => {
    const { result, text } = await callTool(userContext(), 'create_pin', {
      project_id: 'p1',
      image_url: 'http://example.com/a.png',
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('HTTPS')
  })

  it('rejects a non-image content type', async () => {
    const ctx = userContext({ fetchRemoteImage: imageFetch('text/html') })
    const { result, text } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/page',
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('Content-Type')
  })

  it('rejects an image larger than 20 MB', async () => {
    const ctx = userContext({
      fetchRemoteImage: imageFetch('image/png', 20 * 1024 * 1024 + 1),
    })
    const { result, text } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/huge.png',
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('20 MB')
  })
})

describe('set_pin_metadata', () => {
  it('sets metadata_created when the merged metadata is complete', async () => {
    const { client, calls } = fakeSupabase({
      existingPin: { id: 'pin-1', title: 'Vorhandener Titel', pinterest_board_id: 'b1' },
    })
    const ctx = userContext({ supabase: client })

    const { payload, result } = await callTool(ctx, 'set_pin_metadata', {
      pin_id: 'pin-1',
      description: 'Frische Beschreibung',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.updates[0].value.status).toBe('metadata_created')
    expect(calls.updates[0].value.source).toBe('mcp')
    expect(calls.updates[0].value.oauth_client_id).toBe('client-abc')
    expect(payload.status).toBe('metadata_created')
  })

  it('reports the missing fields when metadata is incomplete', async () => {
    const { client, calls } = fakeSupabase({
      existingPin: { id: 'pin-1', title: 'Nur Titel', pinterest_board_id: null },
    })
    const ctx = userContext({ supabase: client })

    const { result, text } = await callTool(ctx, 'set_pin_metadata', {
      pin_id: 'pin-1',
    })

    expect(result.isError).toBe(true)
    expect(text).toContain('Beschreibung')
    expect(text).toContain('Board')
    expect(text).not.toContain('Titel')
    expect(calls.updates).toHaveLength(0)
  })
})

describe('update_pin', () => {
  it('patches only the given fields and stamps provenance without changing status', async () => {
    const { client, calls } = fakeSupabase({
      existingPin: { id: 'pin-1', status: 'draft' },
    })
    const ctx = userContext({ supabase: client })

    const { result } = await callTool(ctx, 'update_pin', {
      pin_id: 'pin-1',
      link: 'https://blog.test/post',
    })

    expect(result.isError).toBeFalsy()
    const patch = calls.updates[0].value
    expect(patch.alternate_url).toBe('https://blog.test/post')
    expect(patch.source).toBe('mcp')
    expect(patch.status).toBeUndefined()
    expect(patch.title).toBeUndefined()
  })

  it('errors when no field is given', async () => {
    const { client, calls } = fakeSupabase({ existingPin: { id: 'pin-1' } })
    const ctx = userContext({ supabase: client })

    const { result } = await callTool(ctx, 'update_pin', { pin_id: 'pin-1' })
    expect(result.isError).toBe(true)
    expect(calls.updates).toHaveLength(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleMcpRequest } from '../handler'
import type { McpHandlerDeps, McpUserContext } from '../context'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

// The tools pull in the API layer, which imports the browser client and the
// isomorphic selector at module load. Every tool here is called with an
// explicit client (`ctx.supabase`), so these defaults are never used — stub
// them so module load doesn't demand real Supabase env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/supabase-iso', () => ({ getSupabaseClient: () => ({}) }))

const BASE_URL = 'https://pinfinity.test'

/**
 * A fake Supabase client for the read tools: `from(table)` resolves the
 * configured rows for that table (array for lists, object for `.single()`),
 * `rpc` resolves `rpcData`, and `storage.getPublicUrl` builds a CDN URL — no
 * network, in-memory, like the handler tracer's fake (prior art: CaDo mcp.test).
 */
function fakeSupabase(
  opts: {
    tables?: Record<string, unknown>
    rpcData?: unknown
  } = {},
): SupabaseClient {
  const { tables = {}, rpcData = null } = opts
  return {
    from: (name: string) =>
      createMockQueryBuilder({ data: tables[name] ?? null }),
    rpc: async () => ({ data: rpcData, error: null }),
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/pin-images/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient
}

function userContext(overrides: Partial<McpUserContext> = {}): McpUserContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    displayName: 'Petra',
    email: 'petra@example.com',
    features: [],
    oauthClientId: 'client-abc',
    supabase: fakeSupabase(),
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

const READ_TOOLS = [
  'list_projects',
  'get_project',
  'list_articles',
  'get_article',
  'list_pins',
  'get_pin',
  'get_pin_status_counts',
  'list_boards',
  'get_dashboard_stats',
  'list_publish_events',
]

describe('read tools — tools/list', () => {
  it('lists all ten read tools with German descriptions', async () => {
    const tools = await listTools(userContext())
    const names = tools.map((t) => t.name)
    for (const name of READ_TOOLS) {
      expect(names).toContain(name)
    }
  })

  it('gives every read tool a non-empty description', async () => {
    const tools = await listTools(userContext())
    for (const name of READ_TOOLS) {
      const tool = tools.find((t) => t.name === name)
      expect(tool?.description && tool.description.length).toBeTruthy()
    }
  })
})

describe('list_projects', () => {
  it('returns the tenant projects, mapped', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          blog_projects: [
            { id: 'p1', name: 'Blog A', blog_url: 'https://a.test', scraping_frequency: 'weekly' },
            { id: 'p2', name: 'Blog B', blog_url: 'https://b.test', scraping_frequency: 'daily' },
          ],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'list_projects')
    expect(payload.count).toBe(2)
    expect(payload.projects.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2'])
    expect(payload.projects[0].name).toBe('Blog A')
  })
})

describe('get_project', () => {
  it('returns a single project by id', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: { blog_projects: { id: 'p1', name: 'Blog A', brand_voice: 'warm' } },
      }),
    })
    const { payload } = await callTool(ctx, 'get_project', { project_id: 'p1' })
    expect(payload).toMatchObject({ id: 'p1', name: 'Blog A', brand_voice: 'warm' })
  })
})

describe('list_articles', () => {
  it('returns mapped articles with a has_more flag', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          blog_articles: [
            { id: 'a1', blog_project_id: 'p1', title: 'One', url: 'https://a.test/1', archived_at: null },
          ],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'list_articles', { project_id: 'p1', search: 'One' })
    expect(payload.count).toBe(1)
    expect(payload.has_more).toBe(false)
    expect(payload.articles[0]).toMatchObject({ id: 'a1', project_id: 'p1', title: 'One' })
  })
})

describe('get_article', () => {
  it('returns the article including content', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: { blog_articles: { id: 'a1', title: 'One', content: 'Full text' } },
      }),
    })
    const { payload } = await callTool(ctx, 'get_article', { article_id: 'a1' })
    expect(payload).toMatchObject({ id: 'a1', content: 'Full text' })
  })
})

describe('list_pins', () => {
  it('returns pins with image URL, board and scheduling', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          pins: [
            {
              id: 'pin-1',
              blog_project_id: 'p1',
              status: 'metadata_created',
              title: 'Pin title',
              image_path: 'tenant-1/img.png',
              pinterest_board_id: 'b1',
              pinterest_board_name: 'Rezepte',
              scheduled_at: '2026-10-25T09:00:00.000Z',
            },
          ],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'list_pins', { status: ['metadata_created'] })
    expect(payload.count).toBe(1)
    const pin = payload.pins[0]
    expect(pin.image_url).toBe('https://cdn.test/pin-images/tenant-1/img.png')
    expect(pin.board).toEqual({ id: 'b1', name: 'Rezepte' })
    expect(pin.scheduled_at).toBe('2026-10-25T09:00:00.000Z')
    expect(pin.status).toBe('metadata_created')
  })
})

describe('get_pin', () => {
  it('returns one pin with a null board and null image when absent', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          pins: {
            id: 'pin-9',
            blog_project_id: 'p1',
            status: 'draft',
            image_path: null,
            pinterest_board_id: null,
          },
        },
      }),
    })
    const { payload } = await callTool(ctx, 'get_pin', { pin_id: 'pin-9' })
    expect(payload.id).toBe('pin-9')
    expect(payload.image_url).toBeNull()
    expect(payload.board).toBeNull()
  })
})

describe('get_pin_status_counts', () => {
  it('counts pins per status', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          pins: [
            { status: 'draft' },
            { status: 'draft' },
            { status: 'published' },
          ],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'get_pin_status_counts', {})
    expect(payload.counts).toEqual({ draft: 2, published: 1 })
  })
})

describe('list_boards', () => {
  it('returns the project boards via the injected lister', async () => {
    const ctx = userContext({
      listBoards: async (projectId) => {
        expect(projectId).toBe('p1')
        return [{ pinterest_board_id: 'b1', name: 'Rezepte' }]
      },
    })
    const { payload } = await callTool(ctx, 'list_boards', { project_id: 'p1' })
    expect(payload.count).toBe(1)
    expect(payload.boards[0]).toEqual({ pinterest_board_id: 'b1', name: 'Rezepte' })
  })

  it('reports an error when the project has no Pinterest connection', async () => {
    const ctx = userContext({
      listBoards: async () => {
        throw new Error('Für dieses Projekt ist kein Pinterest-Konto verbunden.')
      },
    })
    const { result, text } = await callTool(ctx, 'list_boards', { project_id: 'p1' })
    expect(result.isError).toBe(true)
    expect(text).toContain('Pinterest-Konto')
  })
})

describe('get_dashboard_stats', () => {
  it('returns the RPC aggregate', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        rpcData: {
          global: { scheduled: 3, published: 5, pending: 1, overdue: 0 },
          projects: [{ project_id: 'p1', articles: 10, scheduled: 2, published: 4 }],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'get_dashboard_stats')
    expect(payload.global.published).toBe(5)
    expect(payload.projects[0].project_id).toBe('p1')
  })
})

describe('list_publish_events', () => {
  it('returns mapped events with the embedded pin title and a cursor', async () => {
    const ctx = userContext({
      supabase: fakeSupabase({
        tables: {
          pin_publish_events: [
            {
              id: 'e1',
              pin_id: 'pin-1',
              blog_project_id: 'p1',
              event_type: 'succeeded',
              attempt: 1,
              max_attempts: 3,
              message: null,
              created_at: '2026-10-10T10:00:00.000Z',
              pin: { id: 'pin-1', title: 'A pin' },
            },
          ],
        },
      }),
    })
    const { payload } = await callTool(ctx, 'list_publish_events', { project_id: 'p1' })
    expect(payload.count).toBe(1)
    expect(payload.events[0]).toMatchObject({
      id: 'e1',
      pin_title: 'A pin',
      event_type: 'succeeded',
    })
  })
})

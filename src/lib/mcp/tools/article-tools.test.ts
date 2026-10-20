import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleMcpRequest } from '../handler'
import type { McpHandlerDeps, McpUserContext } from '../context'
import { buildArticle } from '@/test/factories'
import type { Article } from '@/types/articles'

// The tools pull in the API layer, which imports the browser client and the
// isomorphic selector at module load. Every tool here uses the injected
// `ctx.supabase`, so these defaults are never used — stub them so module load
// doesn't demand real Supabase env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/supabase-iso', () => ({ getSupabaseClient: () => ({}) }))

const BASE_URL = 'https://pinfinity.test'

interface RpcCall {
  name: string
  args: Record<string, unknown>
}

interface FakeCalls {
  rpcs: RpcCall[]
  updates: Array<{ id: unknown; value: Record<string, unknown> }>
}

/**
 * A recording fake Supabase client for the article/scraping tools. `rpc` records
 * name + args and resolves a configurable value; `from('blog_articles')` resolves
 * both updates (archive/restore, records the patch + id) and plain selects
 * (getArticle, returns the configured article). No network, in-memory.
 */
function fakeSupabase(
  opts: { article?: Record<string, unknown> | Article | null; rpcData?: unknown } = {},
): { client: SupabaseClient; calls: FakeCalls } {
  const calls: FakeCalls = { rpcs: [], updates: [] }

  const from = () => {
    const state: { op: 'update' | null; payload: Record<string, unknown>; id: unknown } = {
      op: null,
      payload: {},
      id: undefined,
    }
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
        let data: unknown
        if (state.op === 'update') {
          calls.updates.push({ id: state.id, value: state.payload })
          data = { ...(opts.article ?? {}), ...state.payload }
        } else {
          data = opts.article ?? null
        }
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return builder
  }

  const client = {
    from,
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ name, args })
      return Promise.resolve({ data: opts.rpcData ?? null, error: null })
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
  const result = body.result as { content: Array<{ text: string }>; isError?: boolean }
  const text = result?.content?.[0]?.text
  let payload: any
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    payload = undefined
  }
  return { res, result, payload, text }
}

const EXPECTED_TOOLS = [
  'add_article',
  'archive_article',
  'restore_article',
  'scrape_blog',
  'scrape_article',
  'generate_metadata',
]

describe('article/scraping tools — tools/list', () => {
  it('lists all six tools with German descriptions', async () => {
    const tools = await listTools(userContext())
    for (const name of EXPECTED_TOOLS) {
      const tool = tools.find((t) => t.name === name)
      expect(tool, name).toBeDefined()
      expect(tool?.description && tool.description.length).toBeTruthy()
    }
  })

  it('exposes no article delete tool (archive instead, ADR-0006)', async () => {
    const tools = await listTools(userContext())
    expect(tools.some((t) => /delete.*article|article.*delete|loesch/i.test(t.name))).toBe(false)
  })
})

describe('add_article', () => {
  it('enqueues scrape_article with the normalised URL (no dry run)', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { result, payload } = await callTool(ctx, 'add_article', {
      project_id: 'p1',
      url: 'https://Example.com/post/#frag',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.rpcs).toHaveLength(1)
    expect(calls.rpcs[0]).toEqual({
      name: 'enqueue_scrape_article',
      args: { p_blog_project_id: 'p1', p_url: 'https://example.com/post' },
    })
    expect(payload.enqueued).toBe('scrape_article')
  })
})

describe('archive_article / restore_article', () => {
  it('archive_article sets archived_at via the token-bound client', async () => {
    const { client, calls } = fakeSupabase({
      article: { id: 'a1', title: 'Artikel' },
    })
    const ctx = userContext({ supabase: client })

    const { result, payload } = await callTool(ctx, 'archive_article', { article_id: 'a1' })

    expect(result.isError).toBeFalsy()
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].id).toBe('a1')
    expect(calls.updates[0].value.archived_at).toBeTruthy()
    expect(payload.id).toBe('a1')
  })

  it('restore_article clears archived_at', async () => {
    const { client, calls } = fakeSupabase({
      article: { id: 'a1', title: 'Artikel' },
    })
    const ctx = userContext({ supabase: client })

    const { result } = await callTool(ctx, 'restore_article', { article_id: 'a1' })

    expect(result.isError).toBeFalsy()
    expect(calls.updates[0].value.archived_at).toBeNull()
  })
})

describe('scrape_blog', () => {
  it('previews by default without calling the RPC', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'scrape_blog', { project_id: 'p1' })

    expect(calls.rpcs).toHaveLength(0)
    expect(payload.dry_run).toBe(true)
    expect(payload.would_enqueue).toBe('scrape_blog')
  })

  it('enqueues scrape_blog with the project id on dry_run: false', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'scrape_blog', { project_id: 'p1', dry_run: false })

    expect(calls.rpcs).toEqual([
      { name: 'enqueue_scrape_blog', args: { p_blog_project_id: 'p1' } },
    ])
    expect(payload.enqueued).toBe('scrape_blog')
  })
})

describe('scrape_article', () => {
  it('previews the looked-up article by default without calling the RPC', async () => {
    const article = buildArticle({ id: 'a1', url: 'https://blog.test/x', blog_project_id: 'p1' })
    const { client, calls } = fakeSupabase({ article })
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'scrape_article', { article_id: 'a1' })

    expect(calls.rpcs).toHaveLength(0)
    expect(payload.dry_run).toBe(true)
    expect(payload.url).toBe('https://blog.test/x')
    expect(payload.project_id).toBe('p1')
  })

  it('enqueues scrape_article for the article URL on dry_run: false', async () => {
    const article = buildArticle({ id: 'a1', url: 'https://blog.test/x', blog_project_id: 'p1' })
    const { client, calls } = fakeSupabase({ article })
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'scrape_article', {
      article_id: 'a1',
      dry_run: false,
    })

    expect(calls.rpcs).toEqual([
      {
        name: 'enqueue_scrape_article',
        args: { p_blog_project_id: 'p1', p_url: 'https://blog.test/x' },
      },
    ])
    expect(payload.enqueued).toBe('scrape_article')
  })
})

describe('generate_metadata', () => {
  it('is the only one of this slice’s tools whose description mentions Gemini', async () => {
    const tools = await listTools(userContext())
    const gemini = tools.filter(
      (t) => EXPECTED_TOOLS.includes(t.name) && /gemini/i.test(t.description),
    )
    expect(gemini.map((t) => t.name)).toEqual(['generate_metadata'])
  })

  it('previews the pin set by default without calling Gemini/RPC', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'generate_metadata', {
      pin_ids: ['pin-1', 'pin-2'],
    })

    expect(calls.rpcs).toHaveLength(0)
    expect(payload.dry_run).toBe(true)
    expect(payload.count).toBe(2)
    expect(payload.pin_ids).toEqual(['pin-1', 'pin-2'])
  })

  it('enqueues generate_metadata with the pin ids on dry_run: false', async () => {
    const { client, calls } = fakeSupabase({ rpcData: 2 })
    const ctx = userContext({ supabase: client })

    const { payload } = await callTool(ctx, 'generate_metadata', {
      pin_ids: ['pin-1', 'pin-2'],
      dry_run: false,
    })

    expect(calls.rpcs).toEqual([
      { name: 'enqueue_generate_metadata', args: { p_pin_ids: ['pin-1', 'pin-2'] } },
    ])
    expect(payload.pins_queued).toBe(2)
  })
})

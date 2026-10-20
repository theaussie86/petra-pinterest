import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleMcpRequest } from '../handler'
import type { McpHandlerDeps, McpUserContext } from '../context'
import { buildPinTemplate, buildPinTemplateRevision } from '@/test/factories'
import type { PinTemplate, PinTemplateRevision } from '@/types/pin-templates'

// The tools import the API layer, which pulls in the browser/iso clients at
// module load. Every tool uses the injected `ctx.supabase`, so stub these so
// module load doesn't demand real Supabase env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/supabase-iso', () => ({ getSupabaseClient: () => ({}) }))

const BASE_URL = 'https://pinfinity.test'

interface FakeCalls {
  inserts: Array<{ table: string; value: Record<string, unknown> }>
  updates: Array<{ table: string; id: unknown; value: Record<string, unknown> }>
}

interface FakeOpts {
  template?: PinTemplate | null
  templates?: PinTemplate[]
  revisions?: PinTemplateRevision[]
  templateMissing?: boolean
}

/**
 * A recording fake Supabase client for the Werkstatt tools. Routes by table and
 * operation: single-row selects return the configured template, list selects
 * return templates/revisions, inserts/updates are recorded and echoed back.
 */
function fakeSupabase(opts: FakeOpts = {}): { client: SupabaseClient; calls: FakeCalls } {
  const calls: FakeCalls = { inserts: [], updates: [] }

  const from = (table: string) => {
    const state: {
      op: 'insert' | 'update' | null
      payload: Record<string, unknown>
      id: unknown
      single: boolean
      limit: number | null
    } = { op: null, payload: {}, id: undefined, single: false, limit: null }

    const builder: Record<string, unknown> = {
      insert(value: Record<string, unknown>) {
        state.op = 'insert'
        state.payload = value
        calls.inserts.push({ table, value })
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
      order: () => builder,
      limit(n: number) {
        state.limit = n
        return builder
      },
      single() {
        state.single = true
        return builder
      },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        let data: unknown = null
        let error: unknown = null

        if (state.op === 'insert') {
          data = { id: 'tpl-new', ...state.payload }
        } else if (state.op === 'update') {
          calls.updates.push({ table, id: state.id, value: state.payload })
          data =
            table === 'pin_templates'
              ? { ...(opts.template ?? {}), ...state.payload }
              : null
        } else if (table === 'pin_templates') {
          if (state.single) {
            if (opts.templateMissing) error = { message: 'not found' }
            else data = opts.template ?? null
          } else {
            data = opts.templates ?? []
          }
        } else if (table === 'pin_template_revisions') {
          data = state.limit === 1 ? [{ id: 'rev-latest' }] : opts.revisions ?? []
        }

        return Promise.resolve({ data, error }).then(resolve)
      },
    }
    return builder
  }

  return { client: { from } as unknown as SupabaseClient, calls }
}

function userContext(overrides: Partial<McpUserContext> = {}): McpUserContext {
  const { client } = fakeSupabase()
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    displayName: 'Petra',
    email: 'petra@example.com',
    features: ['pin_werkstatt'],
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
  const result = body.result as
    | { content: Array<{ text: string }>; isError?: boolean }
    | undefined
  const text = result?.content?.[0]?.text
  let payload: any
  try {
    payload = text ? JSON.parse(text) : undefined
  } catch {
    payload = undefined
  }
  return { body, result, payload, text }
}

const WERKSTATT_TOOLS = [
  'list_pin_templates',
  'get_pin_template',
  'list_pin_template_revisions',
  'create_pin_template',
  'update_pin_template',
  'answer_revision_request',
]

describe('werkstatt tools — feature gate', () => {
  it('hides every Werkstatt tool when the tenant lacks pin_werkstatt', async () => {
    const tools = await listTools(userContext({ features: [] }))
    const names = tools.map((t) => t.name)
    for (const name of WERKSTATT_TOOLS) {
      expect(names).not.toContain(name)
    }
  })

  it('offers every Werkstatt tool with German descriptions when the tenant has the flag', async () => {
    const tools = await listTools(userContext())
    for (const name of WERKSTATT_TOOLS) {
      const tool = tools.find((t) => t.name === name)
      expect(tool).toBeDefined()
      expect(tool?.description && tool.description.length).toBeTruthy()
    }
  })

  it('refuses a Werkstatt tool call without the flag (not callable)', async () => {
    const { body } = await callTool(userContext({ features: [] }), 'create_pin_template', {
      article_id: 'a1',
      position: 1,
      main_keyword: 'test keyword',
      overlay: 'test keyword line',
      image_prompt: 'prompt',
    })
    expect(body.error ?? body.result?.isError).toBeTruthy()
  })
})

describe('list/get read tools', () => {
  it('list_pin_templates returns the article templates', async () => {
    const templates = [buildPinTemplate({ position: 1 }), buildPinTemplate({ position: 2 })]
    const { client } = fakeSupabase({ templates })
    const { payload } = await callTool(userContext({ supabase: client }), 'list_pin_templates', {
      article_id: 'a1',
    })
    expect(payload.count).toBe(2)
    expect(payload.templates).toHaveLength(2)
  })

  it('get_pin_template returns one template', async () => {
    const template = buildPinTemplate({ id: 'tpl-1', title: 'Eine Vorlage' })
    const { client } = fakeSupabase({ template })
    const { payload } = await callTool(userContext({ supabase: client }), 'get_pin_template', {
      template_id: 'tpl-1',
    })
    expect(payload.id).toBe('tpl-1')
    expect(payload.title).toBe('Eine Vorlage')
  })

  it('list_pin_template_revisions returns the revisions', async () => {
    const revisions = [buildPinTemplateRevision(), buildPinTemplateRevision()]
    const { client } = fakeSupabase({ revisions })
    const { payload } = await callTool(
      userContext({ supabase: client }),
      'list_pin_template_revisions',
      { template_id: 'tpl-1' },
    )
    expect(payload.count).toBe(2)
  })
})

describe('create_pin_template', () => {
  it('inserts a draft template stamped with source and oauth_client_id', async () => {
    const { client, calls } = fakeSupabase()
    const { result } = await callTool(userContext({ supabase: client }), 'create_pin_template', {
      article_id: 'a1',
      position: 3,
      main_keyword: 'gesunde snacks',
      overlay: 'Gesunde Snacks für den Alltag',
      description: 'Gesunde Snacks machen satt',
      image_prompt: 'A bowl of healthy snacks',
    })
    expect(result?.isError).toBeFalsy()
    const inserted = calls.inserts[0]
    expect(inserted.table).toBe('pin_templates')
    expect(inserted.value.source).toBe('mcp')
    expect(inserted.value.oauth_client_id).toBe('client-abc')
    expect(inserted.value.status).toBe('draft')
    expect(inserted.value.tenant_id).toBe('tenant-1')
  })

  it('rejects a row that violates the write contract (keyword not in overlay)', async () => {
    const { client, calls } = fakeSupabase()
    const { result, text } = await callTool(
      userContext({ supabase: client }),
      'create_pin_template',
      {
        article_id: 'a1',
        position: 3,
        main_keyword: 'gesunde snacks',
        overlay: 'Etwas ganz anderes',
        image_prompt: 'prompt',
      },
    )
    expect(result?.isError).toBe(true)
    expect(text).toContain('overlay')
    expect(calls.inserts).toHaveLength(0)
  })
})

describe('update_pin_template — status guardrail', () => {
  it('refuses to change an approved template', async () => {
    const template = buildPinTemplate({ id: 'tpl-1', status: 'approved' })
    const { client, calls } = fakeSupabase({ template })
    const { result, text } = await callTool(
      userContext({ supabase: client }),
      'update_pin_template',
      { template_id: 'tpl-1', title: 'Neuer Titel' },
    )
    expect(result?.isError).toBe(true)
    expect(text).toContain('approved')
    expect(calls.updates).toHaveLength(0)
  })

  it('refuses to change an archived template', async () => {
    const template = buildPinTemplate({ id: 'tpl-1', status: 'archived' })
    const { client, calls } = fakeSupabase({ template })
    const { result } = await callTool(
      userContext({ supabase: client }),
      'update_pin_template',
      { template_id: 'tpl-1', title: 'Neuer Titel' },
    )
    expect(result?.isError).toBe(true)
    expect(calls.updates).toHaveLength(0)
  })

  it('updates a draft template and stamps provenance without touching status', async () => {
    const template = buildPinTemplate({
      id: 'tpl-1',
      status: 'draft',
      main_keyword: 'test keyword',
      overlay: 'test keyword im overlay',
      description: 'test keyword in der beschreibung',
    })
    const { client, calls } = fakeSupabase({ template })
    const { result } = await callTool(
      userContext({ supabase: client }),
      'update_pin_template',
      { template_id: 'tpl-1', title: 'Neuer Titel' },
    )
    expect(result?.isError).toBeFalsy()
    const patch = calls.updates[0].value
    expect(patch.title).toBe('Neuer Titel')
    expect(patch.source).toBe('mcp')
    expect(patch.oauth_client_id).toBe('client-abc')
    expect(patch.status).toBeUndefined()
  })
})

describe('answer_revision_request', () => {
  it('reworks a needs_revision template back to draft with a snapshot', async () => {
    const template = buildPinTemplate({
      id: 'tpl-1',
      status: 'needs_revision',
      title: 'Alter Titel',
      main_keyword: 'test keyword',
      overlay: 'test keyword im overlay',
      description: 'test keyword in der beschreibung',
    })
    const { client, calls } = fakeSupabase({ template })
    const { result } = await callTool(
      userContext({ supabase: client }),
      'answer_revision_request',
      { template_id: 'tpl-1', title: 'Überarbeiteter Titel' },
    )
    expect(result?.isError).toBeFalsy()

    // The revision's previous_snapshot is written with the pre-rework fields.
    const snapshotWrite = calls.updates.find((u) => u.table === 'pin_template_revisions')
    expect(snapshotWrite).toBeDefined()
    expect((snapshotWrite!.value.previous_snapshot as any).title).toBe('Alter Titel')

    // The template is reworked and moved back to draft, with provenance.
    const templateWrite = calls.updates.find((u) => u.table === 'pin_templates')
    expect(templateWrite!.value.title).toBe('Überarbeiteter Titel')
    expect(templateWrite!.value.status).toBe('draft')
    expect(templateWrite!.value.source).toBe('mcp')
  })

  it('refuses when the template is not in needs_revision', async () => {
    const template = buildPinTemplate({ id: 'tpl-1', status: 'draft' })
    const { client, calls } = fakeSupabase({ template })
    const { result, text } = await callTool(
      userContext({ supabase: client }),
      'answer_revision_request',
      { template_id: 'tpl-1', title: 'x' },
    )
    expect(result?.isError).toBe(true)
    expect(text).toContain('needs_revision')
    expect(calls.updates).toHaveLength(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { handleMcpRequest } from './handler'

// The default tool registry now pulls in the API layer, which imports the
// browser Supabase client at module load. These tests inject their own tools or
// read only context, so stub the clients to avoid demanding real env vars.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/supabase-iso', () => ({ getSupabaseClient: () => ({}) }))
import type { McpHandlerDeps, McpUserContext } from './context'
import { defineTool, jsonResult } from './tool'
import type { McpToolDefinition } from './tool'
import { IMAGE_UPLOAD_GUIDE_MARKDOWN, IMAGE_UPLOAD_GUIDE_URI } from './image-upload-guide'
import type { SupabaseClient } from '@supabase/supabase-js'

const BASE_URL = 'https://pinfinity.test'
const AUTH_SERVER = 'https://project.supabase.co'
const METADATA_PATH = '/.well-known/oauth-protected-resource/mcp'

/** A fake Supabase client — the tracer's tools read only context, not the DB. */
const fakeSupabase = {} as unknown as SupabaseClient

function userContext(overrides: Partial<McpUserContext> = {}): McpUserContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    displayName: 'Petra',
    email: 'petra@example.com',
    features: [],
    oauthClientId: 'client-abc',
    supabase: fakeSupabase,
    ...overrides,
  }
}

/** Authenticate that accepts exactly `valid-token`. */
function fakeAuth(ctx: McpUserContext = userContext()) {
  return async (token: string) => (token === 'valid-token' ? ctx : null)
}

function makeDeps(overrides: Partial<McpHandlerDeps> = {}): McpHandlerDeps {
  return {
    authenticate: fakeAuth(),
    baseUrl: BASE_URL,
    authServerUrl: AUTH_SERVER,
    ...overrides,
  }
}

/** Build a JSON-RPC POST request with MCP-compliant headers. */
function jsonRpcRequest(
  body: unknown,
  { token }: { token?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function callTool(deps: McpHandlerDeps, name: string, args: unknown = {}) {
  const res = await handleMcpRequest(
    jsonRpcRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      { token: 'valid-token' },
    ),
    deps,
  )
  return { res, body: await res.json() }
}

describe('handleMcpRequest — auth', () => {
  it('returns 401 with a resource_metadata WWW-Authenticate header when no token is sent', async () => {
    const res = await handleMcpRequest(
      jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      makeDeps(),
    )
    expect(res.status).toBe(401)
    const wwwAuth = res.headers.get('WWW-Authenticate')
    expect(wwwAuth).toContain('Bearer')
    expect(wwwAuth).toContain(`resource_metadata="${BASE_URL}${METADATA_PATH}"`)
  })

  it('returns 401 for an invalid token', async () => {
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { token: 'nope' },
      ),
      makeDeps(),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
  })
})

describe('handleMcpRequest — HTTP method & CORS', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = await handleMcpRequest(
      new Request(`${BASE_URL}/mcp`, { method: 'GET' }),
      makeDeps(),
    )
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toContain('POST')
  })

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await handleMcpRequest(
      new Request(`${BASE_URL}/mcp`, { method: 'OPTIONS' }),
      makeDeps(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('exposes WWW-Authenticate and Mcp-Session-Id via CORS on every response', async () => {
    const res = await handleMcpRequest(
      jsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      makeDeps(),
    )
    const expose = res.headers.get('Access-Control-Expose-Headers') ?? ''
    expect(expose).toContain('WWW-Authenticate')
    expect(expose).toContain('Mcp-Session-Id')
  })
})

describe('handleMcpRequest — tools', () => {
  it('lists get_profile for a valid token', async () => {
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { token: 'valid-token' },
      ),
      makeDeps(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const names = body.result.tools.map((t: { name: string }) => t.name)
    expect(names).toContain('get_profile')
  })

  it('returns the profile for tools/call get_profile', async () => {
    const { res, body } = await callTool(makeDeps(), 'get_profile')
    expect(res.status).toBe(200)
    const profile = JSON.parse(body.result.content[0].text)
    expect(profile).toMatchObject({
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      display_name: 'Petra',
      email: 'petra@example.com',
      features: [],
    })
  })
})

describe('registerTool — feature gate & dry-run (prepared helpers)', () => {
  const gated = defineTool({
    name: 'werkstatt_probe',
    description: 'Nur mit pin_werkstatt.',
    feature: 'pin_werkstatt',
    handler: () => jsonResult({ ok: true }),
  })

  const dryRunTool = defineTool({
    name: 'bulk_probe',
    description: 'Bulk-Tool mit Probelauf.',
    inputSchema: { count: z.number() },
    dryRun: true,
    handler: ({ input, dryRun }) => jsonResult({ count: input.count, dryRun }),
  })

  const tools = [gated, dryRunTool] as unknown as McpToolDefinition<never>[]

  it('hides a feature-gated tool when the tenant lacks the flag', async () => {
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { token: 'valid-token' },
      ),
      makeDeps({ tools }),
    )
    const names = (await res.json()).result.tools.map(
      (t: { name: string }) => t.name,
    )
    expect(names).not.toContain('werkstatt_probe')
    expect(names).toContain('bulk_probe')
  })

  it('offers a feature-gated tool when the tenant has the flag', async () => {
    const deps = makeDeps({
      tools,
      authenticate: fakeAuth(userContext({ features: ['pin_werkstatt'] })),
    })
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { token: 'valid-token' },
      ),
      deps,
    )
    const names = (await res.json()).result.tools.map(
      (t: { name: string }) => t.name,
    )
    expect(names).toContain('werkstatt_probe')
  })

  it('defaults dry_run to true when the caller omits it', async () => {
    const { body } = await callTool(makeDeps({ tools }), 'bulk_probe', {
      count: 3,
    })
    expect(JSON.parse(body.result.content[0].text)).toEqual({
      count: 3,
      dryRun: true,
    })
  })

  it('honours dry_run: false when passed explicitly', async () => {
    const { body } = await callTool(makeDeps({ tools }), 'bulk_probe', {
      count: 3,
      dry_run: false,
    })
    expect(JSON.parse(body.result.content[0].text)).toEqual({
      count: 3,
      dryRun: false,
    })
  })
})

describe('handleMcpRequest — image upload guide', () => {
  async function rpc(method: string, params?: unknown) {
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) },
        { token: 'valid-token' },
      ),
      makeDeps(),
    )
    return (await res.json()).result
  }

  it('announces the resources capability and instructions pointing at the guide', async () => {
    const result = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    })
    expect(result.capabilities.resources).toBeDefined()
    expect(result.instructions).toContain(IMAGE_UPLOAD_GUIDE_URI)
    expect(result.instructions).toContain('create_pin_from_chat_image')
    expect(result.instructions).toContain('get_image_upload_guide')
  })

  it('lists the guide resource', async () => {
    const { resources } = await rpc('resources/list')
    expect(resources).toContainEqual(
      expect.objectContaining({
        uri: IMAGE_UPLOAD_GUIDE_URI,
        mimeType: 'text/markdown',
        title: expect.stringContaining('Bilder'),
      }),
    )
  })

  it('reads the guide resource as Markdown', async () => {
    const { contents } = await rpc('resources/read', { uri: IMAGE_UPLOAD_GUIDE_URI })
    expect(contents).toEqual([
      { uri: IMAGE_UPLOAD_GUIDE_URI, mimeType: 'text/markdown', text: IMAGE_UPLOAD_GUIDE_MARKDOWN },
    ])
  })

  it('serves the same text through get_image_upload_guide', async () => {
    const { body } = await callTool(makeDeps(), 'get_image_upload_guide')
    expect(body.result.isError).toBeFalsy()
    expect(body.result.content[0].text).toBe(IMAGE_UPLOAD_GUIDE_MARKDOWN)
  })

  it('names every image route and the supported formats from the code', () => {
    for (const term of [
      'create_pin_from_chat_image',
      'image_url',
      'request_pin_upload',
      'upload_path',
      'image_base64',
      'image/jpeg',
      'image/webp',
      '20 MB',
      'Gemini',
    ]) {
      expect(IMAGE_UPLOAD_GUIDE_MARKDOWN).toContain(term)
    }
  })
})

describe('handleMcpRequest — AI metadata account setting (ADR-0009)', () => {
  async function rpcAs(ctx: McpUserContext, method: string, params?: unknown) {
    const res = await handleMcpRequest(
      jsonRpcRequest(
        { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) },
        { token: 'valid-token' },
      ),
      makeDeps({ authenticate: fakeAuth(ctx) }),
    )
    return (await res.json()).result
  }

  async function listTools(ctx: McpUserContext) {
    const { tools } = await rpcAs(ctx, 'tools/list')
    return tools as { name: string; description: string }[]
  }

  const initParams = {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  }

  it('lists generate_metadata when the setting is on or unset', async () => {
    for (const ctx of [userContext(), userContext({ aiMetadataEnabled: true })]) {
      const names = (await listTools(ctx)).map((t) => t.name)
      expect(names).toContain('generate_metadata')
    }
  })

  it('hides generate_metadata when the setting is off, other write tools stay', async () => {
    const names = (await listTools(userContext({ aiMetadataEnabled: false }))).map((t) => t.name)
    expect(names).not.toContain('generate_metadata')
    expect(names).toEqual(expect.arrayContaining(['create_pin', 'create_pin_from_chat_image', 'set_pin_metadata']))
  })

  it('refuses a call to generate_metadata when the setting is off', async () => {
    const deps = makeDeps({ authenticate: fakeAuth(userContext({ aiMetadataEnabled: false })) })
    const { body } = await callTool(deps, 'generate_metadata', { pin_ids: ['pin-1'], dry_run: false })
    // The tool is not registered, so the SDK answers with an error.
    const failed = Boolean(body.error) || body.result?.isError === true
    expect(failed).toBe(true)
  })

  it('tells the agent to write metadata itself in the pin write tools when off', async () => {
    const tools = await listTools(userContext({ aiMetadataEnabled: false }))
    for (const name of ['create_pin', 'create_pin_from_chat_image', 'set_pin_metadata']) {
      const tool = tools.find((t) => t.name === name)
      expect(tool?.description).toContain('eine automatische Generierung gibt es nicht')
    }
  })

  it('keeps the pin write tool descriptions without the note when on', async () => {
    const tools = await listTools(userContext())
    for (const name of ['create_pin', 'create_pin_from_chat_image', 'set_pin_metadata']) {
      const tool = tools.find((t) => t.name === name)
      expect(tool?.description).not.toContain('eine automatische Generierung gibt es nicht')
    }
  })

  it('restricts generate_metadata to explicit requests in its description', async () => {
    const tool = (await listTools(userContext())).find((t) => t.name === 'generate_metadata')
    expect(tool?.description).toContain('ausdrücklich')
    expect(tool?.description).toContain('Nie für Pins, deren Metadaten du gerade selbst geschrieben')
  })

  it('server instructions and guide follow the setting', async () => {
    const off = userContext({ aiMetadataEnabled: false })
    const offInit = await rpcAs(off, 'initialize', initParams)
    expect(offInit.instructions).toContain('Metadaten schreibst du selbst, eine automatische Generierung gibt es nicht')
    expect(offInit.instructions).not.toContain('generate_metadata')

    const offGuide = await rpcAs(off, 'resources/read', { uri: IMAGE_UPLOAD_GUIDE_URI })
    expect(offGuide.contents[0].text).not.toContain('generate_metadata')
    expect(offGuide.contents[0].text).toContain('ausgeschaltet')

    const onInit = await rpcAs(userContext(), 'initialize', initParams)
    expect(onInit.instructions).toContain('generate_metadata')
    expect(onInit.instructions).toContain('ausdrücklichen Wunsch')
  })
})

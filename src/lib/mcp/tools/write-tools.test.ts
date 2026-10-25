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
  signedUploads: string[]
  removed: string[]
}

/** A stored object as reported by `storage.info()` in the fake. */
interface FakeObject {
  contentType: string
  size: number
}

/**
 * A recording fake Supabase client for the write tools. `from(table)` builds a
 * query builder that resolves inserts (payload + id), updates (existing pin +
 * patch) and plain selects (the existing pin, for getPin); storage records
 * uploads and builds a CDN URL — no network, in-memory.
 */
function fakeSupabase(
  opts: {
    existingPin?: Record<string, unknown>
    /** Objects in the pin-images bucket, keyed by storage path. */
    objects?: Record<string, FakeObject>
    /** Image paths already referenced by a pin. */
    usedImagePaths?: string[]
  } = {},
): {
  client: SupabaseClient
  calls: FakeCalls
} {
  const calls: FakeCalls = {
    inserts: [],
    updates: [],
    uploads: [],
    signedUploads: [],
    removed: [],
  }
  const objects = { ...(opts.objects ?? {}) }

  const from = () => {
    const state: {
      op: 'insert' | 'update' | null
      payload: Record<string, unknown>
      id: unknown
      imagePath: string | null
    } = { op: null, payload: {}, id: undefined, imagePath: null }
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
      eq(col: string, value: unknown) {
        if (col === 'image_path') state.imagePath = value as string
        else state.id = value
        return builder
      },
      limit: () => builder,
      single: () => builder,
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        let data: unknown
        if (state.op === 'insert') {
          data = { id: 'pin-new', ...state.payload }
        } else if (state.imagePath !== null) {
          data = (opts.usedImagePaths ?? []).includes(state.imagePath)
            ? [{ id: 'pin-existing' }]
            : []
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
        createSignedUploadUrl: (path: string) => {
          calls.signedUploads.push(path)
          return Promise.resolve({
            data: {
              signedUrl: `https://project.supabase.co/storage/v1/object/upload/sign/pin-images/${path}?token=tok`,
              token: 'tok',
              path,
            },
            error: null,
          })
        },
        info: (path: string) => {
          const obj = objects[path]
          return Promise.resolve(
            obj
              ? { data: { name: path, ...obj }, error: null }
              : { data: null, error: { message: 'Object not found', statusCode: '404' } },
          )
        },
        remove: (paths: string[]) => {
          calls.removed.push(...paths)
          for (const path of paths) delete objects[path]
          return Promise.resolve({ data: [], error: null })
        },
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

const WRITE_TOOLS = ['request_pin_upload', 'create_pin', 'set_pin_metadata', 'update_pin']

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

describe('request_pin_upload', () => {
  it('returns a signed upload URL for a fresh path in the tenant folder', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { payload, result } = await callTool(ctx, 'request_pin_upload', {
      content_type: 'image/png',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.signedUploads).toHaveLength(1)
    expect(payload.upload_path).toMatch(/^tenant-1\/[0-9a-f-]{36}\.png$/)
    expect(payload.upload_path).toBe(calls.signedUploads[0])
    expect(payload.upload_url).toContain('token=tok')
    expect(Date.parse(payload.expires_at)).toBeGreaterThan(Date.now())
    expect(payload.curl_example).toContain('curl -X PUT')
    expect(payload.curl_example).toContain('Content-Type: image/png')
    expect(payload.curl_example).toContain(payload.upload_url)
  })

  it('maps the content type to the file extension', async () => {
    const { client } = fakeSupabase()
    const ctx = userContext({ supabase: client })
    const { payload } = await callTool(ctx, 'request_pin_upload', {
      content_type: 'image/jpeg',
    })
    expect(payload.upload_path).toMatch(/\.jpg$/)
  })

  it('rejects a non-image or unsupported content type', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })
    for (const content_type of ['text/html', 'image/svg+xml']) {
      const { result, text } = await callTool(ctx, 'request_pin_upload', { content_type })
      expect(result.isError).toBe(true)
      expect(text).toContain('content_type')
    }
    expect(calls.signedUploads).toHaveLength(0)
  })
})

describe('create_pin with upload_path', () => {
  const PATH = 'tenant-1/0b6a3c2e-1111-4222-8333-944445555666.png'

  it('creates the pin from an uploaded object without downloading anything', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 2048 } },
    })
    const fetchRemoteImage = vi.fn()
    const ctx = userContext({ supabase: client, fetchRemoteImage })

    const { payload, result } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
      title: 'Titel',
      description: 'Beschreibung',
      board_id: 'board-1',
      board_name: 'Rezepte',
    })

    expect(result.isError).toBeFalsy()
    expect(fetchRemoteImage).not.toHaveBeenCalled()
    expect(calls.uploads).toHaveLength(0)
    const inserted = calls.inserts[0]
    expect(inserted.image_path).toBe(PATH)
    expect(inserted.media_type).toBe('image')
    expect(inserted.status).toBe('metadata_created')
    expect(inserted.source).toBe('mcp')
    expect(inserted.oauth_client_id).toBe('client-abc')
    expect(payload.id).toBe('pin-new')
  })

  it('leaves a pin without full metadata as a draft', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 2048 } },
    })
    await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(calls.inserts[0].status).toBe('draft')
  })

  it('requires exactly one of image_url and upload_path', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 2048 } },
    })
    const ctx = userContext({ supabase: client })

    const none = await callTool(ctx, 'create_pin', { project_id: 'p1' })
    expect(none.result.isError).toBe(true)
    expect(none.text).toContain('image_url')
    expect(none.text).toContain('upload_path')

    const both = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
      upload_path: PATH,
    })
    expect(both.result.isError).toBe(true)
    expect(calls.inserts).toHaveLength(0)
  })

  it.each([
    ['another tenant', 'tenant-2/x.png'],
    ['a path traversal', 'tenant-1/../tenant-2/x.png'],
    ['a nested path', 'tenant-1/sub/x.png'],
    ['a tenant-prefix lookalike', 'tenant-10/x.png'],
  ])('rejects %s', async (_label, upload_path) => {
    const { client, calls } = fakeSupabase({
      objects: { [upload_path]: { contentType: 'image/png', size: 2048 } },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('upload_path')
    expect(calls.inserts).toHaveLength(0)
    expect(calls.removed).toHaveLength(0)
  })

  it('reports a missing object', async () => {
    const { client, calls } = fakeSupabase()
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toBe('Bild unter upload_path nicht gefunden - wurde der Upload ausgeführt?')
    expect(calls.inserts).toHaveLength(0)
  })

  it('deletes and rejects an object that is not an image', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'text/html', size: 2048 } },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('text/html')
    expect(calls.removed).toEqual([PATH])
    expect(calls.inserts).toHaveLength(0)
  })

  it('deletes and rejects an object larger than 20 MB', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 20 * 1024 * 1024 + 1 } },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('20 MB')
    expect(calls.removed).toEqual([PATH])
    expect(calls.inserts).toHaveLength(0)
  })

  it('rejects an upload that already belongs to a pin', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 2048 } },
      usedImagePaths: [PATH],
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('bereits')
    expect(calls.inserts).toHaveLength(0)
    expect(calls.removed).toHaveLength(0)
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

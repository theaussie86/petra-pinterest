import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleMcpRequest } from '../handler'
import type { McpHandlerDeps, McpUserContext } from '../context'
import { baseMimeType } from '@/lib/api/pins'

/** Magic-byte signatures the content check recognises, keyed by MIME type. */
const MAGIC_BYTES: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/jpg': [0xff, 0xd8, 0xff],
  'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], // RIFF....WEBP
  'image/avif': [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], // ....ftypavif
}

/** Leading bytes that match `contentType`, padded to at least `byteLength`. */
function magicBytesFor(contentType: string, byteLength = 0): Uint8Array {
  const sig = MAGIC_BYTES[baseMimeType(contentType)] ?? []
  const out = new Uint8Array(Math.max(byteLength, sig.length))
  out.set(sig, 0)
  return out
}

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

/** A stored object as reported by `storage.info()`/`download()` in the fake. */
interface FakeObject {
  contentType: string
  size: number
  /** Raw bytes `download()` returns; defaults to magic bytes for `contentType`. */
  bytes?: Uint8Array
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
    /** Error the insert resolves with (e.g. a 23505 unique violation). */
    insertError?: { code?: string; message?: string }
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
          if (opts.insertError) {
            return Promise.resolve({ data: null, error: opts.insertError }).then(resolve)
          }
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
        download: (path: string) => {
          const obj = objects[path]
          if (!obj) {
            return Promise.resolve({
              data: null,
              error: { message: 'Object not found', statusCode: '404' },
            })
          }
          const bytes = obj.bytes ?? magicBytesFor(obj.contentType)
          // supabase-js resolves download() to a Blob; jsdom's Blob lacks
          // arrayBuffer(), so hand back a minimal blob-like with the one method
          // downloadPinImageBytes uses.
          const blob = {
            arrayBuffer: async () =>
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          }
          return Promise.resolve({ data: blob, error: null })
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
  const bytes = magicBytesFor(contentType, byteLength).buffer as ArrayBuffer
  return async () => ({ contentType, bytes })
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
  it('lists the pin write tools with German descriptions', async () => {
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

  it('rejects image_url whose content does not match the declared type', async () => {
    const { client, calls } = fakeSupabase()
    const htmlAsPng = async () => ({
      contentType: 'image/png',
      bytes: new TextEncoder().encode('<!doctype html><html></html>').buffer as ArrayBuffer,
    })
    const ctx = userContext({ supabase: client, fetchRemoteImage: htmlAsPng })

    const { result, text } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
    })

    expect(result.isError).toBe(true)
    expect(text).toContain('image_url')
    expect(calls.uploads).toHaveLength(0)
    expect(calls.inserts).toHaveLength(0)
  })

  it.each([
    ['image/jpeg'],
    ['image/png'],
    ['image/gif'],
    ['image/webp'],
    ['image/avif'],
  ])('accepts a %s whose magic bytes match', async (contentType) => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client, fetchRemoteImage: imageFetch(contentType) })

    const { result } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a',
    })

    expect(result.isError).toBeFalsy()
    expect(calls.uploads).toHaveLength(1)
    expect(calls.uploads[0].contentType).toBe(contentType)
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

  it("never deletes an existing pin's media (e.g. a video) passed as upload_path", async () => {
    const videoPath = 'tenant-1/clip.mp4'
    const { client, calls } = fakeSupabase({
      objects: { [videoPath]: { contentType: 'video/mp4', size: 2048 } },
      usedImagePaths: [videoPath],
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: videoPath,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('bereits')
    expect(calls.removed).toHaveLength(0)
  })

  it('deletes and rejects an unsupported image type such as SVG', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/svg+xml', size: 2048 } },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('image/svg+xml')
    expect(calls.removed).toEqual([PATH])
  })

  it('deletes and rejects an object without a known size', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: undefined as unknown as number } },
    })
    const { result } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(calls.removed).toEqual([PATH])
    expect(calls.inserts).toHaveLength(0)
  })

  it('deletes and rejects an object whose bytes do not match the declared type', async () => {
    const { client, calls } = fakeSupabase({
      objects: {
        [PATH]: {
          contentType: 'image/png',
          size: 2048,
          bytes: new TextEncoder().encode('<!doctype html><html></html>'),
        },
      },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('upload_path')
    expect(calls.removed).toEqual([PATH])
    expect(calls.inserts).toHaveLength(0)
  })

  it('returns the "bereits verwendet" message when the insert hits the unique index (race)', async () => {
    const { client, calls } = fakeSupabase({
      objects: { [PATH]: { contentType: 'image/png', size: 2048 } },
      insertError: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "pins_image_path_unique"',
      },
    })
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      upload_path: PATH,
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('bereits')
    expect(calls.inserts).toHaveLength(1)
  })
})

describe('create_pin with inline images', () => {
  /** Base64 of bytes whose magic bytes identify `contentType`. */
  function base64For(contentType: string, byteLength = 1024): string {
    return Buffer.from(magicBytesFor(contentType, byteLength)).toString('base64')
  }

  it('declares image_file as an openai/fileParams field in tools/list', async () => {
    const tools = (await listTools(userContext())) as Array<{
      name: string
      _meta?: Record<string, unknown>
      inputSchema?: { properties?: Record<string, unknown> }
    }>
    const tool = tools.find((t) => t.name === 'create_pin')
    expect(tool?._meta?.['openai/fileParams']).toEqual(['image_file'])
    expect(tool?.inputSchema?.properties).toHaveProperty('image_file')
    expect(tool?.inputSchema?.properties).toHaveProperty('image_base64')
  })

  it('stores a ChatGPT file from its download_url, typed by magic bytes', async () => {
    const { client, calls } = fakeSupabase()
    const fetched: string[] = []
    const ctx = userContext({
      supabase: client,
      fetchRemoteImage: async (url) => {
        fetched.push(url)
        return {
          contentType: 'application/octet-stream',
          bytes: magicBytesFor('image/png', 1024).buffer as ArrayBuffer,
        }
      },
    })

    const { result, payload } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_file: {
        download_url: 'https://files.oaiusercontent.com/file-abc?sig=x',
        file_id: 'file-abc',
        mime_type: 'image/png',
        file_name: 'pin.png',
      },
    })

    expect(result.isError).toBeFalsy()
    expect(fetched).toEqual(['https://files.oaiusercontent.com/file-abc?sig=x'])
    expect(calls.uploads[0].path).toMatch(/^tenant-1\/.*\.png$/)
    expect(calls.uploads[0].contentType).toBe('image/png')
    expect(calls.inserts[0].source).toBe('mcp')
    expect(payload.id).toBe('pin-new')
  })

  it('rejects an image_file whose content is no supported image', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({
      supabase: client,
      fetchRemoteImage: async () => ({
        contentType: 'image/png',
        bytes: new TextEncoder().encode('<html></html>').buffer as ArrayBuffer,
      }),
    })

    const { result, text } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_file: { download_url: 'https://files.example/x', file_id: 'f1' },
    })

    expect(result.isError).toBe(true)
    expect(text).toContain('image_file')
    expect(calls.uploads).toHaveLength(0)
    expect(calls.inserts).toHaveLength(0)
  })

  it('reports an expired/failed image_file download', async () => {
    const ctx = userContext({
      fetchRemoteImage: async () => {
        throw new Error('HTTP 403')
      },
    })
    const { result, text } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_file: { download_url: 'https://files.example/x', file_id: 'f1' },
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('image_file')
  })

  it.each([['image/jpeg'], ['image/png'], ['image/webp']])(
    'stores image_base64 (%s) typed by magic bytes',
    async (contentType) => {
      const { client, calls } = fakeSupabase()
      const ctx = userContext({ supabase: client })

      const { result } = await callTool(ctx, 'create_pin', {
        project_id: 'p1',
        image_base64: base64For(contentType),
      })

      expect(result.isError).toBeFalsy()
      expect(calls.uploads).toHaveLength(1)
      expect(calls.uploads[0].contentType).toBe(contentType)
    },
  )

  it('accepts image_base64 as a data: URL', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const { result } = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_base64: `data:image/png;base64,${base64For('image/png')}`,
    })

    expect(result.isError).toBeFalsy()
    expect(calls.uploads[0].contentType).toBe('image/png')
  })

  it('rejects invalid base64 and non-image base64', async () => {
    const { client, calls } = fakeSupabase()
    const ctx = userContext({ supabase: client })

    const garbage = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_base64: 'not base64!!',
    })
    expect(garbage.result.isError).toBe(true)
    expect(garbage.text).toContain('Base64')

    const html = await callTool(ctx, 'create_pin', {
      project_id: 'p1',
      image_base64: Buffer.from('<html></html>').toString('base64'),
    })
    expect(html.result.isError).toBe(true)
    expect(html.text).toContain('image_base64')
    expect(calls.uploads).toHaveLength(0)
  })

  it('refuses a request body over the transport cap (4 MiB) with 413', async () => {
    const { client, calls } = fakeSupabase()
    const { res } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      image_base64: base64For('image/png', 4 * 1024 * 1024),
    })
    expect(res.status).toBe(413)
    expect(calls.uploads).toHaveLength(0)
  })

  it('rejects combining image_base64 with another image source', async () => {
    const { client, calls } = fakeSupabase()
    const { result, text } = await callTool(userContext({ supabase: client }), 'create_pin', {
      project_id: 'p1',
      image_url: 'https://example.com/a.png',
      image_base64: base64For('image/png'),
    })
    expect(result.isError).toBe(true)
    expect(text).toContain('image_base64')
    expect(calls.inserts).toHaveLength(0)
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

import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Behaviour test for the synchronous generate-metadata-single Edge Function
// (ADR-0004, issue #88). It is the seam the "Metadaten erzeugen" and
// "Neu-Erzeugen mit Feedback" dialogs wait on.
//
// We shim `Deno` before the import runs, capture the handler, then drive it
// with a Request. Gemini, ffmpeg and the image fetch are faked; the real
// pin-metadata pipeline (history insert, pin update, pruning, feedback branch)
// runs against an in-memory Supabase fake.

const {
  capturedHandler,
  fake,
  mockGeneratePinMetadata,
  mockGenerateWithFeedback,
  mockFetchImageBytes,
  mockExtractKeyframe,
} = vi.hoisted(() => {
  const handler: { current: ((req: Request) => Promise<Response>) | null } = { current: null }
  const env: Record<string, string> = { SUPABASE_URL: 'https://test.supabase.co' }
  ;(globalThis as any).Deno = {
    serve: (h: (req: Request) => Promise<Response>) => {
      handler.current = h
    },
    env: { get: (key: string) => env[key] },
  }
  return {
    capturedHandler: handler,
    fake: { client: { from: vi.fn(), rpc: vi.fn() } },
    mockGeneratePinMetadata: vi.fn(),
    mockGenerateWithFeedback: vi.fn(),
    mockFetchImageBytes: vi.fn(),
    mockExtractKeyframe: vi.fn(),
  }
})

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => fake.client,
}))

vi.mock('../_shared/cors.ts', () => ({
  corsHeaders: {},
  handleCors: () => null,
}))

vi.mock('../_shared/ai.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generatePinMetadata: (...args: any[]) => mockGeneratePinMetadata(...args),
  generatePinMetadataWithFeedback: (...args: any[]) => mockGenerateWithFeedback(...args),
  fetchImageBytes: (...args: any[]) => mockFetchImageBytes(...args),
}))

vi.mock('../_shared/ffmpeg-client.ts', () => ({
  extractKeyframe: (...args: any[]) => mockExtractKeyframe(...args),
}))

import './index.ts'

const METADATA = {
  title: 'Generated Title',
  description: 'Generated description',
  alt_text: 'Generated alt text',
}
const REFINED = { title: 'Refined Title', description: 'Refined description', alt_text: 'Refined alt' }

/** In-memory stand-in for the tables the pipeline touches. */
function setupDb(opts: {
  pin?: Record<string, unknown> | null
  previous?: { title: string; description: string; alt_text: string } | null
  generations?: { id: string }[]
  apiKey?: string | null
} = {}) {
  const pin =
    opts.pin === undefined
      ? {
          id: 'pin-1',
          blog_project_id: 'proj-1',
          image_path: 'tenant/image.png',
          blog_articles: { title: 'Article Title', content: 'Article Content' },
        }
      : opts.pin
  const state = {
    pinUpdates: [] as { id: string; values: Record<string, unknown> }[],
    generationInserts: [] as Record<string, unknown>[],
    generationDeletes: [] as { notIn: string }[],
  }

  fake.client.from.mockImplementation((table: string) => {
    if (table === 'pins') {
      let pinId = ''
      let values: Record<string, unknown> | null = null
      const qb = createMockQueryBuilder()
      qb.update.mockImplementation((v: Record<string, unknown>) => {
        values = v
        return qb
      })
      qb.eq.mockImplementation((_col: string, id: string) => {
        pinId = id
        return qb
      })
      qb.then = (resolve: any, reject: any) => {
        if (values) {
          state.pinUpdates.push({ id: pinId, values })
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }
        return Promise.resolve(
          pin ? { data: pin, error: null } : { data: null, error: { message: 'not found' } },
        ).then(resolve, reject)
      }
      return qb
    }
    if (table === 'blog_projects') {
      return createMockQueryBuilder({ data: { language: 'German', ai_context: null } })
    }
    if (table === 'pin_metadata_generations') {
      let mode: 'select' | 'previous' | 'insert' | 'delete' = 'select'
      const qb = createMockQueryBuilder()
      qb.limit.mockImplementation(() => {
        mode = 'previous'
        return qb
      })
      qb.insert.mockImplementation((row: Record<string, unknown>) => {
        mode = 'insert'
        state.generationInserts.push(row)
        return qb
      })
      qb.delete.mockImplementation(() => {
        mode = 'delete'
        return qb
      })
      qb.not.mockImplementation((_c: string, _op: string, list: string) => {
        state.generationDeletes.push({ notIn: list })
        return qb
      })
      qb.then = (resolve: any, reject: any) => {
        let data: unknown = null
        if (mode === 'previous') data = opts.previous ?? null
        else if (mode === 'select') data = opts.generations ?? []
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }
      return qb
    }
    throw new Error(`unexpected table ${table}`)
  })

  fake.client.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'get_gemini_api_key') {
      return opts.apiKey === null
        ? { data: null, error: { message: 'No key configured' } }
        : { data: opts.apiKey ?? 'test-api-key', error: null }
    }
    throw new Error(`unexpected rpc ${fn}`)
  })

  return state
}

async function run(body: Record<string, unknown>) {
  const response = await capturedHandler.current!(
    new Request('https://edge/generate-metadata-single', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGeneratePinMetadata.mockResolvedValue(METADATA)
  mockGenerateWithFeedback.mockResolvedValue(REFINED)
  mockFetchImageBytes.mockResolvedValue({ bytes: new Uint8Array([10, 20, 30]), mimeType: 'image/png' })
  mockExtractKeyframe.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' })
})

describe('generate-metadata-single', () => {
  it('rejects a request missing pin_id or tenant_id', async () => {
    setupDb()
    const { status, body } = await run({ pin_id: 'pin-1' })
    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('generates metadata without feedback and stores a null-feedback history row', async () => {
    const db = setupDb()

    const { status, body } = await run({ pin_id: 'pin-1', tenant_id: 'tenant-1' })

    expect(status).toBe(200)
    expect(body).toEqual({ success: true, pin_id: 'pin-1', metadata: METADATA })
    expect(mockGeneratePinMetadata).toHaveBeenCalledTimes(1)
    expect(mockGenerateWithFeedback).not.toHaveBeenCalled()
    expect(db.generationInserts).toEqual([
      expect.objectContaining({ pin_id: 'pin-1', tenant_id: 'tenant-1', title: 'Generated Title', feedback: null }),
    ])
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-1',
      values: {
        title: 'Generated Title',
        description: 'Generated description',
        alt_text: 'Generated alt text',
        status: 'metadata_created',
      },
    })
  })

  it('uses the feedback variant and stores the feedback text in the history', async () => {
    const previous = { title: 'Old Title', description: 'Old desc', alt_text: 'Old alt' }
    const db = setupDb({ previous })

    const { status, body } = await run({
      pin_id: 'pin-1',
      tenant_id: 'tenant-1',
      feedback: 'Make it more catchy',
    })

    expect(status).toBe(200)
    expect(body.metadata).toEqual(REFINED)
    expect(mockGeneratePinMetadata).not.toHaveBeenCalled()
    expect(mockGenerateWithFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ previousMetadata: previous, feedback: 'Make it more catchy' }),
    )
    expect(db.generationInserts).toEqual([
      expect.objectContaining({ pin_id: 'pin-1', feedback: 'Make it more catchy', title: 'Refined Title' }),
    ])
  })

  it('fails the feedback path when there is no previous generation', async () => {
    setupDb({ previous: null })

    const { status, body } = await run({ pin_id: 'pin-1', tenant_id: 'tenant-1', feedback: 'refine' })

    expect(status).toBe(500)
    expect(body).toEqual({ success: false, error: expect.stringContaining('No previous generation') })
  })

  it('extracts a keyframe for a video pin instead of fetching image bytes', async () => {
    setupDb({
      pin: {
        id: 'pin-1',
        blog_project_id: 'proj-1',
        image_path: 'tenant/clip.mp4',
        cover_keyframe_seconds: 2,
        blog_articles: null,
      },
    })

    const { status } = await run({ pin_id: 'pin-1', tenant_id: 'tenant-1' })

    expect(status).toBe(200)
    expect(mockExtractKeyframe).toHaveBeenCalledWith(expect.stringContaining('clip.mp4'), { second: 2 })
    expect(mockFetchImageBytes).not.toHaveBeenCalled()
    expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'video' }),
    )
  })

  it('prunes the history to the last 3 generations', async () => {
    const db = setupDb({ generations: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }] })

    await run({ pin_id: 'pin-1', tenant_id: 'tenant-1' })

    expect(db.generationDeletes).toEqual([{ notIn: '(g1,g2,g3)' }])
  })

  it('returns 500 and sets the pin to error when generation fails', async () => {
    const db = setupDb()
    mockGeneratePinMetadata.mockRejectedValue(new Error('Gemini returned empty response'))

    const { status, body } = await run({ pin_id: 'pin-1', tenant_id: 'tenant-1' })

    expect(status).toBe(500)
    expect(body).toEqual({ success: false, error: expect.stringContaining('empty response') })
    expect(db.pinUpdates).toContainEqual(
      expect.objectContaining({
        id: 'pin-1',
        values: expect.objectContaining({ status: 'error' }),
      }),
    )
  })
})

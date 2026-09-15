import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Behaviour test for the generate_metadata queue worker (ADR-0004, issue #87).
//
// The worker is a Deno Edge function kicked by pg_cron. We shim `Deno` before
// the import runs, capture the handler, then drive it with a Request. The queue
// (pgmq wrappers exposed as RPCs), the Supabase tables, Gemini, ffmpeg and the
// mailer are faked; the real worker loop and metadata pipeline run.

const { capturedHandler, fake, mockGeneratePinMetadata, mockFetchImageBytes, mockExtractKeyframe, mockNotifyPinError } =
  vi.hoisted(() => {
    const handler: { current: ((req: Request) => Promise<Response>) | null } = {
      current: null,
    }
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
      mockFetchImageBytes: vi.fn(),
      mockExtractKeyframe: vi.fn(),
      mockNotifyPinError: vi.fn(),
    }
  })

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => fake.client,
}))

vi.mock('../_shared/ai.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generatePinMetadata: (...args: any[]) => mockGeneratePinMetadata(...args),
  fetchImageBytes: (...args: any[]) => mockFetchImageBytes(...args),
}))

vi.mock('../_shared/ffmpeg-client.ts', () => ({
  extractKeyframe: (...args: any[]) => mockExtractKeyframe(...args),
}))

vi.mock('../_shared/notifications.ts', () => ({
  notifyPinError: (...args: any[]) => mockNotifyPinError(...args),
}))

import './index.ts'

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: { pin_id: string; tenant_id: string }
}

const METADATA = {
  title: 'Generated Title',
  description: 'Generated description',
  alt_text: 'Generated alt text',
}

/**
 * In-memory stand-in for the database the worker talks to. Tables hand out
 * query builders that record writes; RPCs model the queue and the worker lock.
 */
function setupDb(opts: {
  messages: QueueMessage[]
  pins?: Record<string, Record<string, unknown>>
  generations?: { id: string }[]
  lockHeld?: boolean
  apiKey?: string | null
}) {
  const pins = opts.pins ?? {
    'pin-1': {
      id: 'pin-1',
      blog_project_id: 'proj-1',
      image_path: 'tenant/image.png',
      blog_articles: { title: 'Article Title', content: 'Article Content' },
    },
  }
  const state = {
    pinUpdates: [] as { id: string; values: Record<string, unknown> }[],
    generationInserts: [] as Record<string, unknown>[],
    generationDeletes: [] as { notIn: string }[],
    deleted: [] as number[],
    archived: [] as number[],
    read: [] as { qty: number; vt: number }[],
    lockReleased: false,
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
        const pin = pins[pinId]
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
      let mode: 'select' | 'insert' | 'delete' = 'select'
      const qb = createMockQueryBuilder()
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
      qb.then = (resolve: any, reject: any) =>
        Promise.resolve({
          data: mode === 'select' ? (opts.generations ?? []) : null,
          error: null,
        }).then(resolve, reject)
      return qb
    }
    throw new Error(`unexpected table ${table}`)
  })

  fake.client.rpc.mockImplementation(async (fn: string, args: Record<string, any>) => {
    switch (fn) {
      case 'try_acquire_queue_worker_lock':
        return { data: !opts.lockHeld, error: null }
      case 'release_queue_worker_lock':
        state.lockReleased = true
        return { data: null, error: null }
      case 'queue_read':
        state.read.push({ qty: args.p_qty, vt: args.p_vt })
        return { data: opts.messages, error: null }
      case 'queue_delete':
        state.deleted.push(args.p_msg_id)
        return { data: true, error: null }
      case 'queue_archive':
        state.archived.push(args.p_msg_id)
        return { data: true, error: null }
      case 'get_gemini_api_key':
        return opts.apiKey === null
          ? { data: null, error: { message: 'No key configured' } }
          : { data: opts.apiKey ?? 'test-api-key', error: null }
      default:
        throw new Error(`unexpected rpc ${fn}`)
    }
  })

  return state
}

function message(msg_id: number, read_ct: number, pin_id = 'pin-1'): QueueMessage {
  return { msg_id, read_ct, message: { pin_id, tenant_id: 'tenant-1' } }
}

async function runWorker() {
  const response = await capturedHandler.current!(
    new Request('https://edge/generate-metadata-worker', { method: 'POST' }),
  )
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGeneratePinMetadata.mockResolvedValue(METADATA)
  mockFetchImageBytes.mockResolvedValue({ bytes: new Uint8Array([10, 20, 30]), mimeType: 'image/png' })
  mockExtractKeyframe.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' })
})

describe('generate-metadata-worker', () => {
  it('generates metadata for a queued pin and removes the message', async () => {
    const db = setupDb({ messages: [message(11, 1)] })

    const { status } = await runWorker()

    expect(status).toBe(200)
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-1',
      values: {
        title: 'Generated Title',
        description: 'Generated description',
        alt_text: 'Generated alt text',
        status: 'metadata_created',
      },
    })
    expect(db.generationInserts).toEqual([
      expect.objectContaining({ pin_id: 'pin-1', tenant_id: 'tenant-1', title: 'Generated Title', feedback: null }),
    ])
    expect(db.deleted).toEqual([11])
    expect(db.archived).toEqual([])
    expect(mockNotifyPinError).not.toHaveBeenCalled()
  })

  it('reads at most 5 messages and hides them just past the Edge wall clock', async () => {
    const db = setupDb({ messages: [] })

    await runWorker()

    expect(db.read).toEqual([{ qty: 5, vt: 420 }])
    expect(db.lockReleased).toBe(true)
  })

  it('exits without reading when another worker holds the lock', async () => {
    const db = setupDb({ messages: [message(11, 1)], lockHeld: true })

    const { status, body } = await runWorker()

    expect(status).toBe(200)
    expect(body).toMatchObject({ locked: true })
    expect(db.read).toEqual([])
    expect(mockGeneratePinMetadata).not.toHaveBeenCalled()
  })

  it('leaves a failed message for retry while attempts remain, without error status or mail', async () => {
    const db = setupDb({ messages: [message(11, 2)] })
    mockGeneratePinMetadata.mockRejectedValueOnce(new SyntaxError('Unterminated string in JSON at position 282'))

    await runWorker()

    expect(db.deleted).toEqual([])
    expect(db.archived).toEqual([])
    expect(db.pinUpdates.filter((u) => u.values.status === 'error')).toEqual([])
    expect(mockNotifyPinError).not.toHaveBeenCalled()
    expect(db.lockReleased).toBe(true)
  })

  it('on the last attempt archives the message, marks the pin as error and mails once', async () => {
    const db = setupDb({ messages: [message(11, 3)] })
    mockGeneratePinMetadata.mockRejectedValueOnce(new SyntaxError('Unterminated string in JSON at position 282'))

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(db.deleted).toEqual([])
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-1',
      values: { status: 'error', error_message: 'Unterminated string in JSON at position 282' },
    })
    expect(mockNotifyPinError).toHaveBeenCalledTimes(1)
    expect(mockNotifyPinError).toHaveBeenCalledWith(
      expect.objectContaining({ pinId: 'pin-1', errorMessage: 'Unterminated string in JSON at position 282' }),
    )
  })

  it('gives up without another try when a previous last attempt crashed', async () => {
    const db = setupDb({ messages: [message(11, 4)] })

    await runWorker()

    expect(mockGeneratePinMetadata).not.toHaveBeenCalled()
    expect(db.archived).toEqual([11])
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-1',
      values: expect.objectContaining({ status: 'error' }),
    })
    expect(mockNotifyPinError).toHaveBeenCalledTimes(1)
  })

  it('handles each message of a batch independently', async () => {
    const db = setupDb({
      messages: [message(11, 1, 'pin-1'), message(12, 3, 'pin-missing')],
    })

    const { body } = await runWorker()

    expect(body).toMatchObject({ succeeded: 1, failed: 1, retrying: 0 })
    expect(db.deleted).toEqual([11])
    expect(db.archived).toEqual([12])
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-missing',
      values: { status: 'error', error_message: 'Pin not found: pin-missing' },
    })
  })

  it('treats a missing Gemini API key as a job failure', async () => {
    const db = setupDb({ messages: [message(11, 3)], apiKey: null })

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(db.pinUpdates).toContainEqual({
      id: 'pin-1',
      values: { status: 'error', error_message: expect.stringContaining('Gemini API key') },
    })
  })

  it('sends the fetched image bytes, article and project prompt to the model', async () => {
    setupDb({ messages: [message(11, 1)] })

    await runWorker()

    expect(mockFetchImageBytes).toHaveBeenCalledWith(
      'https://test.supabase.co/storage/v1/object/public/pin-images/tenant/image.png',
    )
    expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        article: { title: 'Article Title', content: 'Article Content' },
        image: { bytes: new Uint8Array([10, 20, 30]), mimeType: 'image/png' },
        mediaType: 'image',
        apiKey: 'test-api-key',
        systemPrompt: expect.any(String),
      }),
    )
  })

  it('passes empty article data when the pin has no linked article', async () => {
    setupDb({
      messages: [message(11, 1, 'pin-2')],
      pins: {
        'pin-2': { id: 'pin-2', blog_project_id: 'proj-1', image_path: 'tenant/image.png', blog_articles: null },
      },
    })

    await runWorker()

    expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ article: { title: undefined, content: undefined } }),
    )
  })

  it('uses a keyframe at the configured second for video pins', async () => {
    setupDb({
      messages: [message(11, 1, 'pin-v')],
      pins: {
        'pin-v': {
          id: 'pin-v',
          blog_project_id: 'proj-1',
          image_path: 'tenant/video.mp4',
          cover_keyframe_seconds: 2,
          blog_articles: null,
        },
      },
    })

    await runWorker()

    expect(mockExtractKeyframe).toHaveBeenCalledWith(expect.stringContaining('video.mp4'), { second: 2 })
    expect(mockFetchImageBytes).not.toHaveBeenCalled()
    expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'video',
        image: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      }),
    )
  })

  it('keeps only the three newest generations', async () => {
    const db = setupDb({
      messages: [message(11, 1)],
      generations: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }, { id: 'g5' }],
    })

    await runWorker()

    expect(db.generationDeletes).toEqual([{ notIn: '(g1,g2,g3)' }])
  })

  it('does not prune when three or fewer generations exist', async () => {
    const db = setupDb({ messages: [message(11, 1)], generations: [{ id: 'g1' }, { id: 'g2' }] })

    await runWorker()

    expect(db.generationDeletes).toEqual([])
  })
})

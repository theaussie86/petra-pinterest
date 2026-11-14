import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { PAGE_WITHOUT_ARTICLE, WORDPRESS_ARTICLE_WITH_META_DATE } from '@/test/fixtures/article-pages'

// Behaviour test for the scrape_article queue worker (ADR-0004, issue #90).
//
// The worker is a Deno Edge function kicked by pg_cron. We shim `Deno` before
// the import runs, capture the handler, then drive it with a Request. The queue
// (pgmq wrappers exposed as RPCs), the blog_articles table, the HTTP fetch and
// the mailer are faked; the real worker loop, scrape pipeline and Readability
// extraction (ADR-0008) run against an HTML fixture.

const { capturedHandler, fake, mockNotifyProjectError, fetchMock } =
  vi.hoisted(() => {
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
      mockNotifyProjectError: vi.fn(),
      fetchMock: vi.fn(),
    }
  })

vi.stubGlobal('fetch', fetchMock)

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => fake.client,
}))

vi.mock('../_shared/notifications.ts', () => ({
  notifyProjectError: (...args: any[]) => mockNotifyProjectError(...args),
}))

import './index.ts'

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: { blog_project_id: string; url: string; tenant_id: string }
}

const articlePage = () => new Response(WORDPRESS_ARTICLE_WITH_META_DATE, { status: 200 })

function setupDb(opts: {
  messages: QueueMessage[]
  lockHeld?: boolean
  archiveFails?: boolean
  upsertError?: string
}) {
  const state = {
    upserts: [] as Record<string, unknown>[],
    deleted: [] as number[],
    archived: [] as number[],
    read: [] as { qty: number; vt: number }[],
    lockReleased: false,
  }

  fake.client.from.mockImplementation((table: string) => {
    if (table === 'blog_articles') {
      const qb = createMockQueryBuilder(
        opts.upsertError ? { error: { message: opts.upsertError } } : { error: null },
      )
      qb.upsert.mockImplementation((row: Record<string, unknown>) => {
        state.upserts.push(row)
        return qb
      })
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
        if (opts.archiveFails) return { data: null, error: { message: 'connection reset' } }
        state.archived.push(args.p_msg_id)
        return { data: true, error: null }
      default:
        throw new Error(`unexpected rpc ${fn}`)
    }
  })

  return state
}

function message(msg_id: number, read_ct: number, url = 'https://blog.com/post'): QueueMessage {
  return { msg_id, read_ct, message: { blog_project_id: 'proj-1', url, tenant_id: 'tenant-1' } }
}

async function runWorker() {
  const response = await capturedHandler.current!(
    new Request('https://edge/scrape-article-worker', { method: 'POST' }),
  )
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(async () => articlePage())
})

describe('scrape-article-worker', () => {
  it('scrapes a queued article, upserts it and removes the message', async () => {
    const db = setupDb({ messages: [message(11, 1)] })

    const { status } = await runWorker()

    expect(status).toBe(200)
    expect(db.upserts).toContainEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        blog_project_id: 'proj-1',
        url: 'https://blog.com/post',
        title: '5 Abendrituale für besseren Schlaf',
        content: expect.stringContaining('## 1. Ein fester Rhythmus'),
        published_at: '2025-03-04T08:15:00.000Z',
      }),
    )
    expect(db.deleted).toEqual([11])
    expect(db.archived).toEqual([])
    expect(mockNotifyProjectError).not.toHaveBeenCalled()
  })

  it('normalizes the URL before fetching and storing it', async () => {
    const db = setupDb({ messages: [message(11, 1, 'https://Blog.com/post/')] })

    await runWorker()

    expect(fetchMock).toHaveBeenCalledWith('https://blog.com/post', expect.any(Object))
    expect(db.upserts[0]).toMatchObject({ url: 'https://blog.com/post' })
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
    expect(body).toMatchObject({ lockHeldElsewhere: true })
    expect(db.read).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves a failed message for retry while attempts remain, without a mail', async () => {
    const db = setupDb({ messages: [message(11, 2)] })
    fetchMock.mockRejectedValueOnce(new Error('network timeout'))

    await runWorker()

    expect(db.deleted).toEqual([])
    expect(db.archived).toEqual([])
    expect(mockNotifyProjectError).not.toHaveBeenCalled()
    expect(db.lockReleased).toBe(true)
  })

  it('on the last attempt archives the message and mails the project once', async () => {
    const db = setupDb({ messages: [message(11, 3)] })
    fetchMock.mockRejectedValueOnce(new Error('network timeout'))

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(db.deleted).toEqual([])
    expect(mockNotifyProjectError).toHaveBeenCalledTimes(1)
    expect(mockNotifyProjectError).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        subject: '[Pinfinity] Fehler beim Artikel-Scraping',
        errorMessage: 'network timeout',
        context: 'URL: https://blog.com/post',
      }),
    )
  })

  it('gives up without another try when a previous last attempt crashed', async () => {
    const db = setupDb({ messages: [message(11, 4)] })

    await runWorker()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.archived).toEqual([11])
    expect(mockNotifyProjectError).toHaveBeenCalledTimes(1)
  })

  it('scrapes without reading any Gemini API key', async () => {
    const db = setupDb({ messages: [message(11, 1)] })

    await runWorker()

    expect(db.deleted).toEqual([11])
    expect(fake.client.rpc).not.toHaveBeenCalledWith('get_gemini_api_key', expect.anything())
  })

  it('treats a page without a readable article as a job failure and upserts nothing', async () => {
    const db = setupDb({ messages: [message(11, 3)] })
    fetchMock.mockResolvedValueOnce(new Response(PAGE_WITHOUT_ARTICLE, { status: 200 }))

    await runWorker()

    expect(db.upserts).toEqual([])
    expect(db.archived).toEqual([11])
    expect(mockNotifyProjectError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining('No readable article found') }),
    )
  })

  it('treats a non-2xx fetch as a job failure', async () => {
    const db = setupDb({ messages: [message(11, 3)] })
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404, statusText: 'Not Found' }))

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(mockNotifyProjectError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining('Failed to fetch URL: 404') }),
    )
  })

  it('handles each message of a batch independently', async () => {
    const db = setupDb({
      messages: [message(11, 1, 'https://blog.com/ok'), message(12, 3, 'https://blog.com/bad')],
    })
    fetchMock
      .mockResolvedValueOnce(articlePage())
      .mockRejectedValueOnce(new Error('boom'))

    const { body } = await runWorker()

    expect(body).toMatchObject({ succeeded: 1, failed: 1, retrying: 0 })
    expect(db.deleted).toEqual([11])
    expect(db.archived).toEqual([12])
  })

  it('does not mail when the final message cannot be archived, so the retry mails only once', async () => {
    setupDb({ messages: [message(11, 3)], archiveFails: true })
    fetchMock.mockRejectedValueOnce(new Error('connection refused'))

    await runWorker()

    expect(mockNotifyProjectError).not.toHaveBeenCalled()
  })

  it('ends cleanly when the queue is empty', async () => {
    const db = setupDb({ messages: [] })

    const { status, body } = await runWorker()

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, succeeded: 0, retrying: 0, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.lockReleased).toBe(true)
  })
})

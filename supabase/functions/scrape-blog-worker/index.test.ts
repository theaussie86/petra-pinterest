import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Behaviour test for the scrape_blog queue worker (ADR-0004, issue #91).
//
// The worker is a Deno Edge function kicked by pg_cron. We shim `Deno` before
// the import runs, capture the handler, then drive it with a Request. The queue
// (pgmq wrappers exposed as RPCs), the blog_projects/blog_articles tables and
// the mailer are faked, and sitemap discovery is mocked; the real worker loop
// and the real new/changed URL diff run.

const { capturedHandler, fake, mockDiscoverSitemapEntries, mockNotifyProjectError } = vi.hoisted(
  () => {
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
      mockDiscoverSitemapEntries: vi.fn(),
      mockNotifyProjectError: vi.fn(),
    }
  },
)

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => fake.client,
}))

vi.mock('../_shared/sitemap.ts', () => ({
  discoverSitemapEntries: (...args: any[]) => mockDiscoverSitemapEntries(...args),
}))

vi.mock('../_shared/notifications.ts', () => ({
  notifyProjectError: (...args: any[]) => mockNotifyProjectError(...args),
}))

import './index.ts'

interface QueueMessage {
  msg_id: number
  read_ct: number
  message: { blog_project_id: string; tenant_id: string }
}

function setupDb(opts: {
  messages: QueueMessage[]
  lockHeld?: boolean
  archiveFails?: boolean
  existingArticles?: { url: string; scraped_at?: string | null }[]
  project?: { blog_url: string; sitemap_url: string | null } | null
  projectError?: string
  sendBatchError?: string
}) {
  const state = {
    enqueued: [] as { p_queue: string; p_messages: any[] }[],
    lastScrapedUpdates: [] as string[],
    deleted: [] as number[],
    archived: [] as number[],
    read: [] as { qty: number; vt: number }[],
    lockReleased: false,
  }

  fake.client.from.mockImplementation((table: string) => {
    if (table === 'blog_projects') {
      const qb = createMockQueryBuilder(
        opts.projectError
          ? { data: null, error: { message: opts.projectError } }
          : { data: opts.project ?? { blog_url: 'https://blog.com', sitemap_url: null }, error: null },
      )
      qb.update.mockImplementation((row: Record<string, unknown>) => {
        state.lastScrapedUpdates.push(row.last_scraped_at as string)
        return qb
      })
      return qb
    }
    if (table === 'blog_articles') {
      return createMockQueryBuilder({ data: opts.existingArticles ?? [], error: null })
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
      case 'queue_send_batch':
        if (opts.sendBatchError) return { data: null, error: { message: opts.sendBatchError } }
        state.enqueued.push({ p_queue: args.p_queue, p_messages: args.p_messages })
        return { data: null, error: null }
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

function message(msg_id: number, read_ct: number): QueueMessage {
  return { msg_id, read_ct, message: { blog_project_id: 'proj-1', tenant_id: 'tenant-1' } }
}

async function runWorker() {
  const response = await capturedHandler.current!(
    new Request('https://edge/scrape-blog-worker', { method: 'POST' }),
  )
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDiscoverSitemapEntries.mockResolvedValue([])
})

describe('scrape-blog-worker', () => {
  it('enqueues exactly the new and changed URLs into scrape_article', async () => {
    // known-unchanged: same lastmod as scrape; changed: newer lastmod; new: absent
    mockDiscoverSitemapEntries.mockResolvedValueOnce([
      { url: 'https://blog.com/unchanged', lastmod: '2026-01-01T00:00:00.000Z' },
      { url: 'https://blog.com/changed', lastmod: '2026-02-01T00:00:00.000Z' },
      { url: 'https://blog.com/new' },
    ])
    const db = setupDb({
      messages: [message(11, 1)],
      existingArticles: [
        { url: 'https://blog.com/unchanged', scraped_at: '2026-01-15T00:00:00.000Z' },
        { url: 'https://blog.com/changed', scraped_at: '2026-01-15T00:00:00.000Z' },
      ],
    })

    const { status, body } = await runWorker()

    expect(status).toBe(200)
    expect(db.enqueued).toHaveLength(1)
    expect(db.enqueued[0].p_queue).toBe('scrape_article')
    const urls = db.enqueued[0].p_messages.map((m) => m.url)
    expect(urls).toEqual(['https://blog.com/changed', 'https://blog.com/new'])
    expect(db.enqueued[0].p_messages).toContainEqual({
      blog_project_id: 'proj-1',
      url: 'https://blog.com/new',
      tenant_id: 'tenant-1',
    })
    expect(body).toMatchObject({ success: true, succeeded: 1 })
    expect(db.deleted).toEqual([11])
    expect(db.archived).toEqual([])
    expect(mockNotifyProjectError).not.toHaveBeenCalled()
  })

  it('has no per-run cap: enqueues far more than 25 URLs in one batch', async () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ url: `https://blog.com/post-${i}` }))
    mockDiscoverSitemapEntries.mockResolvedValueOnce(entries)
    const db = setupDb({ messages: [message(11, 1)] })

    await runWorker()

    expect(db.enqueued[0].p_messages).toHaveLength(40)
    expect(db.deleted).toEqual([11])
  })

  it('sets last_scraped_at after a successful scan', async () => {
    mockDiscoverSitemapEntries.mockResolvedValueOnce([{ url: 'https://blog.com/new' }])
    const db = setupDb({ messages: [message(11, 1)] })

    await runWorker()

    expect(db.lastScrapedUpdates).toHaveLength(1)
    expect(new Date(db.lastScrapedUpdates[0]).toString()).not.toBe('Invalid Date')
  })

  it('does not enqueue when nothing is new or changed', async () => {
    mockDiscoverSitemapEntries.mockResolvedValueOnce([
      { url: 'https://blog.com/old', lastmod: '2026-01-01T00:00:00.000Z' },
    ])
    const db = setupDb({
      messages: [message(11, 1)],
      existingArticles: [{ url: 'https://blog.com/old', scraped_at: '2026-02-01T00:00:00.000Z' }],
    })

    await runWorker()

    expect(db.enqueued).toEqual([])
    expect(db.deleted).toEqual([11])
    // still marks the project scanned
    expect(db.lastScrapedUpdates).toHaveLength(1)
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
    expect(mockDiscoverSitemapEntries).not.toHaveBeenCalled()
  })

  it('leaves a failed message for retry while attempts remain, without a mail', async () => {
    const db = setupDb({ messages: [message(11, 1)] })
    mockDiscoverSitemapEntries.mockRejectedValueOnce(new Error('sitemap 500'))

    await runWorker()

    expect(db.deleted).toEqual([])
    expect(db.archived).toEqual([])
    expect(mockNotifyProjectError).not.toHaveBeenCalled()
    expect(db.lockReleased).toBe(true)
  })

  it('on the last attempt archives the message and mails the project once', async () => {
    const db = setupDb({ messages: [message(11, 2)] })
    mockDiscoverSitemapEntries.mockRejectedValueOnce(new Error('sitemap 500'))

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(db.deleted).toEqual([])
    expect(mockNotifyProjectError).toHaveBeenCalledTimes(1)
    expect(mockNotifyProjectError).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        subject: '[Pinfinity] Fehler beim Blog-Scan',
        errorMessage: 'sitemap 500',
      }),
    )
  })

  it('gives up without another try when a previous last attempt crashed', async () => {
    const db = setupDb({ messages: [message(11, 3)] })

    await runWorker()

    expect(mockDiscoverSitemapEntries).not.toHaveBeenCalled()
    expect(db.archived).toEqual([11])
    expect(mockNotifyProjectError).toHaveBeenCalledTimes(1)
  })

  it('treats a failed article enqueue as a job failure', async () => {
    mockDiscoverSitemapEntries.mockResolvedValueOnce([{ url: 'https://blog.com/new' }])
    const db = setupDb({ messages: [message(11, 2)], sendBatchError: 'queue send failed' })

    await runWorker()

    expect(db.archived).toEqual([11])
    expect(mockNotifyProjectError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining('Failed to enqueue articles') }),
    )
  })

  it('does not mail when the final message cannot be archived, so the retry mails only once', async () => {
    setupDb({ messages: [message(11, 2)], archiveFails: true })
    mockDiscoverSitemapEntries.mockRejectedValueOnce(new Error('sitemap 500'))

    await runWorker()

    expect(mockNotifyProjectError).not.toHaveBeenCalled()
  })

  it('ends cleanly when the queue is empty', async () => {
    const db = setupDb({ messages: [] })

    const { status, body } = await runWorker()

    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, succeeded: 0, retrying: 0, failed: 0 })
    expect(mockDiscoverSitemapEntries).not.toHaveBeenCalled()
    expect(db.lockReleased).toBe(true)
  })
})

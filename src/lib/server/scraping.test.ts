import { scrapeBlogFn, scrapeSingleFn } from './scraping'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient, mockServiceClient, mockDiscoverSitemapUrls } = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
  },
  mockServiceClient: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
  mockDiscoverSitemapUrls: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
  }),
}))

vi.mock('./supabase', () => ({
  getSupabaseServerClient: () => mockServerClient,
  getSupabaseServiceClient: () => mockServiceClient,
}))

vi.mock('../../../server/lib/scraping', () => ({
  discoverSitemapUrls: (...args: any[]) => mockDiscoverSitemapUrls(...args),
}))

describe('scrapeBlogFn', () => {
  it('discovers URLs, diffs against existing, invokes edge functions for new URLs', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const existingQb = createMockQueryBuilder({
      data: [{ url: 'https://blog.com/existing' }],
    })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(existingQb as any)

    mockDiscoverSitemapUrls.mockResolvedValueOnce([
      'https://blog.com/existing',
      'https://blog.com/new-1',
      'https://blog.com/new-2',
    ])

    const result = await scrapeBlogFn({
      data: {
        blog_project_id: 'proj-1',
        blog_url: 'https://blog.com',
        sitemap_url: null,
      },
    })

    expect(result).toEqual({ success: true, dispatched: 2 })
    expect(mockDiscoverSitemapUrls).toHaveBeenCalledWith('https://blog.com', undefined)
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledTimes(2)
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledWith('scrape-single', {
      body: {
        blog_project_id: 'proj-1',
        url: 'https://blog.com/new-1',
        tenant_id: 'test-tenant-id',
      },
    })
  })

  it('returns 0 dispatched when all URLs already exist', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const existingQb = createMockQueryBuilder({
      data: [{ url: 'https://blog.com/post-1' }],
    })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(existingQb as any)

    mockDiscoverSitemapUrls.mockResolvedValueOnce(['https://blog.com/post-1'])

    const result = await scrapeBlogFn({
      data: { blog_project_id: 'proj-1', blog_url: 'https://blog.com' },
    })

    expect(result).toEqual({ success: true, dispatched: 0 })
    expect(mockServiceClient.functions.invoke).not.toHaveBeenCalled()
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(
      scrapeBlogFn({ data: { blog_project_id: 'p', blog_url: 'https://x.com' } }),
    ).rejects.toThrow('Not authenticated')
  })

  it('passes sitemap_url to discoverSitemapUrls when provided', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const existingQb = createMockQueryBuilder({ data: [] })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(existingQb as any)
    mockDiscoverSitemapUrls.mockResolvedValueOnce([])

    await scrapeBlogFn({
      data: {
        blog_project_id: 'proj-1',
        blog_url: 'https://blog.com',
        sitemap_url: 'https://blog.com/sitemap.xml',
      },
    })

    expect(mockDiscoverSitemapUrls).toHaveBeenCalledWith(
      'https://blog.com',
      'https://blog.com/sitemap.xml',
    )
  })
})

describe('scrapeSingleFn', () => {
  it('authenticates and invokes scrape-single edge function', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await scrapeSingleFn({
      data: { blog_project_id: 'proj-1', url: 'https://blog.com/post' },
    })

    expect(result).toMatchObject({ success: true, method: 'single' })
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledWith('scrape-single', {
      body: {
        blog_project_id: 'proj-1',
        url: 'https://blog.com/post',
        tenant_id: 'test-tenant-id',
      },
    })
  })
})

import { scrapeBlogFn, scrapeSingleFn } from './scraping'

const { mockServerClient, mockServiceClient } = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
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

describe('scrapeBlogFn', () => {
  it('authenticates and enqueues a scrape_blog job via the tenant-checked RPC', async () => {
    const result = await scrapeBlogFn({
      data: {
        blog_project_id: 'proj-1',
        blog_url: 'https://blog.com',
        sitemap_url: null,
      },
    })

    expect(result).toEqual({ success: true, dispatched: 1 })
    expect(mockServerClient.rpc).toHaveBeenCalledWith('enqueue_scrape_blog', {
      p_blog_project_id: 'proj-1',
    })
    // The queue path never touches the synchronous edge function.
    expect(mockServiceClient.functions.invoke).not.toHaveBeenCalled()
  })

  it('throws when the enqueue RPC rejects (foreign project or unauthenticated)', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Project not found' } })

    await expect(
      scrapeBlogFn({ data: { blog_project_id: 'other', blog_url: 'https://blog.com' } }),
    ).rejects.toThrow('Project not found')
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
})

describe('scrapeSingleFn', () => {
  it('authenticates and enqueues a scrape_article job via the tenant-checked RPC', async () => {
    const result = await scrapeSingleFn({
      data: { blog_project_id: 'proj-1', url: 'https://blog.com/post' },
    })

    expect(result).toMatchObject({ success: true, method: 'single' })
    expect(mockServerClient.rpc).toHaveBeenCalledWith('enqueue_scrape_article', {
      p_blog_project_id: 'proj-1',
      p_url: 'https://blog.com/post',
    })
    // The queue path never touches the synchronous edge function.
    expect(mockServiceClient.functions.invoke).not.toHaveBeenCalled()
  })

  it('throws when the enqueue RPC rejects (foreign project or unauthenticated)', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Project not found' } })

    await expect(
      scrapeSingleFn({ data: { blog_project_id: 'other', url: 'https://blog.com/post' } }),
    ).rejects.toThrow('Project not found')
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    await expect(
      scrapeSingleFn({ data: { blog_project_id: 'proj-1', url: 'https://blog.com/post' } }),
    ).rejects.toThrow('Not authenticated')
  })
})

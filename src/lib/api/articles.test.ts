import {
  getAllArticles,
  getArticlesByProject,
  getArticle,
  archiveArticle,
  restoreArticle,
  getArchivedArticles,
  getArticlesPaginated,
  getArchivedArticlesPaginated,
  updateArticleContent,
  scrapeBlog,
  addArticleManually,
} from './articles'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildArticle } from '@/test/factories'

// Shared `from` mock so reads (via getSupabaseClient → supabase-iso) and
// mutations (via the browser `supabase` client) hit the same query builder.
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    storage: { from: vi.fn() },
    auth: { getUser: vi.fn() },
  },
}))

// Reads use the isomorphic selector (ADR 0003). Mock it to return a client
// whose `from` is the shared mock above.
vi.mock('@/lib/supabase-iso', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/server/scraping', () => ({
  scrapeBlogFn: vi.fn().mockResolvedValue({ success: true, dispatched: 3 }),
  scrapeSingleFn: vi.fn().mockResolvedValue({
    success: true,
    articles_found: 1,
    articles_created: 0,
    articles_updated: 0,
    method: 'single',
    errors: [],
  }),
}))

describe('getAllArticles()', () => {
  it('fetches non-archived articles ordered by published_at desc', async () => {
    const articles = [buildArticle()]
    const qb = createMockQueryBuilder({ data: articles })
    mockFrom.mockReturnValue(qb as any)

    const result = await getAllArticles()

    expect(result).toEqual(articles)
    expect(mockFrom).toHaveBeenCalledWith('blog_articles')
    expect(qb.is).toHaveBeenCalledWith('archived_at', null)
    expect(qb.order).toHaveBeenCalledWith('published_at', { ascending: false, nullsFirst: false })
  })
})

describe('getArticlesByProject()', () => {
  it('filters by project and excludes archived', async () => {
    const articles = [buildArticle()]
    const qb = createMockQueryBuilder({ data: articles })
    mockFrom.mockReturnValue(qb as any)

    const result = await getArticlesByProject('proj-1')

    expect(result).toEqual(articles)
    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'proj-1')
    expect(qb.is).toHaveBeenCalledWith('archived_at', null)
  })
})

describe('getArticle()', () => {
  it('fetches single article by id', async () => {
    const article = buildArticle({ id: 'art-1' })
    const qb = createMockQueryBuilder({ data: article })
    mockFrom.mockReturnValue(qb as any)

    const result = await getArticle('art-1')

    expect(result).toEqual(article)
    expect(qb.eq).toHaveBeenCalledWith('id', 'art-1')
    expect(qb.single).toHaveBeenCalled()
  })
})

describe('archiveArticle()', () => {
  it('sets archived_at to current timestamp', async () => {
    const archived = buildArticle({ archived_at: '2025-06-01T00:00:00Z' })
    const qb = createMockQueryBuilder({ data: archived })
    mockFrom.mockReturnValue(qb as any)

    const result = await archiveArticle('art-1')

    expect(qb.update).toHaveBeenCalledWith({ archived_at: expect.any(String) })
    expect(qb.eq).toHaveBeenCalledWith('id', 'art-1')
    expect(result).toEqual(archived)
  })
})

describe('restoreArticle()', () => {
  it('sets archived_at to null', async () => {
    const restored = buildArticle({ archived_at: null })
    const qb = createMockQueryBuilder({ data: restored })
    mockFrom.mockReturnValue(qb as any)

    const result = await restoreArticle('art-1')

    expect(qb.update).toHaveBeenCalledWith({ archived_at: null })
    expect(result).toEqual(restored)
  })
})

describe('getArchivedArticles()', () => {
  it('fetches only archived articles for a project', async () => {
    const articles = [buildArticle({ archived_at: '2025-01-01T00:00:00Z' })]
    const qb = createMockQueryBuilder({ data: articles })
    mockFrom.mockReturnValue(qb as any)

    const result = await getArchivedArticles('proj-1')

    expect(result).toEqual(articles)
    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'proj-1')
    expect(qb.not).toHaveBeenCalledWith('archived_at', 'is', null)
    expect(qb.order).toHaveBeenCalledWith('archived_at', { ascending: false })
  })
})

describe('getArticlesPaginated()', () => {
  it('fetches a page of active articles for a project and reports hasMore', async () => {
    // Request limit 2 → fetch 3 to detect a further page
    const articles = [buildArticle({ id: 'a1' }), buildArticle({ id: 'a2' }), buildArticle({ id: 'a3' })]
    const qb = createMockQueryBuilder({ data: articles })
    mockFrom.mockReturnValue(qb as any)

    const result = await getArticlesPaginated('proj-1', { offset: 0, limit: 2 })

    expect(mockFrom).toHaveBeenCalledWith('blog_articles')
    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'proj-1')
    expect(qb.is).toHaveBeenCalledWith('archived_at', null)
    expect(qb.range).toHaveBeenCalledWith(0, 2)
    expect(result.hasMore).toBe(true)
    expect(result.articles).toHaveLength(2)
  })
})

describe('getArchivedArticlesPaginated()', () => {
  it('fetches a page of archived articles for a project', async () => {
    const articles = [buildArticle({ id: 'a1', archived_at: '2025-01-01T00:00:00Z' })]
    const qb = createMockQueryBuilder({ data: articles })
    mockFrom.mockReturnValue(qb as any)

    const result = await getArchivedArticlesPaginated('proj-1', { offset: 0, limit: 20 })

    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'proj-1')
    expect(qb.not).toHaveBeenCalledWith('archived_at', 'is', null)
    expect(result.hasMore).toBe(false)
    expect(result.articles).toEqual(articles)
  })
})

describe('updateArticleContent()', () => {
  it('updates article content by id', async () => {
    const updated = buildArticle({ content: 'New content' })
    const qb = createMockQueryBuilder({ data: updated })
    mockFrom.mockReturnValue(qb as any)

    const result = await updateArticleContent('art-1', 'New content')

    expect(qb.update).toHaveBeenCalledWith({ content: 'New content' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'art-1')
    expect(result).toEqual(updated)
  })
})

describe('scrapeBlog()', () => {
  it('delegates to scrapeBlogFn server function', async () => {
    const result = await scrapeBlog({
      blog_project_id: 'proj-1',
      blog_url: 'https://example.com',
    })

    expect(result).toEqual({ success: true, dispatched: 3 })
  })
})

describe('addArticleManually()', () => {
  it('delegates to scrapeSingleFn server function', async () => {
    const result = await addArticleManually('proj-1', 'https://example.com/post')

    expect(result).toMatchObject({ success: true, method: 'single' })
  })
})

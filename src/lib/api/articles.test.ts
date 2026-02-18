import { supabase } from '@/lib/supabase'
import {
  getAllArticles,
  getArticlesByProject,
  getArticle,
  archiveArticle,
  restoreArticle,
  getArchivedArticles,
  updateArticleContent,
  scrapeBlog,
  addArticleManually,
} from './articles'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildArticle } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
    auth: { getUser: vi.fn() },
  },
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

const mockFrom = vi.mocked(supabase.from)

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

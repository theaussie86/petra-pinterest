import { getPinTemplatesByArticle, getPinTemplateCountsByProject } from './pin-templates'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildPinTemplate } from '@/test/factories'

// Reads go through the isomorphic selector (ADR 0003); point it at a shared
// `from` mock so we can assert the query shape.
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('@/lib/supabase-iso', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}))

describe('getPinTemplatesByArticle()', () => {
  it('fetches templates for an article ordered by position ascending', async () => {
    const templates = [
      buildPinTemplate({ position: 1 }),
      buildPinTemplate({ position: 2 }),
    ]
    const qb = createMockQueryBuilder({ data: templates })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinTemplatesByArticle('article-1')

    expect(result).toEqual(templates)
    expect(mockFrom).toHaveBeenCalledWith('pin_templates')
    expect(qb.eq).toHaveBeenCalledWith('blog_article_id', 'article-1')
    expect(qb.order).toHaveBeenCalledWith('position', { ascending: true })
  })
})

describe('getPinTemplateCountsByProject()', () => {
  it('aggregates template counts per article for a project', async () => {
    // Rows come back scoped to the project via the embedded blog_articles join.
    const rows = [
      { blog_article_id: 'a1' },
      { blog_article_id: 'a1' },
      { blog_article_id: 'a2' },
    ]
    const qb = createMockQueryBuilder({ data: rows })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinTemplateCountsByProject('proj-1')

    expect(mockFrom).toHaveBeenCalledWith('pin_templates')
    expect(qb.eq).toHaveBeenCalledWith('blog_articles.blog_project_id', 'proj-1')
    expect(result).toEqual({ a1: 2, a2: 1 })
  })

  it('returns an empty map when the project has no templates', async () => {
    const qb = createMockQueryBuilder({ data: [] })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinTemplateCountsByProject('proj-1')

    expect(result).toEqual({})
  })
})

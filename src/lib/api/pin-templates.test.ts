import {
  getPinTemplatesByArticle,
  getOpenPinTemplateCountsByProject,
  updatePinTemplateStatus,
} from './pin-templates'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildPinTemplate } from '@/test/factories'

// Reads go through the isomorphic selector (ADR 0003); mutations go through the
// browser `supabase` client. Point both at a shared `from` mock so we can assert
// the query shape.
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

describe('getOpenPinTemplateCountsByProject()', () => {
  it('aggregates only open (draft + needs_revision) templates per article', async () => {
    // Rows come back scoped to the project via the embedded blog_articles join.
    const rows = [
      { blog_article_id: 'a1', status: 'draft' },
      { blog_article_id: 'a1', status: 'needs_revision' },
      { blog_article_id: 'a1', status: 'approved' },
      { blog_article_id: 'a2', status: 'draft' },
      { blog_article_id: 'a3', status: 'archived' },
    ]
    const qb = createMockQueryBuilder({ data: rows })
    mockFrom.mockReturnValue(qb as any)

    const result = await getOpenPinTemplateCountsByProject('proj-1')

    expect(mockFrom).toHaveBeenCalledWith('pin_templates')
    expect(qb.eq).toHaveBeenCalledWith('blog_articles.blog_project_id', 'proj-1')
    // a1 has 2 open, a2 has 1 open, a3 has 0 open (omitted).
    expect(result).toEqual({ a1: 2, a2: 1 })
  })

  it('returns an empty map when the project has no templates', async () => {
    const qb = createMockQueryBuilder({ data: [] })
    mockFrom.mockReturnValue(qb as any)

    const result = await getOpenPinTemplateCountsByProject('proj-1')

    expect(result).toEqual({})
  })
})

describe('updatePinTemplateStatus()', () => {
  it('updates the status of a single template and returns the row', async () => {
    const updated = buildPinTemplate({ status: 'approved' })
    const qb = createMockQueryBuilder({ data: updated })
    mockFrom.mockReturnValue(qb as any)

    const result = await updatePinTemplateStatus('tpl-1', 'approved')

    expect(mockFrom).toHaveBeenCalledWith('pin_templates')
    expect(qb.update).toHaveBeenCalledWith({ status: 'approved' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'tpl-1')
    expect(result).toEqual(updated)
  })

  it('throws when the update fails', async () => {
    const qb = createMockQueryBuilder({ data: null, error: new Error('boom') })
    mockFrom.mockReturnValue(qb as any)

    await expect(updatePinTemplateStatus('tpl-1', 'archived')).rejects.toThrow('boom')
  })
})

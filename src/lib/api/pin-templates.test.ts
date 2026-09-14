import {
  getPinTemplatesByArticle,
  getOpenPinTemplateCountsByProject,
  updatePinTemplateStatus,
  getPinTemplateRevisions,
  requestPinTemplateRevision,
} from './pin-templates'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildPinTemplate, buildPinTemplateRevision } from '@/test/factories'

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

vi.mock('@/lib/auth', () => ({
  ensureProfile: vi.fn().mockResolvedValue({ tenant_id: 'test-tenant-id' }),
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

describe('getPinTemplateRevisions()', () => {
  it('fetches the last 3 revisions for a template, newest first', async () => {
    const revisions = [
      buildPinTemplateRevision({ template_id: 'tpl-1' }),
      buildPinTemplateRevision({ template_id: 'tpl-1' }),
    ]
    const qb = createMockQueryBuilder({ data: revisions })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinTemplateRevisions('tpl-1')

    expect(result).toEqual(revisions)
    expect(mockFrom).toHaveBeenCalledWith('pin_template_revisions')
    expect(qb.eq).toHaveBeenCalledWith('template_id', 'tpl-1')
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(qb.limit).toHaveBeenCalledWith(3)
  })

  it('returns an empty array when data is null', async () => {
    const qb = createMockQueryBuilder({ data: null })
    mockFrom.mockReturnValue(qb as any)

    expect(await getPinTemplateRevisions('tpl-1')).toEqual([])
  })
})

describe('requestPinTemplateRevision()', () => {
  it('inserts the revision then moves the template to needs_revision', async () => {
    const insertQb = createMockQueryBuilder({ data: null })
    const updated = buildPinTemplate({ status: 'needs_revision' })
    const updateQb = createMockQueryBuilder({ data: updated })
    // Prune read returns 2 rows → nothing to delete.
    const pruneQb = createMockQueryBuilder({ data: [{ id: 'r1' }, { id: 'r2' }] })

    mockFrom
      .mockReturnValueOnce(insertQb as any)
      .mockReturnValueOnce(updateQb as any)
      .mockReturnValueOnce(pruneQb as any)

    const result = await requestPinTemplateRevision('tpl-1', '  bitte kürzer  ')

    // Feedback is trimmed and tagged with the resolved tenant.
    expect(insertQb.insert).toHaveBeenCalledWith({
      template_id: 'tpl-1',
      tenant_id: 'test-tenant-id',
      feedback: 'bitte kürzer',
    })
    expect(updateQb.update).toHaveBeenCalledWith({ status: 'needs_revision' })
    expect(updateQb.eq).toHaveBeenCalledWith('id', 'tpl-1')
    expect(result).toEqual(updated)
  })

  it('prunes revisions beyond the last 3', async () => {
    const insertQb = createMockQueryBuilder({ data: null })
    const updateQb = createMockQueryBuilder({ data: buildPinTemplate() })
    // Four rows, newest first → the oldest (r4) must be deleted.
    const pruneQb = createMockQueryBuilder({
      data: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }],
    })
    const deleteQb = createMockQueryBuilder({ data: null })

    mockFrom
      .mockReturnValueOnce(insertQb as any)
      .mockReturnValueOnce(updateQb as any)
      .mockReturnValueOnce(pruneQb as any)
      .mockReturnValueOnce(deleteQb as any)

    await requestPinTemplateRevision('tpl-1', 'feedback')

    expect(deleteQb.delete).toHaveBeenCalled()
    expect(deleteQb.not).toHaveBeenCalledWith('id', 'in', '(r1,r2,r3)')
  })

  it('throws when the insert fails and does not change status', async () => {
    const insertQb = createMockQueryBuilder({ data: null, error: new Error('boom') })
    mockFrom.mockReturnValueOnce(insertQb as any)

    await expect(requestPinTemplateRevision('tpl-1', 'feedback')).rejects.toThrow('boom')
    // Only the insert was attempted.
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })
})

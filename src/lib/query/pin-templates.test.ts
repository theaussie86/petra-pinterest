import {
  pinTemplatesByArticleQueryOptions,
  pinTemplatesByArticleQueryKey,
  pinTemplateOpenCountsQueryOptions,
  pinTemplateOpenCountsQueryKey,
  pinTemplateRevisionsQueryOptions,
  pinTemplateRevisionsQueryKey,
} from './pin-templates'

const {
  mockGetPinTemplatesByArticle,
  mockGetOpenPinTemplateCountsByProject,
  mockGetPinTemplateRevisions,
} = vi.hoisted(() => ({
  mockGetPinTemplatesByArticle: vi.fn(),
  mockGetOpenPinTemplateCountsByProject: vi.fn(),
  mockGetPinTemplateRevisions: vi.fn(),
}))

vi.mock('@/lib/api/pin-templates', () => ({
  getPinTemplatesByArticle: (...args: any[]) => mockGetPinTemplatesByArticle(...args),
  getOpenPinTemplateCountsByProject: (...args: any[]) =>
    mockGetOpenPinTemplateCountsByProject(...args),
  getPinTemplateRevisions: (...args: any[]) => mockGetPinTemplateRevisions(...args),
}))

describe('pinTemplatesByArticleQueryOptions', () => {
  it('uses a stable ["pin-templates", "article", id] key', () => {
    expect(pinTemplatesByArticleQueryOptions('a1').queryKey).toEqual([
      'pin-templates',
      'article',
      'a1',
    ])
    expect(pinTemplatesByArticleQueryKey('a1')).toEqual(['pin-templates', 'article', 'a1'])
  })

  it('keys distinct articles separately', () => {
    expect(pinTemplatesByArticleQueryOptions('a1').queryKey).not.toEqual(
      pinTemplatesByArticleQueryOptions('a2').queryKey,
    )
  })

  it('sets the project default 30s staleTime', () => {
    expect(pinTemplatesByArticleQueryOptions('a1').staleTime).toBe(30 * 1000)
  })

  it('resolves via getPinTemplatesByArticle with the article id', async () => {
    const templates = [{ id: 't1' }]
    mockGetPinTemplatesByArticle.mockResolvedValueOnce(templates)

    const result = await pinTemplatesByArticleQueryOptions('a1').queryFn!({} as any)

    expect(mockGetPinTemplatesByArticle).toHaveBeenCalledWith('a1')
    expect(result).toEqual(templates)
  })
})

describe('pinTemplateOpenCountsQueryOptions', () => {
  it('uses a stable ["pin-templates", "open-counts", projectId] key', () => {
    expect(pinTemplateOpenCountsQueryOptions('proj1').queryKey).toEqual([
      'pin-templates',
      'open-counts',
      'proj1',
    ])
    expect(pinTemplateOpenCountsQueryKey('proj1')).toEqual([
      'pin-templates',
      'open-counts',
      'proj1',
    ])
  })

  it('resolves via getOpenPinTemplateCountsByProject with the project id', async () => {
    const counts = { a1: 3 }
    mockGetOpenPinTemplateCountsByProject.mockResolvedValueOnce(counts)

    const result = await pinTemplateOpenCountsQueryOptions('proj1').queryFn!({} as any)

    expect(mockGetOpenPinTemplateCountsByProject).toHaveBeenCalledWith('proj1')
    expect(result).toEqual(counts)
  })
})

describe('pinTemplateRevisionsQueryOptions', () => {
  it('uses a stable ["pin-templates", "revisions", templateId] key', () => {
    expect(pinTemplateRevisionsQueryOptions('t1').queryKey).toEqual([
      'pin-templates',
      'revisions',
      't1',
    ])
    expect(pinTemplateRevisionsQueryKey('t1')).toEqual(['pin-templates', 'revisions', 't1'])
  })

  it('resolves via getPinTemplateRevisions with the template id', async () => {
    const revisions = [{ id: 'r1' }]
    mockGetPinTemplateRevisions.mockResolvedValueOnce(revisions)

    const result = await pinTemplateRevisionsQueryOptions('t1').queryFn!({} as any)

    expect(mockGetPinTemplateRevisions).toHaveBeenCalledWith('t1')
    expect(result).toEqual(revisions)
  })
})

import {
  pinTemplatesByArticleQueryOptions,
  pinTemplatesByArticleQueryKey,
  pinTemplateCountsQueryOptions,
  pinTemplateCountsQueryKey,
} from './pin-templates'

const { mockGetPinTemplatesByArticle, mockGetPinTemplateCountsByProject } = vi.hoisted(() => ({
  mockGetPinTemplatesByArticle: vi.fn(),
  mockGetPinTemplateCountsByProject: vi.fn(),
}))

vi.mock('@/lib/api/pin-templates', () => ({
  getPinTemplatesByArticle: (...args: any[]) => mockGetPinTemplatesByArticle(...args),
  getPinTemplateCountsByProject: (...args: any[]) => mockGetPinTemplateCountsByProject(...args),
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

describe('pinTemplateCountsQueryOptions', () => {
  it('uses a stable ["pin-templates", "counts", projectId] key', () => {
    expect(pinTemplateCountsQueryOptions('proj1').queryKey).toEqual([
      'pin-templates',
      'counts',
      'proj1',
    ])
    expect(pinTemplateCountsQueryKey('proj1')).toEqual(['pin-templates', 'counts', 'proj1'])
  })

  it('resolves via getPinTemplateCountsByProject with the project id', async () => {
    const counts = { a1: 3 }
    mockGetPinTemplateCountsByProject.mockResolvedValueOnce(counts)

    const result = await pinTemplateCountsQueryOptions('proj1').queryFn!({} as any)

    expect(mockGetPinTemplateCountsByProject).toHaveBeenCalledWith('proj1')
    expect(result).toEqual(counts)
  })
})

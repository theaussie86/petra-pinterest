import {
  articleQueryOptions,
  articleQueryKey,
  articlesPaginatedQueryOptions,
  articlesPaginatedQueryKey,
  archivedArticlesPaginatedQueryOptions,
  archivedArticlesPaginatedQueryKey,
} from './articles'

const { mockGetArticle, mockGetArticlesPaginated, mockGetArchivedArticlesPaginated } = vi.hoisted(
  () => ({
    mockGetArticle: vi.fn(),
    mockGetArticlesPaginated: vi.fn(),
    mockGetArchivedArticlesPaginated: vi.fn(),
  }),
)

vi.mock('@/lib/api/articles', () => ({
  getArticle: (...args: any[]) => mockGetArticle(...args),
  getArticlesPaginated: (...args: any[]) => mockGetArticlesPaginated(...args),
  getArchivedArticlesPaginated: (...args: any[]) => mockGetArchivedArticlesPaginated(...args),
}))

describe('articleQueryOptions', () => {
  it('uses a stable ["articles", "detail", id] key reflecting the article id', () => {
    expect(articleQueryOptions('a1').queryKey).toEqual(['articles', 'detail', 'a1'])
    expect(articleQueryKey('a1')).toEqual(['articles', 'detail', 'a1'])
  })

  it('keys distinct articles separately so loader and hook share one entry per id', () => {
    expect(articleQueryOptions('a1').queryKey).not.toEqual(articleQueryOptions('a2').queryKey)
  })

  it('nests under the ["articles"] key so article mutations/invalidation also refresh the detail', () => {
    // ['articles'] is a prefix of ['articles', 'detail', id], so
    // invalidateQueries({ queryKey: ['articles'] }) matches the detail too.
    expect(articleQueryOptions('a1').queryKey.slice(0, 1)).toEqual(['articles'])
  })

  it('sets the project default 30s staleTime', () => {
    expect(articleQueryOptions('a1').staleTime).toBe(30 * 1000)
  })

  it('resolves the article via the getArticle api function with the id', async () => {
    const article = { id: 'a1' }
    mockGetArticle.mockResolvedValueOnce(article)

    const result = await articleQueryOptions('a1').queryFn!({} as any)

    expect(mockGetArticle).toHaveBeenCalledWith('a1')
    expect(result).toEqual(article)
  })
})

describe('articlesPaginatedQueryOptions', () => {
  it('uses a stable ["articles", projectId, "paginated"] key', () => {
    expect(articlesPaginatedQueryOptions('proj1').queryKey).toEqual([
      'articles',
      'proj1',
      'paginated',
    ])
    expect(articlesPaginatedQueryKey('proj1')).toEqual(['articles', 'proj1', 'paginated'])
  })

  it('keys distinct projects separately so loader and hook share one entry per project', () => {
    expect(articlesPaginatedQueryOptions('proj1').queryKey).not.toEqual(
      articlesPaginatedQueryOptions('proj2').queryKey,
    )
  })

  it('pages by offset: hasMore yields the next offset, otherwise no further pages', () => {
    const options = articlesPaginatedQueryOptions('proj1', { pageSize: 20 })

    expect(options.initialPageParam).toBe(0)
    expect(
      options.getNextPageParam({ articles: [], hasMore: true }, [{ articles: [], hasMore: true }], 0, [0]),
    ).toBe(20)
    expect(
      options.getNextPageParam({ articles: [], hasMore: false }, [{ articles: [], hasMore: false }], 0, [0]),
    ).toBeUndefined()
  })

  it('resolves a page via getArticlesPaginated forwarding the offset and page size', async () => {
    const page = { articles: [{ id: 'a1' }], hasMore: false }
    mockGetArticlesPaginated.mockResolvedValueOnce(page)

    const options = articlesPaginatedQueryOptions('proj1', { pageSize: 50 })
    const result = await options.queryFn!({ pageParam: 100 } as any)

    expect(mockGetArticlesPaginated).toHaveBeenCalledWith('proj1', { offset: 100, limit: 50 })
    expect(result).toEqual(page)
  })

  it('sets the project default 30s staleTime', () => {
    expect(articlesPaginatedQueryOptions('proj1').staleTime).toBe(30 * 1000)
  })
})

describe('archivedArticlesPaginatedQueryOptions', () => {
  it('uses a stable ["articles", projectId, "archived", "paginated"] key', () => {
    expect(archivedArticlesPaginatedQueryOptions('proj1').queryKey).toEqual([
      'articles',
      'proj1',
      'archived',
      'paginated',
    ])
    expect(archivedArticlesPaginatedQueryKey('proj1')).toEqual([
      'articles',
      'proj1',
      'archived',
      'paginated',
    ])
  })

  it('resolves a page via getArchivedArticlesPaginated forwarding the offset and page size', async () => {
    const page = { articles: [{ id: 'a1' }], hasMore: false }
    mockGetArchivedArticlesPaginated.mockResolvedValueOnce(page)

    const options = archivedArticlesPaginatedQueryOptions('proj1', { pageSize: 50 })
    const result = await options.queryFn!({ pageParam: 100 } as any)

    expect(mockGetArchivedArticlesPaginated).toHaveBeenCalledWith('proj1', { offset: 100, limit: 50 })
    expect(result).toEqual(page)
  })
})

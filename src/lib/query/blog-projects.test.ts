import { blogProjectsQueryOptions, BLOG_PROJECTS_QUERY_KEY } from './blog-projects'

const { mockGetBlogProjects } = vi.hoisted(() => ({
  mockGetBlogProjects: vi.fn(),
}))

vi.mock('@/lib/api/blog-projects', () => ({
  getBlogProjects: (...args: any[]) => mockGetBlogProjects(...args),
}))

describe('blogProjectsQueryOptions', () => {
  it('uses the stable ["blog-projects"] query key so loader and hook share one cache entry', () => {
    expect(blogProjectsQueryOptions().queryKey).toEqual(BLOG_PROJECTS_QUERY_KEY)
    expect(BLOG_PROJECTS_QUERY_KEY).toEqual(['blog-projects'])
  })

  it('sets the project default 30s staleTime', () => {
    expect(blogProjectsQueryOptions().staleTime).toBe(30 * 1000)
  })

  it('resolves the projects via the getBlogProjects api function', async () => {
    const projects = [{ id: 'p1' }, { id: 'p2' }]
    mockGetBlogProjects.mockResolvedValueOnce(projects)

    const result = await blogProjectsQueryOptions().queryFn!({} as any)

    expect(mockGetBlogProjects).toHaveBeenCalledTimes(1)
    expect(result).toEqual(projects)
  })
})

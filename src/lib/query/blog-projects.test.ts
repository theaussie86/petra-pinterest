import {
  blogProjectsQueryOptions,
  BLOG_PROJECTS_QUERY_KEY,
  blogProjectQueryOptions,
  blogProjectQueryKey,
} from './blog-projects'

const { mockGetBlogProjects, mockGetBlogProject } = vi.hoisted(() => ({
  mockGetBlogProjects: vi.fn(),
  mockGetBlogProject: vi.fn(),
}))

vi.mock('@/lib/api/blog-projects', () => ({
  getBlogProjects: (...args: any[]) => mockGetBlogProjects(...args),
  getBlogProject: (...args: any[]) => mockGetBlogProject(...args),
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

describe('blogProjectQueryOptions', () => {
  it('uses a stable ["blog-projects", id] key reflecting the project id', () => {
    expect(blogProjectQueryOptions('p1').queryKey).toEqual(['blog-projects', 'p1'])
    expect(blogProjectQueryKey('p1')).toEqual(['blog-projects', 'p1'])
  })

  it('keys distinct projects separately so loader and hook share one entry per id', () => {
    expect(blogProjectQueryOptions('p1').queryKey).not.toEqual(
      blogProjectQueryOptions('p2').queryKey,
    )
  })

  it('nests under the list key so list mutations/invalidation also refresh the detail', () => {
    // ['blog-projects'] is a prefix of ['blog-projects', id], so
    // invalidateQueries({ queryKey: ['blog-projects'] }) matches the detail too.
    expect(blogProjectQueryOptions('p1').queryKey.slice(0, 1)).toEqual(BLOG_PROJECTS_QUERY_KEY)
  })

  it('sets the project default 30s staleTime', () => {
    expect(blogProjectQueryOptions('p1').staleTime).toBe(30 * 1000)
  })

  it('resolves the project via the getBlogProject api function with the id', async () => {
    const project = { id: 'p1' }
    mockGetBlogProject.mockResolvedValueOnce(project)

    const result = await blogProjectQueryOptions('p1').queryFn!({} as any)

    expect(mockGetBlogProject).toHaveBeenCalledWith('p1')
    expect(result).toEqual(project)
  })
})

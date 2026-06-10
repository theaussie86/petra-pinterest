import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/auth'
import {
  getBlogProjects,
  getBlogProject,
  createBlogProject,
  updateBlogProject,
  deleteBlogProject,
  checkProjectRelatedData,
} from './blog-projects'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildBlogProject, buildBlogProjectInsert } from '@/test/factories'

// Shared `from` mock so reads (via getSupabaseClient → supabase-iso) and
// mutations (via the browser `supabase` client) hit the same query builder.
// `mockGetSupabaseClient` is a spy so tests can assert RLS-gated reads resolve
// the caller's session through the isomorphic selector (SSR-auth, ADR 0003)
// rather than the session-less browser singleton.
const { mockFrom, mockGetSupabaseClient } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  return {
    mockFrom,
    mockGetSupabaseClient: vi.fn(() => ({ from: mockFrom })),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    storage: { from: vi.fn() },
  },
}))

// Reads use the isomorphic selector (ADR 0003). Mock it to return a client
// whose `from` is the shared mock above.
vi.mock('@/lib/supabase-iso', () => ({
  getSupabaseClient: mockGetSupabaseClient,
}))

vi.mock('@/lib/auth', () => ({
  ensureProfile: vi.fn().mockResolvedValue({ tenant_id: 'test-tenant-id' }),
}))

describe('getBlogProjects()', () => {
  it('fetches all projects ordered by created_at desc', async () => {
    const projects = [buildBlogProject()]
    const qb = createMockQueryBuilder({ data: projects })
    mockFrom.mockReturnValue(qb as any)

    const result = await getBlogProjects()

    expect(result).toEqual(projects)
    expect(mockFrom).toHaveBeenCalledWith('blog_projects')
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

describe('getBlogProject()', () => {
  it('fetches single project by id', async () => {
    const project = buildBlogProject({ id: 'proj-1' })
    const qb = createMockQueryBuilder({ data: project })
    mockFrom.mockReturnValue(qb as any)

    const result = await getBlogProject('proj-1')

    expect(result).toEqual(project)
    expect(qb.eq).toHaveBeenCalledWith('id', 'proj-1')
    expect(qb.single).toHaveBeenCalled()
  })

  // SSR-auth regression guard (issue #61, ADR 0003): the project-detail read is
  // prefetched in the route loader during SSR, so it must resolve the caller's
  // session through the isomorphic selector — not the session-less browser
  // `supabase` singleton, which would make RLS return zero rows and `.single()`
  // error/empty on first paint. Reverting this read to `supabase` directly
  // (so `getSupabaseClient` is never called) fails this test.
  it('reads via the isomorphic SSR client so RLS resolves the caller session', async () => {
    const project = buildBlogProject({ id: 'proj-1' })
    const qb = createMockQueryBuilder({ data: project })
    mockFrom.mockReturnValue(qb as any)

    await getBlogProject('proj-1')

    expect(mockGetSupabaseClient).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('blog_projects')
  })
})

describe('createBlogProject()', () => {
  it('checks auth, ensures profile, inserts with tenant_id', async () => {
    const input = buildBlogProjectInsert()
    const created = buildBlogProject()
    const qb = createMockQueryBuilder({ data: created })
    mockFrom.mockReturnValue(qb as any)

    const result = await createBlogProject(input)

    expect(supabase.auth.getUser).toHaveBeenCalled()
    expect(ensureProfile).toHaveBeenCalled()
    expect(qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'test-tenant-id' }),
    )
    expect(result).toEqual(created)
  })

  it('throws when not authenticated', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: null,
    } as any)

    await expect(createBlogProject(buildBlogProjectInsert())).rejects.toThrow(
      'Not authenticated',
    )
  })
})

describe('updateBlogProject()', () => {
  it('updates project and returns updated row', async () => {
    const updated = buildBlogProject({ name: 'Updated' })
    const qb = createMockQueryBuilder({ data: updated })
    mockFrom.mockReturnValue(qb as any)

    const result = await updateBlogProject({ id: 'proj-1', name: 'Updated' })

    expect(qb.update).toHaveBeenCalledWith({ name: 'Updated' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'proj-1')
    expect(result).toEqual(updated)
  })
})

describe('deleteBlogProject()', () => {
  it('deletes project by id', async () => {
    const qb = createMockQueryBuilder({ data: null })
    mockFrom.mockReturnValue(qb as any)

    await deleteBlogProject('proj-1')

    expect(qb.delete).toHaveBeenCalled()
    expect(qb.eq).toHaveBeenCalledWith('id', 'proj-1')
  })
})

describe('checkProjectRelatedData()', () => {
  it('returns article and pin counts', async () => {
    const articlesQb = createMockQueryBuilder({ count: 5 })
    const pinsQb = createMockQueryBuilder({ count: 12 })

    mockFrom.mockReturnValueOnce(articlesQb as any).mockReturnValueOnce(pinsQb as any)

    const result = await checkProjectRelatedData('proj-1')

    expect(result).toEqual({ articles: 5, pins: 12 })
  })

  it('returns 0 on query error (graceful degradation)', async () => {
    const articlesQb = createMockQueryBuilder({ error: { message: 'missing table' }, count: null })
    const pinsQb = createMockQueryBuilder({ error: { message: 'missing table' }, count: null })

    mockFrom.mockReturnValueOnce(articlesQb as any).mockReturnValueOnce(pinsQb as any)

    const result = await checkProjectRelatedData('proj-1')

    expect(result).toEqual({ articles: 0, pins: 0 })
  })
})

import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/auth'
import {
  getPinsByProject,
  getPinsByArticle,
  getAllPins,
  getPin,
  createPin,
  createPins,
  updatePin,
  deletePin,
  deletePins,
  updatePinStatus,
  updatePinsStatus,
  uploadPinMedia,
  getPinImageUrl,
} from './pins'
import { createMockQueryBuilder, createMockStorageBucket } from '@/test/mocks/supabase'
import { buildPin, buildPinInsert } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({
  ensureProfile: vi.fn().mockResolvedValue({ tenant_id: 'test-tenant-id' }),
}))

const mockFrom = vi.mocked(supabase.from)
const mockStorageFrom = vi.mocked(supabase.storage.from)

describe('getPinsByProject()', () => {
  it('queries pins filtered by project, ordered by created_at desc', async () => {
    const pins = [buildPin()]
    const qb = createMockQueryBuilder({ data: pins })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinsByProject('project-1')

    expect(result).toEqual(pins)
    expect(mockFrom).toHaveBeenCalledWith('pins')
    expect(qb.select).toHaveBeenCalledWith('*')
    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'project-1')
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('throws on error', async () => {
    const qb = createMockQueryBuilder({ error: { message: 'fail' } })
    mockFrom.mockReturnValue(qb as any)

    await expect(getPinsByProject('p-1')).rejects.toEqual({ message: 'fail' })
  })
})

describe('getPinsByArticle()', () => {
  it('queries pins filtered by article with dual ordering', async () => {
    const pins = [buildPin()]
    const qb = createMockQueryBuilder({ data: pins })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPinsByArticle('article-1')

    expect(result).toEqual(pins)
    expect(qb.eq).toHaveBeenCalledWith('blog_article_id', 'article-1')
    expect(qb.order).toHaveBeenCalledWith('scheduled_at', { ascending: false, nullsFirst: false })
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

describe('getAllPins()', () => {
  it('queries all pins with correct ordering', async () => {
    const pins = [buildPin(), buildPin()]
    const qb = createMockQueryBuilder({ data: pins })
    mockFrom.mockReturnValue(qb as any)

    const result = await getAllPins()

    expect(result).toEqual(pins)
    expect(qb.order).toHaveBeenCalledWith('scheduled_at', { ascending: true, nullsFirst: false })
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

describe('getPin()', () => {
  it('fetches a single pin by id', async () => {
    const pin = buildPin({ id: 'pin-42' })
    const qb = createMockQueryBuilder({ data: pin })
    mockFrom.mockReturnValue(qb as any)

    const result = await getPin('pin-42')

    expect(result).toEqual(pin)
    expect(qb.eq).toHaveBeenCalledWith('id', 'pin-42')
    expect(qb.single).toHaveBeenCalled()
  })
})

describe('createPin()', () => {
  it('calls ensureProfile, inserts with tenant_id, returns created pin', async () => {
    const input = buildPinInsert()
    const created = buildPin()
    const qb = createMockQueryBuilder({ data: created })
    mockFrom.mockReturnValue(qb as any)

    const result = await createPin(input)

    expect(ensureProfile).toHaveBeenCalled()
    expect(qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'test-tenant-id' }),
    )
    expect(qb.select).toHaveBeenCalled()
    expect(qb.single).toHaveBeenCalled()
    expect(result).toEqual(created)
  })
})

describe('createPins()', () => {
  it('bulk inserts pins with tenant_id on each', async () => {
    const inputs = [buildPinInsert(), buildPinInsert()]
    const created = [buildPin(), buildPin()]
    const qb = createMockQueryBuilder({ data: created })
    mockFrom.mockReturnValue(qb as any)

    const result = await createPins(inputs)

    expect(ensureProfile).toHaveBeenCalled()
    const insertArg = vi.mocked(qb.insert).mock.calls[0][0] as any[]
    expect(insertArg).toHaveLength(2)
    expect(insertArg[0]).toHaveProperty('tenant_id', 'test-tenant-id')
    expect(insertArg[1]).toHaveProperty('tenant_id', 'test-tenant-id')
    expect(result).toEqual(created)
  })
})

describe('updatePin()', () => {
  it('updates pin by id and returns updated row', async () => {
    const updated = buildPin({ title: 'New Title' })
    const qb = createMockQueryBuilder({ data: updated })
    mockFrom.mockReturnValue(qb as any)

    const result = await updatePin({ id: 'pin-1', title: 'New Title' })

    expect(qb.update).toHaveBeenCalledWith({ title: 'New Title' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'pin-1')
    expect(result).toEqual(updated)
  })
})

describe('deletePin()', () => {
  it('fetches image_path, removes from storage, then deletes row', async () => {
    const storageBucket = createMockStorageBucket()
    mockStorageFrom.mockReturnValue(storageBucket as any)

    // First call: fetch image_path
    const fetchQb = createMockQueryBuilder({ data: { image_path: 'tenant/img.png' } })
    // Second call: delete row
    const deleteQb = createMockQueryBuilder({ data: null })

    mockFrom.mockReturnValueOnce(fetchQb as any).mockReturnValueOnce(deleteQb as any)

    await deletePin('pin-1')

    expect(fetchQb.select).toHaveBeenCalledWith('image_path')
    expect(fetchQb.eq).toHaveBeenCalledWith('id', 'pin-1')
    expect(storageBucket.remove).toHaveBeenCalledWith(['tenant/img.png'])
    expect(deleteQb.delete).toHaveBeenCalled()
  })

  it('skips storage removal when image_path is null', async () => {
    const storageBucket = createMockStorageBucket()
    mockStorageFrom.mockReturnValue(storageBucket as any)

    const fetchQb = createMockQueryBuilder({ data: { image_path: null } })
    const deleteQb = createMockQueryBuilder({ data: null })

    mockFrom.mockReturnValueOnce(fetchQb as any).mockReturnValueOnce(deleteQb as any)

    await deletePin('pin-1')

    expect(storageBucket.remove).not.toHaveBeenCalled()
  })
})

describe('deletePins()', () => {
  it('fetches paths, removes from storage, then deletes rows', async () => {
    const storageBucket = createMockStorageBucket()
    mockStorageFrom.mockReturnValue(storageBucket as any)

    const fetchQb = createMockQueryBuilder({
      data: [{ image_path: 'a.png' }, { image_path: null }, { image_path: 'b.png' }],
    })
    const deleteQb = createMockQueryBuilder({ data: null })

    mockFrom.mockReturnValueOnce(fetchQb as any).mockReturnValueOnce(deleteQb as any)

    await deletePins(['p1', 'p2', 'p3'])

    expect(storageBucket.remove).toHaveBeenCalledWith(['a.png', 'b.png'])
    expect(deleteQb.delete).toHaveBeenCalled()
    expect(deleteQb.in).toHaveBeenCalledWith('id', ['p1', 'p2', 'p3'])
  })
})

describe('updatePinStatus()', () => {
  it('updates status for a single pin', async () => {
    const updated = buildPin({ status: 'published' })
    const qb = createMockQueryBuilder({ data: updated })
    mockFrom.mockReturnValue(qb as any)

    const result = await updatePinStatus('pin-1', 'published')

    expect(qb.update).toHaveBeenCalledWith({ status: 'published' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'pin-1')
    expect(result).toEqual(updated)
  })
})

describe('updatePinsStatus()', () => {
  it('bulk updates status for multiple pins', async () => {
    const qb = createMockQueryBuilder({ data: null })
    mockFrom.mockReturnValue(qb as any)

    await updatePinsStatus(['p1', 'p2'], 'draft')

    expect(qb.update).toHaveBeenCalledWith({ status: 'draft' })
    expect(qb.in).toHaveBeenCalledWith('id', ['p1', 'p2'])
  })
})

describe('uploadPinMedia()', () => {
  it('uploads file to storage and returns path', async () => {
    const storageBucket = createMockStorageBucket()
    mockStorageFrom.mockReturnValue(storageBucket as any)

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    const path = await uploadPinMedia(file, 'tenant-1')

    expect(mockStorageFrom).toHaveBeenCalledWith('pin-images')
    expect(storageBucket.upload).toHaveBeenCalledWith(expect.stringContaining('tenant-1/'), file)
    expect(path).toMatch(/^tenant-1\/.*\.jpg$/)
  })

  it('throws when upload fails', async () => {
    const storageBucket = createMockStorageBucket({ uploadError: { message: 'too large' } })
    mockStorageFrom.mockReturnValue(storageBucket as any)

    const file = new File(['data'], 'photo.png')

    await expect(uploadPinMedia(file, 't')).rejects.toEqual({ message: 'too large' })
  })
})

describe('getPinImageUrl()', () => {
  it('returns public URL for a path', () => {
    const storageBucket = createMockStorageBucket()
    mockStorageFrom.mockReturnValue(storageBucket as any)

    const url = getPinImageUrl('tenant/image.png')

    expect(mockStorageFrom).toHaveBeenCalledWith('pin-images')
    expect(url).toContain('tenant/image.png')
  })
})

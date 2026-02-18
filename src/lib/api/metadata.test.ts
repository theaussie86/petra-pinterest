import { supabase } from '@/lib/supabase'
import { getMetadataHistory, restoreMetadataGeneration } from './metadata'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import { buildMetadataGeneration } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
    auth: { getUser: vi.fn() },
  },
}))

const mockFrom = vi.mocked(supabase.from)

describe('getMetadataHistory()', () => {
  it('fetches last 3 generations for a pin ordered by newest first', async () => {
    const generations = [
      buildMetadataGeneration({ pin_id: 'pin-1' }),
      buildMetadataGeneration({ pin_id: 'pin-1' }),
    ]
    const qb = createMockQueryBuilder({ data: generations })
    mockFrom.mockReturnValue(qb as any)

    const result = await getMetadataHistory('pin-1')

    expect(result).toEqual(generations)
    expect(mockFrom).toHaveBeenCalledWith('pin_metadata_generations')
    expect(qb.eq).toHaveBeenCalledWith('pin_id', 'pin-1')
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(qb.limit).toHaveBeenCalledWith(3)
  })

  it('returns empty array when data is null', async () => {
    const qb = createMockQueryBuilder({ data: null })
    mockFrom.mockReturnValue(qb as any)

    const result = await getMetadataHistory('pin-1')

    expect(result).toEqual([])
  })
})

describe('restoreMetadataGeneration()', () => {
  it('fetches generation then updates pin with its metadata', async () => {
    const gen = buildMetadataGeneration({
      id: 'gen-1',
      title: 'Restored Title',
      description: 'Restored Desc',
      alt_text: 'Restored Alt',
    })
    // First call: fetch generation
    const fetchQb = createMockQueryBuilder({ data: gen })
    // Second call: update pin
    const updateQb = createMockQueryBuilder({ data: null })

    mockFrom.mockReturnValueOnce(fetchQb as any).mockReturnValueOnce(updateQb as any)

    await restoreMetadataGeneration('pin-1', 'gen-1')

    expect(fetchQb.eq).toHaveBeenCalledWith('id', 'gen-1')
    expect(fetchQb.single).toHaveBeenCalled()
    expect(updateQb.update).toHaveBeenCalledWith({
      title: 'Restored Title',
      description: 'Restored Desc',
      alt_text: 'Restored Alt',
    })
    expect(updateQb.eq).toHaveBeenCalledWith('id', 'pin-1')
  })

  it('throws when generation not found', async () => {
    const qb = createMockQueryBuilder({ data: null, error: { message: 'not found' } })
    mockFrom.mockReturnValue(qb as any)

    await expect(restoreMetadataGeneration('pin-1', 'bad-id')).rejects.toThrow(
      'Generation not found',
    )
  })
})

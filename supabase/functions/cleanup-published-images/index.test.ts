import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Behaviour test for the daily storage cleanup Edge function. Two independent
// steps run per invocation:
//   1. published pins whose image is 7+ days old (existing behaviour)
//   2. orphaned uploads in pin-images with no pin referencing them (#138)
//
// The module is a Deno Edge function: it calls `Deno.serve(handler)` at import
// time. We shim `Deno`, capture the handler, then drive it with a mocked
// service client (DB query builder + rpc + storage) and inspect the response.

const { capturedHandler, mockServiceClient, mockStorageRemove } = vi.hoisted(
  () => {
    const handler: { current: ((req: Request) => Promise<Response>) | null } = {
      current: null,
    }
    const env: Record<string, string> = {
      SUPABASE_URL: 'https://test.supabase.co',
    }
    ;(globalThis as any).Deno = {
      serve: (h: (req: Request) => Promise<Response>) => {
        handler.current = h
      },
      env: { get: (key: string) => env[key] },
    }
    const remove = vi.fn().mockResolvedValue({ error: null })
    return {
      capturedHandler: handler,
      mockStorageRemove: remove,
      mockServiceClient: {
        from: vi.fn(),
        rpc: vi.fn(),
        storage: { from: vi.fn(() => ({ remove })) },
      },
    }
  },
)

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => mockServiceClient,
}))

// Import for side effect: registers the handler via the shimmed Deno.serve.
import './index.ts'

beforeEach(() => {
  // mockReset (not clearAllMocks) so leftover mockReturnValueOnce / Once
  // implementations from a prior test don't leak into this one's queues.
  mockServiceClient.from.mockReset()
  mockServiceClient.rpc.mockReset()
  mockServiceClient.storage.from.mockReset()
  mockStorageRemove.mockReset()
  mockStorageRemove.mockResolvedValue({ error: null })
  mockServiceClient.storage.from.mockImplementation(() => ({ remove: mockStorageRemove }))
})

/** Configure the published-pins fetch + update step. */
function stubPublishedPins(pins: Array<{ id: string; image_path: string }>) {
  const fetchQb = createMockQueryBuilder({ data: pins })
  const updateQb = createMockQueryBuilder({ data: null })
  mockServiceClient.from
    .mockReturnValueOnce(fetchQb as any) // fetch published pins
    .mockReturnValueOnce(updateQb as any) // mark image_path null
}

async function run() {
  const response = await capturedHandler.current!(
    new Request('https://edge/cleanup-published-images', { method: 'POST' }),
  )
  return response.json()
}

describe('cleanup-published-images orphan cleanup (#138)', () => {
  it('removes orphaned uploads returned by the RPC and reports the count', async () => {
    stubPublishedPins([])
    mockServiceClient.rpc.mockResolvedValueOnce({
      data: ['tenant-a/old-1.png', 'tenant-a/old-2.jpg'],
      error: null,
    })

    const body = await run()

    expect(mockServiceClient.rpc).toHaveBeenCalledWith('list_orphaned_pin_images', {
      max_count: 100,
    })
    expect(mockServiceClient.storage.from).toHaveBeenCalledWith('pin-images')
    expect(mockStorageRemove).toHaveBeenCalledWith([
      'tenant-a/old-1.png',
      'tenant-a/old-2.jpg',
    ])
    expect(body).toMatchObject({
      success: true,
      orphans_cleaned: 2,
      orphans_failed: 0,
    })
  })

  it('does not call storage.remove when there are no orphans', async () => {
    stubPublishedPins([])
    mockServiceClient.rpc.mockResolvedValueOnce({ data: [], error: null })

    const body = await run()

    expect(mockStorageRemove).not.toHaveBeenCalled()
    expect(body).toMatchObject({ orphans_cleaned: 0, orphans_failed: 0 })
  })

  it('reports orphans_failed when the storage removal errors', async () => {
    stubPublishedPins([])
    mockServiceClient.rpc.mockResolvedValueOnce({
      data: ['tenant-a/old-1.png'],
      error: null,
    })
    mockStorageRemove.mockResolvedValueOnce({ error: { message: 'boom' } })

    const body = await run()

    expect(body).toMatchObject({
      success: true,
      orphans_cleaned: 0,
      orphans_failed: 1,
    })
  })

  it('runs the orphan step even if the RPC fails, and vice versa', async () => {
    stubPublishedPins([{ id: 'pin-1', image_path: 'tenant-a/pub-1.png' }])
    mockServiceClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc down' },
    })

    const body = await run()

    // Published-pins step still succeeds (it removed its own image).
    expect(mockStorageRemove).toHaveBeenCalledWith(['tenant-a/pub-1.png'])
    expect(body).toMatchObject({
      success: true,
      cleaned: 1,
      orphans_cleaned: 0,
      orphans_failed: 0,
    })
  })
})

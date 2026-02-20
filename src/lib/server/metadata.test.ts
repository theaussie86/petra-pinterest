import { generateMetadataFn, generateMetadataWithFeedbackFn, triggerBulkMetadataFn } from './metadata'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient, mockServiceClient, mockGenerateMetadata, mockGenerateWithFeedback, mockGetVaultKey } =
  vi.hoisted(() => ({
    mockServerClient: {
      from: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
    },
    mockServiceClient: {
      from: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
    mockGenerateMetadata: vi.fn().mockResolvedValue({
      title: 'Generated Title',
      description: 'Generated description',
      alt_text: 'Generated alt',
    }),
    mockGenerateWithFeedback: vi.fn().mockResolvedValue({
      title: 'Feedback Title',
      description: 'Feedback description',
      alt_text: 'Feedback alt',
    }),
    mockGetVaultKey: vi.fn().mockResolvedValue('test-gemini-api-key'),
  }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
  }),
}))

vi.mock('./supabase', () => ({
  getSupabaseServerClient: () => mockServerClient,
  getSupabaseServiceClient: () => mockServiceClient,
}))

vi.mock('@/lib/gemini/client', () => ({
  generatePinMetadata: (...args: any[]) => mockGenerateMetadata(...args),
  generatePinMetadataWithFeedback: (...args: any[]) => mockGenerateWithFeedback(...args),
}))

vi.mock('../../../server/lib/vault-helpers', () => ({
  getGeminiApiKeyFromVault: (...args: any[]) => mockGetVaultKey(...args),
}))

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
})

const mockPin = {
  id: 'pin-1',
  image_path: 'tenant/image.png',
  blog_articles: { title: 'Article Title', content: 'Article Content', blog_project_id: 'proj-1' },
}

describe('generateMetadataFn', () => {
  it('happy path: auth → fetch pin → Gemini → store generation → update pin → prune', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const pinFetchQb = createMockQueryBuilder({ data: mockPin })
    const insertGenQb = createMockQueryBuilder({ data: null })
    const updatePinQb = createMockQueryBuilder({ data: null })
    const pruneSelectQb = createMockQueryBuilder({ data: [{ id: 'g1' }, { id: 'g2' }] })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)      // profiles
      .mockReturnValueOnce(statusUpdateQb as any)  // pins - set generating_metadata
      .mockReturnValueOnce(pinFetchQb as any)      // pins - fetch pin + article
      .mockReturnValueOnce(insertGenQb as any)     // pin_metadata_generations - insert
      .mockReturnValueOnce(updatePinQb as any)     // pins - update with metadata
      .mockReturnValueOnce(pruneSelectQb as any)   // pin_metadata_generations - prune check

    const result = await generateMetadataFn({ data: { pin_id: 'pin-1' } })

    expect(result).toEqual({
      success: true,
      metadata: { title: 'Generated Title', description: 'Generated description', alt_text: 'Generated alt' },
    })

    // Verify status was set to generating_metadata
    expect(statusUpdateQb.update).toHaveBeenCalledWith({ status: 'generating_metadata' })

    // Verify Gemini was called with article content and image URL
    expect(mockGenerateMetadata).toHaveBeenCalledWith(
      'Article Title',
      'Article Content',
      'https://test.supabase.co/storage/v1/object/public/pin-images/tenant/image.png',
      undefined,
      'test-gemini-api-key',
      'image',
    )

    // Verify API key was fetched from vault
    expect(mockGetVaultKey).toHaveBeenCalledWith(mockServiceClient, 'proj-1')

    // Verify pin was updated with metadata and status
    expect(updatePinQb.update).toHaveBeenCalledWith({
      title: 'Generated Title',
      description: 'Generated description',
      alt_text: 'Generated alt',
      status: 'metadata_created',
    })
  })

  it('prunes old generations when more than 3 exist', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const pinFetchQb = createMockQueryBuilder({ data: mockPin })
    const insertGenQb = createMockQueryBuilder({ data: null })
    const updatePinQb = createMockQueryBuilder({ data: null })
    const pruneSelectQb = createMockQueryBuilder({
      data: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }],
    })
    const pruneDeleteQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
      .mockReturnValueOnce(pinFetchQb as any)
      .mockReturnValueOnce(insertGenQb as any)
      .mockReturnValueOnce(updatePinQb as any)
      .mockReturnValueOnce(pruneSelectQb as any)
      .mockReturnValueOnce(pruneDeleteQb as any)

    await generateMetadataFn({ data: { pin_id: 'pin-1' } })

    // Should delete generations not in the top 3
    expect(pruneDeleteQb.delete).toHaveBeenCalled()
    expect(pruneDeleteQb.not).toHaveBeenCalledWith('id', 'in', '(g1,g2,g3)')
  })

  it('sets error status on failure', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const pinFetchQb = createMockQueryBuilder({ data: null, error: { message: 'not found' } })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
      .mockReturnValueOnce(pinFetchQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow('Pin not found')

    expect(errorUpdateQb.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    )
  })
})

describe('generateMetadataWithFeedbackFn', () => {
  it('fetches previous generation, calls Gemini with feedback, stores new generation', async () => {
    const previousGen = {
      title: 'Old Title',
      description: 'Old desc',
      alt_text: 'Old alt',
    }

    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const prevGenQb = createMockQueryBuilder({ data: previousGen })
    const pinFetchQb = createMockQueryBuilder({ data: mockPin })
    const insertGenQb = createMockQueryBuilder({ data: null })
    const updatePinQb = createMockQueryBuilder({ data: null })
    const pruneSelectQb = createMockQueryBuilder({ data: [{ id: 'g1' }] })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
      .mockReturnValueOnce(prevGenQb as any)
      .mockReturnValueOnce(pinFetchQb as any)
      .mockReturnValueOnce(insertGenQb as any)
      .mockReturnValueOnce(updatePinQb as any)
      .mockReturnValueOnce(pruneSelectQb as any)

    const result = await generateMetadataWithFeedbackFn({
      data: { pin_id: 'pin-1', feedback: 'Make it more catchy' },
    })

    expect(result).toEqual({
      success: true,
      metadata: { title: 'Feedback Title', description: 'Feedback description', alt_text: 'Feedback alt' },
    })

    // Verify Gemini was called with previous metadata and feedback
    expect(mockGenerateWithFeedback).toHaveBeenCalledWith(
      'Article Title',
      'Article Content',
      expect.stringContaining('pin-images/tenant/image.png'),
      previousGen,
      'Make it more catchy',
      'test-gemini-api-key',
      'image',
    )

    // Verify new generation was stored with feedback text
    expect(insertGenQb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: 'Make it more catchy' }),
    )
  })

  it('throws when no previous generation exists', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const prevGenQb = createMockQueryBuilder({ data: null, error: { message: 'not found' } })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
      .mockReturnValueOnce(prevGenQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    await expect(
      generateMetadataWithFeedbackFn({ data: { pin_id: 'pin-1', feedback: 'test' } }),
    ).rejects.toThrow('No previous generation found')
  })
})

describe('triggerBulkMetadataFn', () => {
  it('updates all pins to generating_metadata and invokes edge functions', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)

    const result = await triggerBulkMetadataFn({
      data: { pin_ids: ['pin-1', 'pin-2', 'pin-3'] },
    })

    expect(result).toEqual({ success: true, pins_queued: 3 })
    expect(statusUpdateQb.update).toHaveBeenCalledWith({ status: 'generating_metadata' })
    expect(statusUpdateQb.in).toHaveBeenCalledWith('id', ['pin-1', 'pin-2', 'pin-3'])
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledTimes(3)
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledWith(
      'generate-metadata-single',
      expect.objectContaining({
        body: { pin_id: 'pin-1', tenant_id: 'test-tenant-id' },
      }),
    )
  })

  it('batches edge function calls in groups of 5', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const statusUpdateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)

    const pinIds = Array.from({ length: 7 }, (_, i) => `pin-${i}`)

    await triggerBulkMetadataFn({ data: { pin_ids: pinIds } })

    // 7 pins → 2 batches (5 + 2)
    expect(mockServiceClient.functions.invoke).toHaveBeenCalledTimes(7)
  })
})

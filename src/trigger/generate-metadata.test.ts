import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Use hoisted to define mocks that are accessed during module initialization
const { mockSupabase, mockGeneratePinMetadata, capturedTaskConfig } = vi.hoisted(() => {
  // Set env vars FIRST before any imports that use them
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SECRET_KEY = 'test-service-key'

  const taskConfig: { id: string; retry: { maxAttempts: number }; run: Function } | null = null
  return {
    mockSupabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
    mockGeneratePinMetadata: vi.fn(),
    capturedTaskConfig: { current: taskConfig },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('@/lib/gemini/client', () => ({
  generatePinMetadata: (...args: any[]) => mockGeneratePinMetadata(...args),
}))

vi.mock('@/lib/gemini/language', () => ({
  sanitizeLanguage: (lang: string | null) => lang,
}))

vi.mock('@/lib/gemini/prompts', () => ({
  buildPinterestSeoSystemPrompt: () => 'test-system-prompt',
}))

vi.mock('@trigger.dev/sdk/v3', () => ({
  task: (config: any) => {
    capturedTaskConfig.current = config
    return config
  },
}))

// Import after mocks - this triggers task() which captures config
import { generateMetadataTask } from './generate-metadata'

// Helper to run the task handler
const runTask = async (payload: { pin_id: string; tenant_id: string }) => {
  if (!capturedTaskConfig.current) throw new Error('Task not configured')
  return capturedTaskConfig.current.run(payload)
}

const mockPin = {
  id: 'pin-1',
  blog_project_id: 'proj-1',
  image_path: 'tenant/image.png',
  blog_articles: { title: 'Article Title', content: 'Article Content' },
}

const mockPinNoArticle = {
  id: 'pin-2',
  blog_project_id: 'proj-1',
  image_path: 'tenant/image.png',
  blog_articles: null,
}

const mockMetadata = {
  title: 'Generated Title',
  description: 'Generated description',
  alt_text: 'Generated alt text',
}

describe('generateMetadataTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeneratePinMetadata.mockResolvedValue(mockMetadata)
    mockSupabase.rpc.mockResolvedValue({ data: 'test-api-key', error: null })
  })

  describe('task configuration', () => {
    it('has correct task id', () => {
      expect(capturedTaskConfig.current?.id).toBe('generate-metadata')
    })

    it('has retry configuration with 3 max attempts', () => {
      expect(capturedTaskConfig.current?.retry).toEqual({ maxAttempts: 3 })
    })
  })

  describe('run()', () => {
    const payload = { pin_id: 'pin-1', tenant_id: 'tenant-1' }

    it('executes full happy path workflow', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: 'German', ai_context: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({ data: [{ id: 'g1' }, { id: 'g2' }] })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)  // pins - set generating_metadata
        .mockReturnValueOnce(pinFetchQb)      // pins - fetch
        .mockReturnValueOnce(projectQb)       // blog_projects
        .mockReturnValueOnce(insertGenQb)     // pin_metadata_generations - insert
        .mockReturnValueOnce(updatePinQb)     // pins - update with metadata
        .mockReturnValueOnce(pruneSelectQb)   // pin_metadata_generations - prune check

      const result = await runTask(payload)

      expect(result).toEqual({
        success: true,
        pin_id: 'pin-1',
        metadata: mockMetadata,
      })

      // Verify status was set to generating_metadata
      expect(statusUpdateQb.update).toHaveBeenCalledWith({ status: 'generating_metadata' })

      // Verify Gemini was called with correct parameters
      expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
        'Article Title',
        'Article Content',
        'https://test.supabase.co/storage/v1/object/public/pin-images/tenant/image.png',
        'test-system-prompt',
        'test-api-key',
        'image',
      )

      // Verify pin was updated with metadata and status
      expect(updatePinQb.update).toHaveBeenCalledWith({
        title: mockMetadata.title,
        description: mockMetadata.description,
        alt_text: mockMetadata.alt_text,
        status: 'metadata_created',
      })
    })

    it('constructs correct image URL from pin.image_path', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({ data: [] })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)

      await runTask(payload)

      expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'https://test.supabase.co/storage/v1/object/public/pin-images/tenant/image.png',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it('passes null article data when pin has no linked article', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPinNoArticle })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({ data: [] })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)

      await generateMetadataTask.run({ pin_id: 'pin-2', tenant_id: 'tenant-1' })

      expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
        null,
        null,
        expect.stringContaining('pin-images'),
        expect.anything(),
        'test-api-key',
        'image',
      )
    })

    it('detects video media type from file extension', async () => {
      const videoPin = { ...mockPin, image_path: 'tenant/video.mp4' }
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: videoPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({ data: [] })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)

      await runTask(payload)

      expect(mockGeneratePinMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'video', // Should detect video type
      )
    })

    it('retrieves API key from Supabase Vault', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({ data: [] })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)

      await runTask(payload)

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_gemini_api_key', {
        p_blog_project_id: 'proj-1',
      })
    })

    it('sets error status when Gemini fails with Unterminated string error', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const errorUpdateQb = createMockQueryBuilder({ data: null })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(errorUpdateQb) // Error handler update

      mockGeneratePinMetadata.mockRejectedValueOnce(
        new SyntaxError('Unterminated string in JSON at position 282')
      )

      await expect(runTask(payload)).rejects.toThrow('Unterminated string')

      expect(errorUpdateQb.update).toHaveBeenCalledWith({
        status: 'error',
        error_message: expect.stringContaining('Unterminated string'),
      })
    })

    it('sets error status when pin is not found', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: null, error: { message: 'not found' } })
      const errorUpdateQb = createMockQueryBuilder({ data: null })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(errorUpdateQb)

      await expect(runTask(payload)).rejects.toThrow('Pin not found')

      expect(errorUpdateQb.update).toHaveBeenCalledWith({
        status: 'error',
        error_message: expect.stringContaining('Pin not found'),
      })
    })

    it('sets error status when pin has no image', async () => {
      const noImagePin = { ...mockPin, image_path: null }
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: noImagePin })
      const errorUpdateQb = createMockQueryBuilder({ data: null })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(errorUpdateQb)

      await expect(runTask(payload)).rejects.toThrow('no image')

      expect(errorUpdateQb.update).toHaveBeenCalledWith({
        status: 'error',
        error_message: expect.stringContaining('no image'),
      })
    })

    it('sets error status when API key retrieval fails', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const errorUpdateQb = createMockQueryBuilder({ data: null })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(errorUpdateQb)

      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Key not found' },
      })

      await expect(runTask(payload)).rejects.toThrow('Gemini API key')

      expect(errorUpdateQb.update).toHaveBeenCalledWith({
        status: 'error',
        error_message: expect.stringContaining('Gemini API key'),
      })
    })

    it('prunes old generations keeping only last 3', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({
        data: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }, { id: 'g4' }, { id: 'g5' }],
      })
      const pruneDeleteQb = createMockQueryBuilder({ data: null })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)
        .mockReturnValueOnce(pruneDeleteQb)

      await runTask(payload)

      // Should delete generations not in the top 3
      expect(pruneDeleteQb.delete).toHaveBeenCalled()
      expect(pruneDeleteQb.not).toHaveBeenCalledWith('id', 'in', '(g1,g2,g3)')
    })

    it('does not delete generations when 3 or fewer exist', async () => {
      const statusUpdateQb = createMockQueryBuilder({ data: null })
      const pinFetchQb = createMockQueryBuilder({ data: mockPin })
      const projectQb = createMockQueryBuilder({ data: { language: null } })
      const insertGenQb = createMockQueryBuilder({ data: null })
      const updatePinQb = createMockQueryBuilder({ data: null })
      const pruneSelectQb = createMockQueryBuilder({
        data: [{ id: 'g1' }, { id: 'g2' }],
      })

      mockSupabase.from
        .mockReturnValueOnce(statusUpdateQb)
        .mockReturnValueOnce(pinFetchQb)
        .mockReturnValueOnce(projectQb)
        .mockReturnValueOnce(insertGenQb)
        .mockReturnValueOnce(updatePinQb)
        .mockReturnValueOnce(pruneSelectQb)

      await runTask(payload)

      // Should not call delete if <= 3 generations
      expect(mockSupabase.from).toHaveBeenCalledTimes(6) // No 7th call for delete
    })
  })
})

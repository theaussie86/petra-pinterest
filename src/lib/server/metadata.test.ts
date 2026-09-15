import { generateMetadataFn, generateMetadataWithFeedbackFn, triggerBulkMetadataFn, triggerAutoMetadataFn } from './metadata'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient, mockServiceClient, mockInvoke } = vi.hoisted(() => {
  const invoke = vi.fn()
  return {
    mockInvoke: invoke,
    mockServerClient: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
    },
    mockServiceClient: {
      functions: { invoke },
    },
  }
})

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

const METADATA = {
  title: 'Generated Title',
  description: 'Generated description',
  alt_text: 'Generated alt',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockServerClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id' } },
    error: null,
  })
  mockInvoke.mockResolvedValue({
    data: { success: true, pin_id: 'pin-1', metadata: METADATA },
    error: null,
  })
})

/** Wire the two RLS reads: profile (tenant) then pin-ownership check. */
function setupAuthPin(opts: { tenantId?: string; pinExists?: boolean } = {}) {
  const profileQb = createMockQueryBuilder({ data: { tenant_id: opts.tenantId ?? 'test-tenant-id' } })
  const pinQb =
    opts.pinExists === false
      ? createMockQueryBuilder({ data: null, error: { message: 'not found' } })
      : createMockQueryBuilder({ data: { id: 'pin-1' } })
  mockServerClient.from
    .mockReturnValueOnce(profileQb as any) // profiles
    .mockReturnValueOnce(pinQb as any) // pins - ownership check
  return { profileQb, pinQb }
}

describe('generateMetadataFn', () => {
  it('invokes the metadata Edge Function synchronously and returns the result', async () => {
    setupAuthPin()

    const result = await generateMetadataFn({ data: { pin_id: 'pin-1' } })

    expect(result).toEqual({ success: true, metadata: METADATA })
    expect(mockInvoke).toHaveBeenCalledWith('generate-metadata-single', {
      body: { pin_id: 'pin-1', tenant_id: 'test-tenant-id' },
    })
    // No feedback on the plain generate path
    expect(mockInvoke.mock.calls[0][1].body.feedback).toBeUndefined()
  })

  it('rejects a pin that does not belong to the caller (RLS returns nothing)', async () => {
    setupAuthPin({ pinExists: false })

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow('Pin not found')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow('Not authenticated')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('surfaces the Edge Function error message from the response body', async () => {
    setupAuthPin()
    mockInvoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: 'Gemini returned empty response' }) } },
    })

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow(
      'Gemini returned empty response',
    )
  })

  it('surfaces a plain error message when the Edge error has no JSON body', async () => {
    setupAuthPin()
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Edge Function returned a non-2xx status code') })

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow('non-2xx status code')
  })

  it('throws when the Edge Function reports success: false', async () => {
    setupAuthPin()
    mockInvoke.mockResolvedValue({ data: { success: false, error: 'Pin has no image' }, error: null })

    await expect(generateMetadataFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow('Pin has no image')
  })
})

describe('generateMetadataWithFeedbackFn', () => {
  it('passes the feedback through to the Edge Function and returns the refined metadata', async () => {
    setupAuthPin()
    const refined = { title: 'Feedback Title', description: 'Feedback description', alt_text: 'Feedback alt' }
    mockInvoke.mockResolvedValue({ data: { success: true, pin_id: 'pin-1', metadata: refined }, error: null })

    const result = await generateMetadataWithFeedbackFn({
      data: { pin_id: 'pin-1', feedback: 'Make it more catchy' },
    })

    expect(result).toEqual({ success: true, metadata: refined })
    expect(mockInvoke).toHaveBeenCalledWith('generate-metadata-single', {
      body: { pin_id: 'pin-1', tenant_id: 'test-tenant-id', feedback: 'Make it more catchy' },
    })
  })

  it('surfaces the Edge Function error in the feedback path', async () => {
    setupAuthPin()
    mockInvoke.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: 'No previous generation found for feedback' }) } },
    })

    await expect(
      generateMetadataWithFeedbackFn({ data: { pin_id: 'pin-1', feedback: 'x' } }),
    ).rejects.toThrow('No previous generation found for feedback')
  })
})

describe('triggerBulkMetadataFn', () => {
  it('enqueues the pins on the generate_metadata queue as the signed-in user', async () => {
    // The RPC de-duplicates, so the reported count comes from the database
    mockServerClient.rpc.mockResolvedValueOnce({ data: 2, error: null })

    const result = await triggerBulkMetadataFn({
      data: { pin_ids: ['pin-1', 'pin-2', 'pin-1'] },
    })

    expect(result).toEqual({ success: true, pins_queued: 2 })
    expect(mockServerClient.rpc).toHaveBeenCalledWith('enqueue_generate_metadata', {
      p_pin_ids: ['pin-1', 'pin-2', 'pin-1'],
    })
    expect(mockServiceClient.functions.invoke).not.toHaveBeenCalled()
  })

  it('fails when the pins cannot be enqueued', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Pin not found' } })

    await expect(
      triggerBulkMetadataFn({ data: { pin_ids: ['pin-1'] } }),
    ).rejects.toThrow('Pin not found')
  })
})

describe('triggerAutoMetadataFn', () => {
  it('enqueues the new pins on the generate_metadata queue', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({ data: 2, error: null })

    const result = await triggerAutoMetadataFn({ data: { pin_ids: ['pin-1', 'pin-2'] } })

    expect(result).toEqual({ success: true, pins_queued: 2 })
    expect(mockServerClient.rpc).toHaveBeenCalledWith('enqueue_generate_metadata', {
      p_pin_ids: ['pin-1', 'pin-2'],
    })
    // The RPC handles the status update; no manual pin write on the queue path.
    expect(mockServerClient.from).not.toHaveBeenCalled()
  })

  it('fails when the pins cannot be enqueued', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Pin not found' } })

    await expect(
      triggerAutoMetadataFn({ data: { pin_ids: ['pin-1'] } }),
    ).rejects.toThrow('Pin not found')
  })
})

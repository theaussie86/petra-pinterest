import { createMockQueryBuilder } from '@/test/mocks/supabase'

// Behaviour test for the scheduled (Edge-Cron) publish path. Mirrors the AI
// disclosure assertions of the manual path (src/lib/server/pinterest-publishing
// .test.ts) so both publish routes are verified at parity (PRD #36, US 9/10).
//
// The module under test is a Deno Edge function: it calls `Deno.serve(handler)`
// at import time and reads `Deno.env`. We shim `Deno` before the import runs,
// capture the handler, then drive it with a mocked Pinterest API and inspect the
// outgoing request body — no live API call. The `_shared` modules that reach the
// network (supabase client, notifications, pinterest-api) are mocked; the real
// `ai-disclosure.ts` and `cors.ts` run, since the disclosure mapping is exactly
// what we want to exercise end-to-end.

const { capturedHandler, mockCreatePinterestPin, mockServiceClient } = vi.hoisted(
  () => {
    const handler: { current: ((req: Request) => Promise<Response>) | null } = {
      current: null,
    }
    const env: Record<string, string> = {
      SUPABASE_URL: 'https://test.supabase.co',
    }
    // The Edge runtime injects `Deno`; provide just enough for the module.
    ;(globalThis as any).Deno = {
      serve: (h: (req: Request) => Promise<Response>) => {
        handler.current = h
      },
      env: { get: (key: string) => env[key] },
    }
    return {
      capturedHandler: handler,
      mockCreatePinterestPin: vi.fn().mockResolvedValue({ id: 'pinterest-pin-123' }),
      mockServiceClient: { from: vi.fn(), rpc: vi.fn() },
    }
  },
)

vi.mock('../_shared/supabase.ts', () => ({
  createServiceClient: () => mockServiceClient,
}))

vi.mock('../_shared/notifications.ts', () => ({
  notifyPinError: vi.fn(),
}))

vi.mock('../_shared/pinterest-api.ts', () => ({
  createPinterestPin: (...args: any[]) => mockCreatePinterestPin(...args),
  registerPinterestMedia: vi.fn(),
  uploadVideoToPinterestS3: vi.fn(),
  waitForPinterestMediaReady: vi.fn(),
}))

// Import for side effect: registers the handler via the shimmed Deno.serve.
import './index.ts'

function buildScheduledPin(overrides: Record<string, any> = {}) {
  return {
    id: 'pin-1',
    media_type: 'image',
    image_path: 'tenant/image.png',
    pinterest_board_id: 'board-123',
    title: 'Pin Title',
    description: 'Pin description',
    alt_text: 'Alt text for pin',
    alternate_url: null,
    blog_articles: { url: 'https://blog.com/post' },
    blog_projects: { pinterest_connection_id: 'conn-1' },
    ...overrides,
  }
}

/**
 * Run the cron handler for a single scheduled pin and return the payload that
 * was sent to the (mocked) Pinterest API.
 */
async function runCronForPin(pin: Record<string, any>) {
  const fetchQb = createMockQueryBuilder({ data: [pin] })
  const updateQb = createMockQueryBuilder({ data: null })

  mockServiceClient.from
    .mockReturnValueOnce(fetchQb as any) // fetch scheduled pins
    .mockReturnValueOnce(updateQb as any) // mark as published
  mockServiceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

  const response = await capturedHandler.current!(
    new Request('https://edge/publish-scheduled-pins', { method: 'POST' }),
  )
  const body = await response.json()
  expect(body).toMatchObject({ success: true, published: 1, failed: 0 })

  return mockCreatePinterestPin.mock.calls[0][1]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreatePinterestPin.mockResolvedValue({ id: 'pinterest-pin-123' })
})

describe('publish-scheduled-pins (Edge-Cron) AI disclosure', () => {
  it('sends ai_disclosures with AI_MODIFIED when ai_modified is set (default case)', async () => {
    const payload = await runCronForPin(
      buildScheduledPin({ ai_modified: true, synthetic_performer: false }),
    )

    expect(payload.ai_disclosures).toEqual({ values: ['AI_MODIFIED'] })
  })

  it('sends both disclosure values when synthetic_performer is set', async () => {
    const payload = await runCronForPin(
      buildScheduledPin({ ai_modified: true, synthetic_performer: true }),
    )

    expect(payload.ai_disclosures).toEqual({
      values: ['AI_MODIFIED', 'SYNTHETIC_PERFORMER'],
    })
  })

  it('omits ai_disclosures when both disclosure booleans are false', async () => {
    const payload = await runCronForPin(
      buildScheduledPin({ ai_modified: false, synthetic_performer: false }),
    )

    expect(payload.ai_disclosures).toBeUndefined()
  })
})

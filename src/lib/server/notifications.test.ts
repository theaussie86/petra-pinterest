/**
 * Tests for notification e-mail logic.
 *
 * Covered:
 * - resolveNotificationRecipient: project override + auth-email fallback + missing project/profile
 * - notifyPinError: throttle (no second mail when error_notified_at is set),
 *                   sets error_notified_at after a successful send,
 *                   never throws on Resend failures
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => sendMock(...args) },
  })),
}))

import { notifyPinError, resolveNotificationRecipient } from './notifications'

interface MockClient {
  from: ReturnType<typeof vi.fn>
  auth: { admin: { getUserById: ReturnType<typeof vi.fn> } }
}

function makeClient(): MockClient {
  return {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
  }
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'Pinfinity <noreply@test.dev>'
  process.env.APP_URL = 'https://test.app'
  sendMock.mockReset()
  sendMock.mockResolvedValue({ data: { id: 'mail-1' }, error: null })
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
})

describe('resolveNotificationRecipient', () => {
  it('uses notification_email override when set', async () => {
    const client = makeClient()
    client.from.mockReturnValueOnce(
      createMockQueryBuilder({
        data: {
          id: 'p1',
          name: 'Test Blog',
          tenant_id: 't1',
          notification_email: 'override@example.com',
        },
      }),
    )

    const result = await resolveNotificationRecipient(client as any, 'p1')

    expect(result).toEqual({
      email: 'override@example.com',
      projectName: 'Test Blog',
      projectId: 'p1',
    })
    // Should NOT have hit profiles or auth.admin
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.auth.admin.getUserById).not.toHaveBeenCalled()
  })

  it('falls back to tenant user auth e-mail when notification_email is null', async () => {
    const client = makeClient()
    client.from
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'p1',
            name: 'Test Blog',
            tenant_id: 't1',
            notification_email: null,
          },
        }),
      )
      .mockReturnValueOnce(
        createMockQueryBuilder({ data: [{ id: 'user-1' }] }),
      )

    client.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'login@example.com' } },
      error: null,
    })

    const result = await resolveNotificationRecipient(client as any, 'p1')

    expect(result).toEqual({
      email: 'login@example.com',
      projectName: 'Test Blog',
      projectId: 'p1',
    })
    expect(client.auth.admin.getUserById).toHaveBeenCalledWith('user-1')
  })

  it('returns null when project not found', async () => {
    const client = makeClient()
    client.from.mockReturnValueOnce(
      createMockQueryBuilder({ data: null, error: { message: 'not found' } }),
    )
    const result = await resolveNotificationRecipient(client as any, 'p1')
    expect(result).toBeNull()
  })

  it('returns null when no profile exists for the tenant', async () => {
    const client = makeClient()
    client.from
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'p1',
            name: 'Test Blog',
            tenant_id: 't1',
            notification_email: null,
          },
        }),
      )
      .mockReturnValueOnce(createMockQueryBuilder({ data: [] }))
    const result = await resolveNotificationRecipient(client as any, 'p1')
    expect(result).toBeNull()
  })
})

describe('notifyPinError', () => {
  it('throttles when error_notified_at is already set', async () => {
    const client = makeClient()
    // Pin lookup returns a pin with error_notified_at set
    client.from.mockReturnValueOnce(
      createMockQueryBuilder({
        data: {
          id: 'pin-1',
          title: 'My Pin',
          blog_project_id: 'p1',
          error_notified_at: '2026-01-01T00:00:00Z',
          blog_articles: null,
        },
      }),
    )

    await notifyPinError({
      supabase: client as any,
      pinId: 'pin-1',
      errorMessage: 'boom',
    })

    expect(sendMock).not.toHaveBeenCalled()
    // Only the pin SELECT — no recipient lookup, no UPDATE
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('sends mail and stamps error_notified_at on success', async () => {
    const client = makeClient()
    const updateBuilder = createMockQueryBuilder({ data: null })

    client.from
      // 1. Pin lookup
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'pin-1',
            title: 'Pin Title',
            blog_project_id: 'p1',
            error_notified_at: null,
            blog_articles: null,
          },
        }),
      )
      // 2. Project lookup (recipient resolution)
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'p1',
            name: 'Test Blog',
            tenant_id: 't1',
            notification_email: 'recipient@example.com',
          },
        }),
      )
      // 3. UPDATE pins SET error_notified_at
      .mockReturnValueOnce(updateBuilder)

    await notifyPinError({
      supabase: client as any,
      pinId: 'pin-1',
      errorMessage: 'kaboom',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    const sendArgs = sendMock.mock.calls[0][0]
    expect(sendArgs.to).toBe('recipient@example.com')
    expect(sendArgs.subject).toContain('Test Blog')
    expect(sendArgs.text).toContain('kaboom')
    expect(sendArgs.text).toContain('https://test.app/projects/p1/pins/pin-1')

    // The third .from() call must be the pins UPDATE
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ error_notified_at: expect.any(String) }),
    )
  })

  it('does not throw when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate limited' },
    })

    const client = makeClient()
    client.from
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'pin-1',
            title: 'Pin Title',
            blog_project_id: 'p1',
            error_notified_at: null,
            blog_articles: null,
          },
        }),
      )
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'p1',
            name: 'Test Blog',
            tenant_id: 't1',
            notification_email: 'recipient@example.com',
          },
        }),
      )

    await expect(
      notifyPinError({
        supabase: client as any,
        pinId: 'pin-1',
        errorMessage: 'kaboom',
      }),
    ).resolves.toBeUndefined()
  })

  it('skips when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY

    const client = makeClient()
    client.from
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'pin-1',
            title: 'Pin',
            blog_project_id: 'p1',
            error_notified_at: null,
            blog_articles: null,
          },
        }),
      )
      .mockReturnValueOnce(
        createMockQueryBuilder({
          data: {
            id: 'p1',
            name: 'Test Blog',
            tenant_id: 't1',
            notification_email: 'r@example.com',
          },
        }),
      )

    await notifyPinError({
      supabase: client as any,
      pinId: 'pin-1',
      errorMessage: 'boom',
    })

    expect(sendMock).not.toHaveBeenCalled()
  })
})

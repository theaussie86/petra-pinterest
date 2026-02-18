import {
  exchangePinterestCode,
  refreshPinterestToken,
  fetchPinterestUser,
  fetchPinterestBoards,
  createPinterestPin,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from './pinterest-api'

// Store original env
const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.PINTEREST_APP_ID = 'test-app-id'
  process.env.PINTEREST_APP_SECRET = 'test-app-secret'
  process.env.PINTEREST_REDIRECT_URI = 'http://localhost:3000/auth/pinterest/callback'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

// ─── exchangePinterestCode ───────────────────────────────────────

describe('exchangePinterestCode', () => {
  it('exchanges code for tokens', async () => {
    const tokenResponse = {
      access_token: 'acc-123',
      token_type: 'bearer',
      expires_in: 2592000,
      refresh_token: 'ref-456',
      scope: 'user_accounts:read',
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse), { status: 200 }),
    )

    const result = await exchangePinterestCode('auth-code', 'code-verifier')

    expect(result).toEqual(tokenResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws when env vars are missing', async () => {
    delete process.env.PINTEREST_APP_ID

    await expect(exchangePinterestCode('code', 'verifier')).rejects.toThrow(
      'Missing Pinterest OAuth credentials',
    )
  })

  it('throws with error_description from API', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error_description: 'Invalid code' }),
        { status: 400, statusText: 'Bad Request' },
      ),
    )

    await expect(exchangePinterestCode('bad-code', 'verifier')).rejects.toThrow(
      'Invalid code',
    )
  })

  it('throws with message from API when no error_description', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401, statusText: 'Unauthorized' },
      ),
    )

    await expect(exchangePinterestCode('code', 'verifier')).rejects.toThrow(
      'Unauthorized',
    )
  })

  it('throws generic error when response body is not JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(exchangePinterestCode('code', 'verifier')).rejects.toThrow(
      'Pinterest OAuth token exchange failed: 500',
    )
  })
})

// ─── refreshPinterestToken ───────────────────────────────────────

describe('refreshPinterestToken', () => {
  it('refreshes the token successfully', async () => {
    const tokenResponse = {
      access_token: 'new-acc',
      token_type: 'bearer',
      expires_in: 2592000,
      refresh_token: 'new-ref',
      scope: 'user_accounts:read',
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse), { status: 200 }),
    )

    const result = await refreshPinterestToken('old-refresh-token')
    expect(result).toEqual(tokenResponse)
  })

  it('throws when env vars are missing', async () => {
    delete process.env.PINTEREST_APP_SECRET

    await expect(refreshPinterestToken('token')).rejects.toThrow(
      'Missing Pinterest OAuth credentials',
    )
  })

  it('throws with error_description on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error_description: 'Token expired' }),
        { status: 401, statusText: 'Unauthorized' },
      ),
    )

    await expect(refreshPinterestToken('expired-token')).rejects.toThrow(
      'Token expired',
    )
  })

  it('throws with message on failure when no error_description', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: 'Bad refresh token' }),
        { status: 400, statusText: 'Bad Request' },
      ),
    )

    await expect(refreshPinterestToken('bad-token')).rejects.toThrow(
      'Bad refresh token',
    )
  })

  it('throws generic error when response body is not JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Error', { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(refreshPinterestToken('token')).rejects.toThrow(
      'Pinterest token refresh failed: 500',
    )
  })
})

// ─── fetchPinterestUser ──────────────────────────────────────────

describe('fetchPinterestUser', () => {
  it('fetches user account info', async () => {
    const user = { username: 'pinner', account_type: 'BUSINESS' }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(user), { status: 200 }),
    )

    const result = await fetchPinterestUser('access-token')
    expect(result).toEqual(user)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/user_account',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })

  it('throws on API error with JSON message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Token invalid' }), {
        status: 401,
        statusText: 'Unauthorized',
      }),
    )

    await expect(fetchPinterestUser('bad-token')).rejects.toThrow(
      'Token invalid',
    )
  })

  it('throws generic error when response body is not JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    )

    await expect(fetchPinterestUser('token')).rejects.toThrow(
      'Pinterest API error: 404',
    )
  })
})

// ─── fetchPinterestBoards ────────────────────────────────────────

describe('fetchPinterestBoards', () => {
  it('fetches boards without pagination', async () => {
    const boards = {
      items: [
        { id: 'b1', name: 'Board 1', description: '', privacy: 'PUBLIC', pin_count: 10 },
      ],
      bookmark: undefined,
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(boards), { status: 200 }),
    )

    const result = await fetchPinterestBoards('token')
    expect(result).toEqual(boards.items)
  })

  it('handles pagination with bookmark', async () => {
    const page1 = {
      items: [{ id: 'b1', name: 'Board 1', description: '', privacy: 'PUBLIC', pin_count: 5 }],
      bookmark: 'next-page',
    }
    const page2 = {
      items: [{ id: 'b2', name: 'Board 2', description: '', privacy: 'PUBLIC', pin_count: 3 }],
      bookmark: undefined,
    }

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }))

    const result = await fetchPinterestBoards('token')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('b1')
    expect(result[1].id).toBe('b2')

    // Second call should include bookmark param
    const secondCallUrl = (global.fetch as any).mock.calls[1][0] as string
    expect(secondCallUrl).toContain('bookmark=next-page')
  })
})

// ─── createPinterestPin ──────────────────────────────────────────

describe('createPinterestPin', () => {
  const payload = {
    board_id: 'board-1',
    title: 'Test Pin',
    media_source: { source_type: 'image_url' as const, url: 'https://img.com/pin.jpg' },
  }

  it('creates a pin successfully', async () => {
    const pinResponse = { id: 'pin-123', board_id: 'board-1', created_at: '2025-01-01', link: '', media: {} }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(pinResponse), { status: 200 }),
    )

    const result = await createPinterestPin('token', payload)
    expect(result).toEqual(pinResponse)
  })

  it('retries on 429 rate limit and succeeds', async () => {
    const pinResponse = { id: 'pin-123', board_id: 'board-1', created_at: '2025-01-01', link: '', media: {} }

    // Mock Math.random for deterministic jitter
    vi.spyOn(Math, 'random').mockReturnValue(0)

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '429 Too Many Requests' }), {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pinResponse), { status: 200 }),
      )

    const result = await createPinterestPin('token', payload)
    expect(result).toEqual(pinResponse)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries on persistent 429', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ message: '429 Too Many Requests' }), {
        status: 429,
        statusText: 'Too Many Requests',
      }),
    )

    const promise = createPinterestPin('token', payload)

    // Catch immediately to prevent unhandled rejection
    const caughtPromise = promise.catch(() => {})

    // Advance through all retry delays (2s + 4s + buffer)
    await vi.advanceTimersByTimeAsync(10000)
    await caughtPromise

    await expect(promise).rejects.toThrow(
      'rate limit exceeded after 3 retries',
    )
    expect(global.fetch).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it('throws immediately on non-429 errors', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        statusText: 'Forbidden',
      }),
    )

    await expect(createPinterestPin('token', payload)).rejects.toThrow('Forbidden')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

// ─── PKCE & State generators ────────────────────────────────────

describe('generateCodeVerifier', () => {
  it('returns a base64url string of expected length', () => {
    const verifier = generateCodeVerifier()
    expect(typeof verifier).toBe('string')
    expect(verifier.length).toBeGreaterThan(0)
    // 64 bytes in base64url = 86 chars
    expect(verifier.length).toBe(86)
  })
})

describe('generateCodeChallenge', () => {
  it('returns a base64url SHA-256 hash of the verifier', async () => {
    const verifier = 'test-verifier'
    const challenge = await generateCodeChallenge(verifier)
    expect(typeof challenge).toBe('string')
    expect(challenge.length).toBeGreaterThan(0)
    // SHA-256 = 32 bytes = 43 base64url chars
    expect(challenge.length).toBe(43)
  })

  it('produces deterministic output', async () => {
    const a = await generateCodeChallenge('same-input')
    const b = await generateCodeChallenge('same-input')
    expect(a).toBe(b)
  })
})

describe('generateState', () => {
  it('returns a base64url string', () => {
    const state = generateState()
    expect(typeof state).toBe('string')
    // 32 bytes in base64url = 43 chars
    expect(state.length).toBe(43)
  })

  it('produces unique values', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
  })
})

import crypto from 'node:crypto'
import type {
  PinterestTokenResponse,
  PinterestUserResponse,
  PinterestBoardResponse,
  PinterestBoardsListResponse,
  PinterestPinResponse,
  PinterestCreatePinPayload,
  PinterestMediaRegisterResponse,
  PinterestMediaStatusResponse,
} from '@/types/pinterest'

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5'

/**
 * Generic Pinterest API fetch wrapper with Bearer auth
 */
async function pinterestFetch<T>(
  endpoint: string,
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${PINTEREST_API_BASE}${endpoint}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }

  // Add Content-Type for non-GET requests
  if (options?.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Pinterest API error: ${response.status} ${response.statusText}`
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.message) {
        errorMessage = `Pinterest API error: ${errorJson.message}`
      }
    } catch {
      // Use default error message if JSON parse fails
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<T>
}

/**
 * Exchange authorization code for access + refresh tokens (OAuth step 2)
 */
export async function exchangePinterestCode(
  code: string,
  codeVerifier: string,
): Promise<PinterestTokenResponse> {
  const appId = process.env.PINTEREST_APP_ID
  const appSecret = process.env.PINTEREST_APP_SECRET
  const redirectUri = process.env.PINTEREST_REDIRECT_URI

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      'Missing Pinterest OAuth credentials in environment variables',
    )
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const response = await fetch(`${PINTEREST_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Pinterest OAuth token exchange failed: ${response.status} ${response.statusText}`
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.error_description) {
        errorMessage = `Pinterest OAuth error: ${errorJson.error_description}`
      } else if (errorJson.message) {
        errorMessage = `Pinterest OAuth error: ${errorJson.message}`
      }
    } catch {
      // Use default error message if JSON parse fails
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<PinterestTokenResponse>
}

/**
 * Refresh access token using refresh token (OAuth step 3)
 */
export async function refreshPinterestToken(
  refreshToken: string,
): Promise<PinterestTokenResponse> {
  const appId = process.env.PINTEREST_APP_ID
  const appSecret = process.env.PINTEREST_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error(
      'Missing Pinterest OAuth credentials in environment variables',
    )
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const response = await fetch(`${PINTEREST_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Pinterest token refresh failed: ${response.status} ${response.statusText}`
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.error_description) {
        errorMessage = `Pinterest OAuth error: ${errorJson.error_description}`
      } else if (errorJson.message) {
        errorMessage = `Pinterest OAuth error: ${errorJson.message}`
      }
    } catch {
      // Use default error message if JSON parse fails
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<PinterestTokenResponse>
}

/**
 * Fetch Pinterest user account information
 */
export async function fetchPinterestUser(
  accessToken: string,
): Promise<PinterestUserResponse> {
  return pinterestFetch<PinterestUserResponse>(
    '/user_account',
    accessToken,
    { method: 'GET' },
  )
}

/**
 * Fetch all Pinterest boards (handles pagination)
 */
export async function fetchPinterestBoards(
  accessToken: string,
): Promise<PinterestBoardResponse[]> {
  const allBoards: PinterestBoardResponse[] = []
  let bookmark: string | undefined = undefined

  do {
    const params = new URLSearchParams({ page_size: '100' })
    if (bookmark) {
      params.set('bookmark', bookmark)
    }

    const response = await pinterestFetch<PinterestBoardsListResponse>(
      `/boards?${params.toString()}`,
      accessToken,
      { method: 'GET' },
    )

    allBoards.push(...response.items)
    bookmark = response.bookmark
  } while (bookmark)

  return allBoards
}

/**
 * Create a Pinterest pin (handles rate limiting with retries)
 */
export async function createPinterestPin(
  accessToken: string,
  payload: PinterestCreatePinPayload,
): Promise<PinterestPinResponse> {
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      return await pinterestFetch<PinterestPinResponse>('/pins', accessToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } catch (error) {
      // Check if it's a rate limit error (429)
      if (
        error instanceof Error &&
        error.message.includes('429')
      ) {
        attempt++
        if (attempt >= maxRetries) {
          throw new Error(
            `Pinterest rate limit exceeded after ${maxRetries} retries`,
          )
        }

        // Exponential backoff with jitter: 2^attempt * 1000ms + random(0-1000ms)
        const baseDelay = Math.pow(2, attempt) * 1000
        const jitter = Math.random() * 1000
        const delay = baseDelay + jitter

        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // Not a rate limit error, re-throw
      throw error
    }
  }

  // Should never reach here, but TypeScript needs this
  throw new Error('Unexpected error in createPinterestPin')
}

/**
 * Register a video upload with Pinterest (step 1 of the video publish flow).
 *
 * Returns a one-time-use `media_id` plus the signed S3 URL and parameters
 * needed to upload the actual video bytes. The upload parameters include
 * short-lived AWS credentials — the upload must happen within a few minutes.
 */
export async function registerPinterestMedia(
  accessToken: string,
): Promise<PinterestMediaRegisterResponse> {
  return pinterestFetch<PinterestMediaRegisterResponse>('/media', accessToken, {
    method: 'POST',
    body: JSON.stringify({ media_type: 'video' }),
  })
}

/**
 * Upload video bytes to Pinterest's S3 bucket (step 2 of the video publish flow).
 *
 * Pinterest returns a signed POST policy in `upload_parameters` that we must
 * send as multipart/form-data to `upload_url`. All key/value pairs from
 * `upload_parameters` go first, then the file itself as the `file` field —
 * S3 signed POST requires this exact field order.
 */
export async function uploadVideoToPinterestS3(
  register: PinterestMediaRegisterResponse,
  videoBytes: Uint8Array,
  filename: string,
  contentType = 'video/mp4',
): Promise<void> {
  const form = new FormData()

  // Append signed-POST parameters first (order matters for S3)
  for (const [key, value] of Object.entries(register.upload_parameters)) {
    form.append(key, value)
  }

  // The `file` field must come last and must contain the raw bytes.
  const blob = new Blob([videoBytes as BlobPart], { type: contentType })
  form.append('file', blob, filename)

  const response = await fetch(register.upload_url, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Pinterest S3 upload failed: ${response.status} ${response.statusText}${
        errorText ? ` — ${errorText.slice(0, 300)}` : ''
      }`,
    )
  }
}

/**
 * Get the processing status of a registered Pinterest media upload (step 3).
 */
export async function getPinterestMediaStatus(
  accessToken: string,
  mediaId: string,
): Promise<PinterestMediaStatusResponse> {
  return pinterestFetch<PinterestMediaStatusResponse>(
    `/media/${encodeURIComponent(mediaId)}`,
    accessToken,
    { method: 'GET' },
  )
}

/**
 * Poll GET /v5/media/{id} until Pinterest reports the upload as `succeeded`.
 *
 * Throws if the status becomes `failed` or if the poll loop exceeds the
 * timeout. Backoff steps (in milliseconds): 5s, 10s, 15s, 30s, 30s, 30s, ...
 * Total default timeout: 5 minutes, which covers realistic MP4 processing
 * times for pin-sized clips (<= ~50 MB).
 */
export async function waitForPinterestMediaReady(
  accessToken: string,
  mediaId: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PinterestMediaStatusResponse> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000
  const deadline = Date.now() + timeoutMs
  const backoffSequenceMs = [5_000, 10_000, 15_000, 30_000]
  let step = 0

  while (true) {
    if (options.signal?.aborted) {
      throw new Error('waitForPinterestMediaReady aborted')
    }

    const status = await getPinterestMediaStatus(accessToken, mediaId)

    if (status.status === 'succeeded') {
      return status
    }
    if (status.status === 'failed') {
      throw new Error(`Pinterest media upload failed for media_id=${mediaId}`)
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Pinterest media upload did not reach 'succeeded' within ${timeoutMs}ms (last status: ${status.status})`,
      )
    }

    const delay = backoffSequenceMs[Math.min(step, backoffSequenceMs.length - 1)]!
    step++
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

/**
 * Generate a PKCE code verifier (random 64-byte base64url string)
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url')
}

/**
 * Generate a PKCE code challenge (SHA-256 hash of verifier, base64url encoded)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return hash.toString('base64url')
}

/**
 * Generate a random OAuth state parameter (32-byte base64url string)
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}

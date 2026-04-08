const PINTEREST_API_BASE = 'https://api.pinterest.com/v5'

// --- Types ---

interface PinterestTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}

interface PinterestPinResponse {
  id: string
  link?: string
  title?: string
  description?: string
  board_id?: string
  created_at?: string
}

type PinterestMediaSource =
  | { source_type: 'image_url'; url: string }
  | {
      source_type: 'video_id'
      media_id: string
      cover_image_url?: string
      cover_image_content_type?: 'image/jpeg' | 'image/png'
      cover_image_data?: string
      cover_image_key_frame_time?: number
      is_standard?: boolean
    }

interface PinterestCreatePinPayload {
  board_id: string
  media_source: PinterestMediaSource
  title?: string
  description?: string
  alt_text?: string
  link?: string
}

interface PinterestMediaRegisterResponse {
  media_id: string
  media_type: 'video'
  upload_url: string
  upload_parameters: Record<string, string>
}

interface PinterestMediaStatusResponse {
  media_id: string
  media_type: 'video'
  status: 'registered' | 'processing' | 'succeeded' | 'failed'
}

export type {
  PinterestTokenResponse,
  PinterestPinResponse,
  PinterestCreatePinPayload,
  PinterestMediaSource,
  PinterestMediaRegisterResponse,
  PinterestMediaStatusResponse,
}

/**
 * Generic Pinterest API fetch wrapper with Bearer auth
 */
async function pinterestFetch<T>(
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const url = `${PINTEREST_API_BASE}${endpoint}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }

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
      // Use default error message
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<T>
}

/**
 * Create a Pinterest pin (handles rate limiting with retries)
 */
export async function createPinterestPin(
  accessToken: string,
  payload: PinterestCreatePinPayload
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
      if (error instanceof Error && error.message.includes('429')) {
        attempt++
        if (attempt >= maxRetries) {
          throw new Error(
            `Pinterest rate limit exceeded after ${maxRetries} retries`
          )
        }

        const baseDelay = Math.pow(2, attempt) * 1000
        const jitter = Math.random() * 1000
        await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter))
        continue
      }

      throw error
    }
  }

  throw new Error('Unexpected error in createPinterestPin')
}

/**
 * Register a video upload with Pinterest (step 1 of the video publish flow).
 *
 * Returns a one-time-use `media_id` plus the signed S3 URL and parameters
 * needed to upload the actual video bytes.
 */
export async function registerPinterestMedia(
  accessToken: string
): Promise<PinterestMediaRegisterResponse> {
  return pinterestFetch<PinterestMediaRegisterResponse>('/media', accessToken, {
    method: 'POST',
    body: JSON.stringify({ media_type: 'video' }),
  })
}

/**
 * Upload video bytes to Pinterest's S3 bucket (step 2 of the video publish flow).
 *
 * The signed-POST parameters must be appended first, followed by the `file`
 * field containing the raw bytes — S3 requires this field order.
 */
export async function uploadVideoToPinterestS3(
  register: PinterestMediaRegisterResponse,
  videoBytes: Uint8Array,
  filename: string,
  contentType = 'video/mp4'
): Promise<void> {
  const form = new FormData()

  for (const [key, value] of Object.entries(register.upload_parameters)) {
    form.append(key, value)
  }

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
      }`
    )
  }
}

/**
 * Get the processing status of a registered Pinterest media upload.
 */
export async function getPinterestMediaStatus(
  accessToken: string,
  mediaId: string
): Promise<PinterestMediaStatusResponse> {
  return pinterestFetch<PinterestMediaStatusResponse>(
    `/media/${encodeURIComponent(mediaId)}`,
    accessToken,
    { method: 'GET' }
  )
}

/**
 * Poll GET /v5/media/{id} until Pinterest reports the upload as `succeeded`.
 * Backoff: 5s, 10s, 15s, 30s, 30s, ...  Default timeout: 5 minutes.
 */
export async function waitForPinterestMediaReady(
  accessToken: string,
  mediaId: string,
  options: { timeoutMs?: number } = {}
): Promise<PinterestMediaStatusResponse> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000
  const deadline = Date.now() + timeoutMs
  const backoffSequenceMs = [5_000, 10_000, 15_000, 30_000]
  let step = 0

  while (true) {
    const status = await getPinterestMediaStatus(accessToken, mediaId)

    if (status.status === 'succeeded') {
      return status
    }
    if (status.status === 'failed') {
      throw new Error(`Pinterest media upload failed for media_id=${mediaId}`)
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Pinterest media upload did not reach 'succeeded' within ${timeoutMs}ms (last status: ${status.status})`
      )
    }

    const delay = backoffSequenceMs[Math.min(step, backoffSequenceMs.length - 1)]!
    step++
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

/**
 * Refresh access token using refresh token.
 * Uses Deno-compatible btoa() instead of Node.js Buffer.
 */
export async function refreshPinterestToken(
  refreshToken: string
): Promise<PinterestTokenResponse> {
  const appId = Deno.env.get('PINTEREST_APP_ID')
  const appSecret = Deno.env.get('PINTEREST_APP_SECRET')

  if (!appId || !appSecret) {
    throw new Error(
      'Missing Pinterest OAuth credentials in environment variables'
    )
  }

  // Deno-compatible base64 encoding
  const basicAuth = btoa(`${appId}:${appSecret}`)

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
      // Use default error message
    }
    throw new Error(errorMessage)
  }

  return response.json() as Promise<PinterestTokenResponse>
}

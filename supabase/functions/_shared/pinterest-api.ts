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

interface PinterestCreatePinPayload {
  board_id: string
  media_source: {
    source_type: 'image_url'
    url: string
  }
  title?: string
  description?: string
  alt_text?: string
  link?: string
}

export type {
  PinterestTokenResponse,
  PinterestPinResponse,
  PinterestCreatePinPayload,
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

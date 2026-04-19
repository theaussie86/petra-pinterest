/**
 * Deno client for the external ffmpeg-Docker-API service.
 *
 * Mirror of `src/lib/server/ffmpeg-client.ts` — Deno edge functions cannot
 * import from the Node-side codebase, so the client is duplicated here and
 * must be kept in sync. See that file for the full interface spec.
 *
 * Reads config from Deno.env:
 *   FFMPEG_SERVER_URL   — base URL of the ffmpeg service
 *   FFMPEG_SERVER_TOKEN — bearer token
 */

export interface KeyframeOptions {
  second?: number
  format?: 'jpeg' | 'png'
  quality?: number
}

export interface KeyframeResult {
  bytes: Uint8Array
  contentType: 'image/jpeg' | 'image/png'
}

function getFfmpegConfig(): { baseUrl: string; token: string } {
  const baseUrl = Deno.env.get('FFMPEG_SERVER_URL')
  const token = Deno.env.get('FFMPEG_SERVER_TOKEN')
  if (!baseUrl) {
    throw new Error('FFMPEG_SERVER_URL is not configured')
  }
  if (!token) {
    throw new Error('FFMPEG_SERVER_TOKEN is not configured')
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), token }
}

/**
 * Ask the ffmpeg server to extract a single frame from `videoUrl` at the
 * given timestamp and return the image bytes.
 */
export async function extractKeyframe(
  videoUrl: string,
  options: KeyframeOptions = {}
): Promise<KeyframeResult> {
  const { baseUrl, token } = getFfmpegConfig()
  const second = options.second ?? 1
  const format = options.format ?? 'jpeg'
  const body: Record<string, unknown> = {
    url: videoUrl,
    second,
    format,
  }
  if (options.quality !== undefined) {
    body.quality = options.quality
  }

  const response = await fetch(`${baseUrl}/thumbnail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: format === 'png' ? 'image/png' : 'image/jpeg',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const errJson = (await response.json()) as {
        error?: { code?: string; message?: string }
      }
      if (errJson?.error?.message) {
        detail = `${errJson.error.code ?? 'error'}: ${errJson.error.message}`
      }
    } catch {
      // Body wasn't JSON — keep the status line as detail.
    }
    throw new Error(`ffmpeg server /thumbnail failed — ${detail}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `ffmpeg server returned unexpected Content-Type: ${contentType || '(none)'}`
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType: contentType.startsWith('image/png') ? 'image/png' : 'image/jpeg',
  }
}

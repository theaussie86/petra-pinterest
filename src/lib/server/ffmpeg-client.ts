/**
 * Client for the external ffmpeg-Docker-API service.
 *
 * Used by the video publish flow to extract a cover thumbnail from a video
 * at a specific second when the user did not upload a manual cover image,
 * and by the AI metadata generation flow to provide Gemini with a frame from
 * a video pin.
 *
 * The service exposes `POST /thumbnail` (added in the `feat/thumbnail-endpoint`
 * branch of theaussie86/ffmpeg-Docker-API). Interface spec:
 *
 *   Request:
 *     POST ${FFMPEG_SERVER_URL}/thumbnail
 *     Authorization: Bearer ${FFMPEG_SERVER_TOKEN}
 *     Content-Type: application/json
 *     Body: { "url": string, "second"?: number, "format"?: "jpeg"|"png", "quality"?: number }
 *
 *   Response (success):
 *     200 OK, body = raw image bytes, Content-Type: image/jpeg | image/png
 *
 *   Response (failure):
 *     400/413/422 with JSON envelope:
 *     { success: false, error: { code, message, correlationId } }
 */

export interface KeyframeOptions {
  /** Timestamp in seconds (default: 1) */
  second?: number
  /** Output image format (default: 'jpeg') */
  format?: 'jpeg' | 'png'
  /** JPEG quality 2-31, lower = better (default: 3) */
  quality?: number
}

export interface KeyframeResult {
  bytes: Uint8Array
  contentType: 'image/jpeg' | 'image/png'
}

function getFfmpegConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.FFMPEG_SERVER_URL
  const token = process.env.FFMPEG_SERVER_TOKEN
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
 *
 * Throws a descriptive error with the server's error code/message on failure.
 */
export async function extractKeyframe(
  videoUrl: string,
  options: KeyframeOptions = {},
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
      `ffmpeg server returned unexpected Content-Type: ${contentType || '(none)'}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType: contentType.startsWith('image/png') ? 'image/png' : 'image/jpeg',
  }
}

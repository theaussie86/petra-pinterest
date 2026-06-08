/**
 * Image bytes helper (ADR 0002 / PRD #40).
 *
 * Images are fetched by our code and passed to the provider as raw bytes
 * (a `Uint8Array` part), never as URLs — this keeps private/signed Supabase
 * storage URLs reachable and makes the video ffmpeg-keyframe path identical.
 * Not exercised by article extraction, but it belongs to the foundation.
 */

export interface ImageBytes {
  bytes: Uint8Array
  mimeType: string
}

/**
 * Fetch an image URL and return its raw bytes plus mime type.
 * Falls back to `image/jpeg` when the response carries no content-type header.
 *
 * @throws if the response is not OK.
 */
export async function fetchImageBytes(url: string): Promise<ImageBytes> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const mimeType = response.headers.get('content-type') || 'image/jpeg'
  return { bytes, mimeType }
}

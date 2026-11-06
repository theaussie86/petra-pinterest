/**
 * Diagnostic for how MCP hosts hand over images. Reads the raw JSON-RPC body
 * before the SDK validates it, so a shape the schema rejects (e.g. ChatGPT's
 * `"chat_upload"` string) is still recorded.
 *
 * Never logs signed URLs (http/https values are reduced to their origin), tokens
 * or pin metadata: only shapes, lengths and short previews.
 */

/** Tools whose image arguments are worth recording. */
const IMAGE_TOOLS = new Set(['create_pin', 'request_pin_upload'])

const IMAGE_SOURCES = ['image_url', 'upload_path', 'image_file', 'image_base64'] as const

const PREVIEW_LENGTH = 32
const USER_AGENT_LENGTH = 120

type ValueShape =
  | { type: 'absent' | 'null' | 'boolean' | 'number' }
  | { type: 'string'; length: number; preview: string }
  | { type: 'array'; length: number; first?: ValueShape }
  | {
      type: 'object'
      keys: string[]
      download_url?: ValueShape
      mime_type?: ValueShape
    }

export interface ImageIntakeRecord {
  tool: string
  paramKeys: string[]
  argKeys: string[]
  sources: Record<(typeof IMAGE_SOURCES)[number], ValueShape>
  metaKeys: string[]
  metaFileParams: ValueShape
  hostUserAgent: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeValue(value: unknown): ValueShape {
  if (value === undefined) return { type: 'absent' }
  if (value === null) return { type: 'null' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return { type: 'number' }
  if (typeof value === 'string') {
    return { type: 'string', length: value.length, preview: previewString(value) }
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      ...(value.length > 0 ? { first: describeValue(value[0]) } : {}),
    }
  }
  if (isRecord(value)) {
    return {
      type: 'object',
      keys: Object.keys(value),
      ...('download_url' in value ? { download_url: describeValue(value.download_url) } : {}),
      ...('mime_type' in value ? { mime_type: describeValue(value.mime_type) } : {}),
    }
  }
  return { type: 'absent' }
}

/** An http(s) URL shrinks to its origin, which drops signatures in path and query. */
function previewString(value: string): string {
  if (/^https?:/i.test(value)) {
    try {
      return new URL(value).origin
    } catch {
      return 'invalid-http-url'
    }
  }
  return value.slice(0, PREVIEW_LENGTH)
}

/** One record per image-tool call in a JSON-RPC message or batch. */
export function describeImageIntake(body: unknown): ImageIntakeRecord[] {
  const messages = Array.isArray(body) ? body : [body]
  const records: ImageIntakeRecord[] = []

  for (const message of messages) {
    if (!isRecord(message) || message.method !== 'tools/call') continue
    const params = message.params
    if (!isRecord(params) || typeof params.name !== 'string') continue
    if (!IMAGE_TOOLS.has(params.name)) continue

    const args = isRecord(params.arguments) ? params.arguments : {}
    const meta = isRecord(params._meta) ? params._meta : {}
    const hostUserAgent = meta['openai/userAgent']

    records.push({
      tool: params.name,
      paramKeys: Object.keys(params),
      argKeys: Object.keys(args),
      sources: {
        image_url: describeValue(args.image_url),
        upload_path: describeValue(args.upload_path),
        image_file: describeValue(args.image_file),
        image_base64: describeValue(args.image_base64),
      },
      metaKeys: Object.keys(meta),
      metaFileParams: describeValue(meta['openai/fileParams']),
      hostUserAgent:
        typeof hostUserAgent === 'string' ? hostUserAgent.slice(0, USER_AGENT_LENGTH) : null,
    })
  }

  return records
}

/**
 * Logs the image intake of an authenticated request. Works on a clone, and a
 * failure here must never affect the tool call itself.
 */
export async function logImageIntake(
  request: Request,
  oauthClientId: string | null,
): Promise<void> {
  try {
    const records = describeImageIntake(await request.clone().json())
    const clientUserAgent = request.headers.get('user-agent')?.slice(0, USER_AGENT_LENGTH) ?? null
    for (const record of records) {
      console.info(
        '[mcp] image_intake',
        JSON.stringify({ ...record, oauthClientId, clientUserAgent }),
      )
    }
  } catch {
    // An unparseable body is answered by the SDK transport.
  }
}

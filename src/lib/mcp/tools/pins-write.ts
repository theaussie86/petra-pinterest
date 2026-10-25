import { z } from 'zod'
import {
  baseMimeType,
  createPinImageUploadUrl,
  getPin,
  getPinImageInfo,
  imageExtensionFor,
  insertAgentPin,
  isPinImagePathUsed,
  isSupportedImageType,
  removePinImage,
  SUPPORTED_IMAGE_TYPES,
  updateAgentPin,
  uploadPinImageBytes,
  type AgentPinUpdate,
  type PinProvenance,
} from '@/lib/api/pins'
import type { Pin } from '@/types/pins'
import type { FetchedImage, McpUserContext } from '../context'
import { defineTool, errorResult, jsonResult, type ToolResult } from '../tool'
import { pinToResult } from './pins'

/** Roughly 20 MB — the upper bound on an image `create_pin` will accept. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * The three fields a pin needs to be schedulable (ADR-0006, Spec #115 user
 * stories 33/34). Complete metadata promotes a pin to `metadata_created`; a gap
 * is reported back as a list of the missing fields (German labels for the user).
 */
const METADATA_LABELS = {
  title: 'Titel',
  description: 'Beschreibung',
  board: 'Board',
} as const

/** Trim a free-text field to null when empty/whitespace, else the trimmed text. */
function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** The names of the metadata fields still missing for `metadata_created`. */
function missingMetadata(fields: {
  title: string | null
  description: string | null
  board: string | null
}): string[] {
  const missing: string[] = []
  if (!fields.title) missing.push(METADATA_LABELS.title)
  if (!fields.description) missing.push(METADATA_LABELS.description)
  if (!fields.board) missing.push(METADATA_LABELS.board)
  return missing
}

/** Shared metadata fields for `create_pin`, `set_pin_metadata` and `update_pin`. */
const metadataShape = {
  title: z.string().optional().describe('Pin-Titel.'),
  description: z.string().optional().describe('Pin-Beschreibung.'),
  board_id: z
    .string()
    .optional()
    .describe('Pinterest-Board-ID (aus list_boards: pinterest_board_id).'),
  board_name: z
    .string()
    .optional()
    .describe('Name des Boards (aus list_boards: name). Zusammen mit board_id angeben.'),
  alt_text: z.string().optional().describe('Alternativtext für Barrierefreiheit.'),
  link: z.string().optional().describe('Ziel-URL des Pins (alternate_url).'),
  ai_modified: z
    .boolean()
    .optional()
    .describe('KI-Kennzeichnung: Bild mit KI erzeugt/bearbeitet.'),
  synthetic_performer: z
    .boolean()
    .optional()
    .describe('KI-Kennzeichnung: rein KI-erfundene, fiktive Person. Impliziert ai_modified.'),
}

type MetadataInput = z.infer<z.ZodObject<typeof metadataShape>>

/**
 * Translate the agent-facing metadata fields into a pin update patch, keeping
 * only the fields the caller actually sent (so unset fields are never clobbered
 * to null). `synthetic_performer` always implies `ai_modified` (mirrors the UI).
 */
function metadataPatch(input: MetadataInput): Omit<AgentPinUpdate, 'source' | 'oauth_client_id'> {
  const patch: Omit<AgentPinUpdate, 'source' | 'oauth_client_id'> = {}
  if (input.title !== undefined) patch.title = cleanText(input.title)
  if (input.description !== undefined) patch.description = cleanText(input.description)
  if (input.alt_text !== undefined) patch.alt_text = cleanText(input.alt_text)
  if (input.link !== undefined) patch.alternate_url = cleanText(input.link)
  if (input.board_id !== undefined) {
    patch.pinterest_board_id = cleanText(input.board_id)
    patch.pinterest_board_name = cleanText(input.board_name)
  }
  if (input.synthetic_performer !== undefined) {
    patch.synthetic_performer = input.synthetic_performer
    if (input.synthetic_performer) patch.ai_modified = true
  }
  if (input.ai_modified !== undefined && patch.ai_modified === undefined) {
    patch.ai_modified = input.ai_modified
  }
  return patch
}

/** Provenance stamp for every MCP write (source + the token's client id). */
export function provenance(ctx: McpUserContext): PinProvenance {
  return { source: 'mcp', oauth_client_id: ctx.oauthClientId }
}

/** The supported image types as a German list for tool texts. */
const SUPPORTED_IMAGE_LIST = SUPPORTED_IMAGE_TYPES.join(', ')

/** Supabase signed upload URLs are valid for two hours (storage-js docs). */
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000

/**
 * `request_pin_upload` — step one of the two-step upload (issue #135). Reserves
 * a fresh path `{tenant_id}/{uuid}.{ext}` in the pin-images bucket and returns a
 * signed upload URL, so an agent with a local or generated image (no public
 * URL) can PUT the bytes itself. Step two is `create_pin` with `upload_path`.
 */
export const requestPinUploadTool = defineTool({
  name: 'request_pin_upload',
  description:
    `Schritt 1 von 2 für Bilder ohne öffentliche URL (lokal oder im Agenten erzeugt): Liefert eine signierte Upload-URL (ca. 2 Stunden gültig) und einen upload_path. Lade das Bild per HTTP PUT mit passendem Content-Type hoch (Beispiel: curl_example) und rufe danach create_pin mit upload_path statt image_url auf. Erlaubt: ${SUPPORTED_IMAGE_LIST}.`,
  inputSchema: {
    content_type: z
      .string()
      .describe('MIME-Typ des Bilds, z. B. image/png. Muss beim PUT als Content-Type mitgeschickt werden.'),
  },
  handler: async ({ input, ctx }) => {
    const contentType = baseMimeType(input.content_type)
    if (!isSupportedImageType(contentType)) {
      return errorResult(
        `content_type ${input.content_type} wird nicht unterstützt. Erlaubt: ${SUPPORTED_IMAGE_LIST}.`,
      )
    }

    const slot = await createPinImageUploadUrl(contentType, ctx.tenantId, ctx.supabase)
    const file = `pin.${imageExtensionFor(contentType)}`
    return jsonResult({
      upload_url: slot.signedUrl,
      upload_path: slot.path,
      expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
      curl_example: `curl -X PUT -H "Content-Type: ${contentType}" --data-binary @${file} "${slot.signedUrl}"`,
      next_step: 'Nach dem Upload create_pin mit upload_path aufrufen.',
    })
  },
})

/** Fetch `image_url` and store it in the tenant folder; returns the storage path. */
async function storeImageFromUrl(
  imageUrl: string,
  ctx: McpUserContext,
): Promise<{ path: string } | ToolResult> {
  const url = imageUrl.trim()
  if (!/^https:\/\//i.test(url)) {
    return errorResult('image_url muss eine HTTPS-URL sein.')
  }
  if (!ctx.fetchRemoteImage) {
    return errorResult('Bild-Download ist in dieser Umgebung nicht verfügbar.')
  }

  let image: FetchedImage
  try {
    image = await ctx.fetchRemoteImage(url)
  } catch {
    return errorResult('Das Bild konnte unter image_url nicht geladen werden.')
  }

  const contentType = baseMimeType(image.contentType ?? '')
  if (!contentType.startsWith('image/')) {
    return errorResult(
      `image_url liefert keinen Bildinhalt (Content-Type: ${image.contentType ?? 'unbekannt'}).`,
    )
  }
  if (image.bytes.byteLength > MAX_IMAGE_BYTES) {
    return errorResult('Das Bild ist größer als 20 MB.')
  }

  const path = await uploadPinImageBytes(image.bytes, contentType, ctx.tenantId, ctx.supabase)
  return { path }
}

/**
 * Validate an object uploaded via `request_pin_upload`: it must sit directly in
 * the caller's tenant folder, not already back a pin, exist, and be a supported
 * image up to 20 MB. An invalid object (wrong type, too big) is deleted — the
 * "already used" check runs first so an existing pin's media is never touched.
 */
async function claimUploadedImage(
  uploadPath: string,
  ctx: McpUserContext,
): Promise<{ path: string } | ToolResult> {
  const path = uploadPath.trim()
  const prefix = `${ctx.tenantId}/`
  const name = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  if (!name || name.includes('/') || name.includes('..')) {
    return errorResult(
      'upload_path gehört nicht zu deinem Konto. Verwende den upload_path aus request_pin_upload.',
    )
  }

  if (await isPinImagePathUsed(path, ctx.supabase)) {
    return errorResult(
      'upload_path wird bereits von einem Pin verwendet. Für einen weiteren Pin request_pin_upload erneut aufrufen.',
    )
  }

  const info = await getPinImageInfo(path, ctx.supabase)
  if (!info) {
    return errorResult('Bild unter upload_path nicht gefunden - wurde der Upload ausgeführt?')
  }

  if (!isSupportedImageType(info.contentType ?? '')) {
    await removePinImage(path, ctx.supabase)
    return errorResult(
      `Die Datei unter upload_path ist kein unterstütztes Bild (Content-Type: ${info.contentType ?? 'unbekannt'}) und wurde gelöscht. Erlaubt: ${SUPPORTED_IMAGE_LIST}.`,
    )
  }
  if (info.size == null || info.size > MAX_IMAGE_BYTES) {
    await removePinImage(path, ctx.supabase)
    return errorResult(
      info.size == null
        ? 'Die Größe des Bilds unter upload_path ist unbekannt; es wurde gelöscht. Bitte erneut hochladen.'
        : 'Das Bild unter upload_path ist größer als 20 MB und wurde gelöscht.',
    )
  }

  return { path }
}

/**
 * `create_pin` — create a pin from an image (Spec #115, user stories 28–31;
 * issue #135). The image comes either from `image_url` (fetched over HTTPS,
 * `image/*` up to ~20 MB, stored like a UI upload) or from `upload_path` (an
 * object the agent PUT via `request_pin_upload`). Attaches any metadata given.
 * Complete metadata (Titel, Beschreibung, Board) makes the pin schedulable
 * right away (`metadata_created`); otherwise it stays a `draft`. Never triggers
 * Gemini (ADR-0006).
 */
export const createPinTool = defineTool({
  name: 'create_pin',
  description:
    'Legt einen Pin an. Das Bild kommt entweder aus image_url (öffentliche HTTPS-URL, wird geladen; nur image/*, bis ca. 20 MB) oder aus upload_path (vorher per request_pin_upload hochgeladen). Genau eins von beiden angeben. Metadaten sind optional; sind Titel, Beschreibung und Board vollständig, wird der Pin planbar (metadata_created). Stößt nie die automatische Metadaten-Generierung (Gemini) an.',
  inputSchema: {
    project_id: z.string().describe('ID des Blog-Projekts, zu dem der Pin gehört.'),
    image_url: z.string().optional().describe('HTTPS-URL des Pin-Bilds.'),
    upload_path: z
      .string()
      .optional()
      .describe('upload_path aus request_pin_upload, nachdem das Bild hochgeladen wurde.'),
    article_id: z.string().optional().describe('ID des zugehörigen Artikels (optional).'),
    ...metadataShape,
  },
  handler: async ({ input, ctx }) => {
    const hasUrl = !!input.image_url?.trim()
    const hasUpload = !!input.upload_path?.trim()
    if (hasUrl === hasUpload) {
      return errorResult('Genau eins von image_url oder upload_path angeben.')
    }

    const stored = hasUpload
      ? await claimUploadedImage(input.upload_path!, ctx)
      : await storeImageFromUrl(input.image_url!, ctx)
    if (!('path' in stored)) return stored
    const image_path = stored.path

    const title = cleanText(input.title)
    const description = cleanText(input.description)
    const boardId = cleanText(input.board_id)
    const complete = missingMetadata({ title, description, board: boardId }).length === 0

    const pin = await insertAgentPin(
      {
        tenant_id: ctx.tenantId,
        blog_project_id: input.project_id,
        blog_article_id: input.article_id ?? null,
        image_path,
        media_type: 'image',
        title,
        description,
        alt_text: cleanText(input.alt_text),
        alternate_url: cleanText(input.link),
        pinterest_board_id: boardId,
        pinterest_board_name: cleanText(input.board_name),
        synthetic_performer: input.synthetic_performer ?? false,
        ai_modified: input.synthetic_performer ? true : input.ai_modified ?? true,
        status: complete ? 'metadata_created' : 'draft',
        ...provenance(ctx),
      },
      ctx.supabase,
    )

    return jsonResult(pinToResult(pin, ctx))
  },
})

/**
 * `set_pin_metadata` — write agent-formulated metadata and make the pin
 * schedulable (Spec #115, user stories 32–34). Merges the given fields with the
 * pin's current values; when Titel, Beschreibung and Board are all present the
 * pin becomes `metadata_created`, otherwise the missing fields are reported.
 * Never triggers Gemini (ADR-0006).
 */
export const setPinMetadataTool = defineTool({
  name: 'set_pin_metadata',
  description:
    'Hinterlegt selbst formulierte Metadaten an einem Pin und macht ihn planbar. Sind Titel, Beschreibung und Board (zusammen mit den bestehenden Werten) vollständig, bekommt der Pin den Status metadata_created; fehlen Felder, kommt ein Fehler mit der Liste der fehlenden Felder. Stößt nie Gemini an.',
  inputSchema: {
    pin_id: z.string().describe('ID des Pins.'),
    ...metadataShape,
  },
  handler: async ({ input, ctx }) => {
    let existing: Pin
    try {
      existing = await getPin(input.pin_id, ctx.supabase)
    } catch {
      return errorResult('Pin nicht gefunden oder kein Zugriff.')
    }

    const patch = metadataPatch(input)
    const title =
      patch.title !== undefined ? patch.title : cleanText(existing.title)
    const description =
      patch.description !== undefined ? patch.description : cleanText(existing.description)
    const board =
      patch.pinterest_board_id !== undefined
        ? patch.pinterest_board_id
        : cleanText(existing.pinterest_board_id)

    const missing = missingMetadata({ title, description, board })
    if (missing.length > 0) {
      return errorResult(`Unvollständige Metadaten. Es fehlen: ${missing.join(', ')}.`)
    }

    const pin = await updateAgentPin(
      input.pin_id,
      { ...patch, status: 'metadata_created', ...provenance(ctx) },
      ctx.supabase,
    )
    return jsonResult(pinToResult(pin, ctx))
  },
})

/**
 * `update_pin` — change individual fields of a pin: Titel, Beschreibung, Link,
 * Board, Alt-Text, KI-Kennzeichnung (Spec #115, user story 35). A free patch: it
 * does not re-evaluate the pin's status. Never triggers Gemini (ADR-0006).
 */
export const updatePinTool = defineTool({
  name: 'update_pin',
  description:
    'Ändert einzelne Felder eines Pins: Titel, Beschreibung, Link, Board (board_id/board_name), Alt-Text und KI-Kennzeichnung. Nur mitgegebene Felder werden geändert; der Status bleibt unverändert.',
  inputSchema: {
    pin_id: z.string().describe('ID des Pins.'),
    ...metadataShape,
  },
  handler: async ({ input, ctx }) => {
    const patch = metadataPatch(input)
    if (Object.keys(patch).length === 0) {
      return errorResult('Keine Felder zum Ändern angegeben.')
    }

    const pin = await updateAgentPin(
      input.pin_id,
      { ...patch, ...provenance(ctx) },
      ctx.supabase,
    )
    return jsonResult(pinToResult(pin, ctx))
  },
})

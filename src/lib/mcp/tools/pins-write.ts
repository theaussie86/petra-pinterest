import { z } from 'zod'
import {
  getPin,
  insertAgentPin,
  updateAgentPin,
  uploadPinImageBytes,
  type AgentPinUpdate,
} from '@/lib/api/pins'
import type { Pin } from '@/types/pins'
import type { McpUserContext } from '../context'
import { defineTool, errorResult, jsonResult } from '../tool'
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

type MetadataInput = {
  title?: string
  description?: string
  board_id?: string
  board_name?: string
  alt_text?: string
  link?: string
  ai_modified?: boolean
  synthetic_performer?: boolean
}

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
function provenance(ctx: McpUserContext): { source: 'mcp'; oauth_client_id: string | null } {
  return { source: 'mcp', oauth_client_id: ctx.oauthClientId }
}

/**
 * `create_pin` — create a pin from an image URL (Spec #115, user stories 28–31).
 * Fetches the image over HTTPS, accepts only `image/*` up to ~20 MB, stores it
 * like a UI upload, and attaches any metadata given. Complete metadata (Titel,
 * Beschreibung, Board) makes the pin schedulable right away (`metadata_created`);
 * otherwise it stays a `draft`. Never triggers Gemini (ADR-0006).
 */
export const createPinTool = defineTool({
  name: 'create_pin',
  description:
    'Legt einen Pin aus einer Bild-URL an. Lädt das Bild per HTTPS (nur image/*, bis ca. 20 MB) und speichert es. Metadaten sind optional; sind Titel, Beschreibung und Board vollständig, wird der Pin planbar (metadata_created). Stößt nie die automatische Metadaten-Generierung (Gemini) an.',
  inputSchema: {
    project_id: z.string().describe('ID des Blog-Projekts, zu dem der Pin gehört.'),
    image_url: z.string().describe('HTTPS-URL des Pin-Bilds.'),
    article_id: z.string().optional().describe('ID des zugehörigen Artikels (optional).'),
    ...metadataShape,
  },
  handler: async ({ input, ctx }) => {
    const url = input.image_url.trim()
    if (!/^https:\/\//i.test(url)) {
      return errorResult('image_url muss eine HTTPS-URL sein.')
    }
    if (!ctx.fetchRemoteImage) {
      return errorResult('Bild-Download ist in dieser Umgebung nicht verfügbar.')
    }

    let image: { contentType: string | null; bytes: ArrayBuffer }
    try {
      image = await ctx.fetchRemoteImage(url)
    } catch {
      return errorResult('Das Bild konnte unter image_url nicht geladen werden.')
    }

    const contentType = (image.contentType ?? '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) {
      return errorResult(
        `image_url liefert keinen Bildinhalt (Content-Type: ${image.contentType ?? 'unbekannt'}).`,
      )
    }
    if (image.bytes.byteLength > MAX_IMAGE_BYTES) {
      return errorResult('Das Bild ist größer als 20 MB.')
    }

    const image_path = await uploadPinImageBytes(
      image.bytes,
      contentType,
      ctx.tenantId,
      ctx.supabase,
    )

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

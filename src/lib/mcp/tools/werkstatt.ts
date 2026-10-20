import { z } from 'zod'
import {
  answerAgentRevisionRequest,
  getPinTemplate,
  getPinTemplateRevisions,
  getPinTemplatesByArticle,
  insertAgentPinTemplate,
  updateAgentPinTemplate,
  type AgentPinTemplateUpdate,
  type PinTemplateProvenance,
} from '@/lib/api/pin-templates'
import {
  validatePinTemplate,
  type PinTemplateValidationError,
} from '@/lib/validation/pin-template'
import type { PinTemplate, PinTemplateDesign } from '@/types/pin-templates'
import type { McpUserContext } from '../context'
import { defineTool, errorResult, jsonResult } from '../tool'

/**
 * The Pin-Werkstatt tools (Spec #115 user stories 47–53, ADR-0006). A Connected
 * Agent proposes and reworks pin templates for a tenant with the `pin_werkstatt`
 * feature, but never decides: approving and archiving stay human actions in the
 * UI, so every tool here is gated behind `feature: 'pin_werkstatt'` and writes
 * only `draft`/`needs_revision` rows.
 */

/** German, agent-facing messages for each write-contract rejection (00027). */
const VALIDATION_MESSAGES: Record<PinTemplateValidationError, string> = {
  position_out_of_range: 'Position muss zwischen 1 und 30 liegen.',
  description_too_long: 'Beschreibung darf höchstens 500 Zeichen lang sein.',
  keyword_not_in_overlay: 'Das main_keyword muss wörtlich im overlay vorkommen.',
  description_not_starting_with_keyword:
    'Die Beschreibung muss mit dem main_keyword beginnen.',
}

/** Statuses a Connected Agent is allowed to write to (ADR-0006 guardrail). */
const WRITABLE_STATUSES = new Set(['draft', 'needs_revision'])

/** Provenance stamp for every MCP template write (source + the token's client id). */
function provenance(ctx: McpUserContext): PinTemplateProvenance {
  return { source: 'mcp', oauth_client_id: ctx.oauthClientId }
}

/** The content fields an agent may set on a template. All optional for patches. */
const contentShape = {
  position: z.number().int().describe('Position der Vorlage im Artikel (1–30).'),
  main_keyword: z.string().describe('Haupt-Keyword. Muss wörtlich im overlay vorkommen.'),
  image_prompt: z.string().describe('Bild-Prompt für die Vorlage (Pflichtfeld).'),
  overlay: z
    .string()
    .describe('Overlay-Text (Zeilen mit \\n getrennt). Muss das main_keyword enthalten.'),
  pin_type: z.string().optional().describe('Pin-Typ (z. B. Zitat).'),
  title: z.string().optional().describe('Titel der Vorlage.'),
  description: z
    .string()
    .optional()
    .describe('Beschreibung (max. 500 Zeichen, muss mit dem main_keyword beginnen).'),
  board_name_raw: z.string().optional().describe('Board-Name als Freitext.'),
  longtails: z.array(z.string()).optional().describe('Longtail-Keywords.'),
  search_phrases: z.array(z.string()).optional().describe('Suchphrasen.'),
  quality_check: z.array(z.string()).optional().describe('Qualitäts-Checkliste.'),
  search_intent: z.string().optional().describe('Suchintention.'),
  image_idea: z.string().optional().describe('Bild-Idee (Kurzbeschreibung).'),
  season: z.string().optional().describe('Saison/Anlass.'),
  design: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Design-Payload (name, layout, fonts[], colors[] …).'),
}

/**
 * The same fields as a patch: every field optional (for `update_pin_template`
 * and `answer_revision_request`, which change only what the agent sends).
 */
const patchShape = {
  template_id: z.string().describe('ID der Pin-Vorlage.'),
  position: contentShape.position.optional(),
  main_keyword: contentShape.main_keyword.optional(),
  image_prompt: contentShape.image_prompt.optional(),
  overlay: contentShape.overlay.optional(),
  pin_type: contentShape.pin_type,
  title: contentShape.title,
  description: contentShape.description,
  board_name_raw: contentShape.board_name_raw,
  longtails: contentShape.longtails,
  search_phrases: contentShape.search_phrases,
  quality_check: contentShape.quality_check,
  search_intent: contentShape.search_intent,
  image_idea: contentShape.image_idea,
  season: contentShape.season,
  design: contentShape.design,
}

type ContentInput = Partial<z.infer<z.ZodObject<typeof contentShape>>>

/** Keep only the content fields the caller actually sent (undefined = untouched). */
function contentPatch(input: ContentInput): Partial<AgentPinTemplateUpdate> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(contentShape) as (keyof typeof contentShape)[]) {
    if (input[key] !== undefined) patch[key] = input[key]
  }
  return patch as Partial<AgentPinTemplateUpdate>
}

/**
 * Resolve the three fields the write contract checks from a patch merged over
 * the template's current values, then run {@link validatePinTemplate}. Returns a
 * German error message on the first failing rule, or null when the row is valid.
 */
function validateMerged(
  base: Pick<PinTemplate, 'position' | 'main_keyword' | 'overlay' | 'description'>,
  patch: Partial<AgentPinTemplateUpdate>,
): string | null {
  const errors = validatePinTemplate({
    position: patch.position ?? base.position,
    main_keyword: patch.main_keyword ?? base.main_keyword,
    overlay: patch.overlay !== undefined ? patch.overlay : base.overlay,
    description: patch.description !== undefined ? patch.description : base.description,
  })
  if (errors.length === 0) return null
  return errors.map((e) => VALIDATION_MESSAGES[e]).join(' ')
}

/** The template's current content fields, for a revision `previous_snapshot`. */
function snapshot(template: PinTemplate): Record<string, unknown> {
  return {
    position: template.position,
    pin_type: template.pin_type,
    title: template.title,
    description: template.description,
    board_name_raw: template.board_name_raw,
    overlay: template.overlay,
    main_keyword: template.main_keyword,
    longtails: template.longtails,
    search_phrases: template.search_phrases,
    quality_check: template.quality_check,
    search_intent: template.search_intent,
    image_idea: template.image_idea,
    image_prompt: template.image_prompt,
    design: template.design,
    season: template.season,
  }
}

/**
 * `list_pin_templates` — the pin templates of one article, ordered by position
 * (Spec #115, user story 47).
 */
export const listPinTemplatesTool = defineTool({
  name: 'list_pin_templates',
  description:
    'Listet die Pin-Vorlagen eines Artikels, nach Position sortiert (nur mit Feature pin_werkstatt).',
  feature: 'pin_werkstatt',
  inputSchema: {
    article_id: z.string().describe('ID des Artikels.'),
  },
  handler: async ({ input, ctx }) => {
    const templates = await getPinTemplatesByArticle(input.article_id, ctx.supabase)
    return jsonResult({ count: templates.length, templates })
  },
})

/**
 * `get_pin_template` — a single pin template by id (Spec #115, user story 47).
 */
export const getPinTemplateTool = defineTool({
  name: 'get_pin_template',
  description: 'Liefert eine einzelne Pin-Vorlage anhand ihrer ID (nur mit Feature pin_werkstatt).',
  feature: 'pin_werkstatt',
  inputSchema: {
    template_id: z.string().describe('ID der Pin-Vorlage.'),
  },
  handler: async ({ input, ctx }) => {
    try {
      const template = await getPinTemplate(input.template_id, ctx.supabase)
      return jsonResult(template)
    } catch {
      return errorResult('Pin-Vorlage nicht gefunden oder kein Zugriff.')
    }
  },
})

/**
 * `list_pin_template_revisions` — the revision requests for a template, newest
 * first (Spec #115, user story 51). The agent reads the feedback, then reworks
 * via `answer_revision_request`.
 */
export const listPinTemplateRevisionsTool = defineTool({
  name: 'list_pin_template_revisions',
  description:
    'Listet die Überarbeitungswünsche einer Pin-Vorlage (neueste zuerst, nur mit Feature pin_werkstatt).',
  feature: 'pin_werkstatt',
  inputSchema: {
    template_id: z.string().describe('ID der Pin-Vorlage.'),
  },
  handler: async ({ input, ctx }) => {
    const revisions = await getPinTemplateRevisions(input.template_id, ctx.supabase)
    return jsonResult({ count: revisions.length, revisions })
  },
})

/**
 * `create_pin_template` — propose a new pin template (Spec #115, user story 48).
 * Runs the write-contract rules (migration 00027) up front for a readable error,
 * stamps provenance and always writes `draft`.
 */
export const createPinTemplateTool = defineTool({
  name: 'create_pin_template',
  description:
    'Legt eine neue Pin-Vorlage an (Status draft). Prüft den Pin-Template-Write-Contract (Position 1–30, main_keyword im overlay, Beschreibung beginnt mit main_keyword, max. 500 Zeichen). Nur mit Feature pin_werkstatt.',
  feature: 'pin_werkstatt',
  inputSchema: {
    article_id: z.string().describe('ID des Artikels, zu dem die Vorlage gehört.'),
    ...contentShape,
  },
  handler: async ({ input, ctx }) => {
    const error = validatePinTemplate({
      position: input.position,
      main_keyword: input.main_keyword,
      overlay: input.overlay,
      description: input.description ?? null,
    })
    if (error.length > 0) {
      return errorResult(error.map((e) => VALIDATION_MESSAGES[e]).join(' '))
    }

    try {
      const template = await insertAgentPinTemplate(
        {
          tenant_id: ctx.tenantId,
          blog_article_id: input.article_id,
          position: input.position,
          main_keyword: input.main_keyword,
          image_prompt: input.image_prompt,
          overlay: input.overlay,
          pin_type: input.pin_type,
          title: input.title,
          description: input.description,
          board_name_raw: input.board_name_raw,
          longtails: input.longtails,
          search_phrases: input.search_phrases,
          quality_check: input.quality_check,
          search_intent: input.search_intent,
          image_idea: input.image_idea,
          season: input.season,
          design: input.design as PinTemplateDesign | undefined,
          ...provenance(ctx),
        },
        ctx.supabase,
      )
      return jsonResult(template)
    } catch {
      return errorResult(
        'Die Vorlage konnte nicht angelegt werden (Position belegt oder Write-Contract verletzt).',
      )
    }
  },
})

/**
 * `update_pin_template` — rework a template's content while it is still
 * `draft`/`needs_revision` (Spec #115, user stories 49/50). Changes to
 * `approved`/`archived` templates are refused; the status is never touched.
 */
export const updatePinTemplateTool = defineTool({
  name: 'update_pin_template',
  description:
    'Überarbeitet eine Pin-Vorlage (nur Status draft/needs_revision). Ändert nur mitgegebene Felder, lässt den Status unberührt und prüft den Write-Contract. Freigegebene oder archivierte Vorlagen werden abgelehnt. Nur mit Feature pin_werkstatt.',
  feature: 'pin_werkstatt',
  inputSchema: patchShape,
  handler: async ({ input, ctx }) => {
    const { template_id, ...content } = input
    const patch = contentPatch(content)
    if (Object.keys(patch).length === 0) {
      return errorResult('Keine Felder zum Ändern angegeben.')
    }

    let existing: PinTemplate
    try {
      existing = await getPinTemplate(template_id, ctx.supabase)
    } catch {
      return errorResult('Pin-Vorlage nicht gefunden oder kein Zugriff.')
    }

    if (!WRITABLE_STATUSES.has(existing.status)) {
      return errorResult(
        `Vorlagen im Status ${existing.status} können nicht geändert werden (nur draft/needs_revision).`,
      )
    }

    const error = validateMerged(existing, patch)
    if (error) return errorResult(error)

    const template = await updateAgentPinTemplate(
      template_id,
      { ...patch, ...provenance(ctx) },
      ctx.supabase,
    )
    return jsonResult(template)
  },
})

/**
 * `answer_revision_request` — rework a template that is in `needs_revision` and
 * move it back to `draft`, recording the pre-rework fields as the revision's
 * `previous_snapshot` (Spec #115, user story 51; migration 00028).
 */
export const answerRevisionRequestTool = defineTool({
  name: 'answer_revision_request',
  description:
    'Beantwortet einen Überarbeitungswunsch: überarbeitet die Vorlage (nur Status needs_revision) und setzt sie zurück auf draft. Prüft den Write-Contract und hält den vorherigen Stand als previous_snapshot fest. Nur mit Feature pin_werkstatt.',
  feature: 'pin_werkstatt',
  inputSchema: patchShape,
  handler: async ({ input, ctx }) => {
    const { template_id, ...content } = input
    const patch = contentPatch(content)

    let existing: PinTemplate
    try {
      existing = await getPinTemplate(template_id, ctx.supabase)
    } catch {
      return errorResult('Pin-Vorlage nicht gefunden oder kein Zugriff.')
    }

    if (existing.status !== 'needs_revision') {
      return errorResult(
        `Es liegt kein offener Überarbeitungswunsch vor (Status ${existing.status}, erwartet needs_revision).`,
      )
    }

    const error = validateMerged(existing, patch)
    if (error) return errorResult(error)

    const template = await answerAgentRevisionRequest(
      template_id,
      { ...patch, ...provenance(ctx) },
      snapshot(existing),
      ctx.supabase,
    )
    return jsonResult(template)
  },
})

/** Every Pin-Werkstatt tool, gated behind the `pin_werkstatt` feature. */
export const werkstattTools = [
  listPinTemplatesTool,
  getPinTemplateTool,
  listPinTemplateRevisionsTool,
  createPinTemplateTool,
  updatePinTemplateTool,
  answerRevisionRequestTool,
]

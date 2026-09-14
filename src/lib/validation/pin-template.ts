/**
 * Validation rules for pin templates, kept in lockstep with the database CHECK
 * constraints in `supabase/migrations/00027_pin_template_validation.sql` and the
 * `(blog_article_id, position)` unique index from `00026_pin_templates.sql`.
 *
 * The database is the enforcing authority: the external agent writes templates
 * directly as the Postgres role `pin_werkstatt_agent` (epic #74, issue #83) and bypasses all app
 * code, so the constraints — not these predicates — are what actually reject
 * bad rows. This module mirrors that SQL so the rules can be unit-tested
 * without a live Postgres and reused by any future server-side ingest
 * (e.g. `createCampaignFn`). When you change a rule here, change the migration
 * too, and vice versa.
 */

export const PIN_TEMPLATE_MIN_POSITION = 1
export const PIN_TEMPLATE_MAX_POSITION = 30
export const PIN_TEMPLATE_MAX_DESCRIPTION_LENGTH = 500

/**
 * Lower-case, collapse every run of whitespace to a single space, and trim.
 * Mirrors the SQL `pin_template_normalize`:
 *   btrim(regexp_replace(lower(txt), '\s+', ' ', 'g'))
 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface PinTemplateValidationInput {
  position: number
  main_keyword: string
  overlay: string | null
  description: string | null
}

export type PinTemplateValidationError =
  | 'position_out_of_range'
  | 'description_too_long'
  | 'keyword_not_in_overlay'
  | 'description_not_starting_with_keyword'

/**
 * Returns the list of failing rejection rules for a single template row (empty
 * when the row is valid). Each entry corresponds to a CHECK constraint of the
 * same intent in migration 00027.
 */
export function validatePinTemplate(input: PinTemplateValidationInput): PinTemplateValidationError[] {
  const errors: PinTemplateValidationError[] = []
  const keyword = normalizeForMatch(input.main_keyword)

  // position 1..30
  if (input.position < PIN_TEMPLATE_MIN_POSITION || input.position > PIN_TEMPLATE_MAX_POSITION) {
    errors.push('position_out_of_range')
  }

  // description at most 500 characters (when set)
  if (input.description !== null && input.description.length > PIN_TEMPLATE_MAX_DESCRIPTION_LENGTH) {
    errors.push('description_too_long')
  }

  // main keyword must appear literally in the overlay (normalized). A missing
  // overlay cannot contain the keyword, so it is rejected too.
  if (input.overlay === null || !normalizeForMatch(input.overlay).includes(keyword)) {
    errors.push('keyword_not_in_overlay')
  }

  // description, when set, must begin with the main keyword (normalized)
  if (input.description !== null && !normalizeForMatch(input.description).startsWith(keyword)) {
    errors.push('description_not_starting_with_keyword')
  }

  return errors
}

/**
 * Mirrors the `(blog_article_id, position)` unique index: reports whether any
 * two rows share a position within the same article. The database enforces this
 * per insert/upsert; this helper lets an ingest check a batch up front.
 */
export function hasDuplicatePositions(
  rows: Array<{ blog_article_id: string; position: number }>
): boolean {
  const seen = new Set<string>()
  for (const row of rows) {
    const key = `${row.blog_article_id}:${row.position}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

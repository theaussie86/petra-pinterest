import type { AiDisclosureItem } from './pinterest-api.ts'

/**
 * Deno-runtime mirror of `src/lib/ai-disclosure.ts`. Maps the two persisted
 * disclosure booleans to the Pinterest `ai_disclosures` object sent on
 * `POST /v5/pins`.
 *
 * Rules (see ADR 0001) — MUST stay identical to the Node version:
 * - `synthetic_performer = true` always implies `AI_MODIFIED` is present in the
 *   array (defensive — even if the UI already enforces it).
 * - Both false ⇒ `undefined`, so the caller omits the field entirely rather than
 *   sending an empty `values` array (which Pinterest rejects).
 *
 * Pure function: no I/O. There is no shared helper across the Node and Deno
 * runtimes, so this file and its test mirror their `src/lib` counterparts
 * byte-for-byte in behaviour.
 */
export function buildAiDisclosures(
  aiModified: boolean,
  syntheticPerformer: boolean,
): { values: AiDisclosureItem[] } | undefined {
  const values: AiDisclosureItem[] = []

  if (aiModified || syntheticPerformer) {
    values.push('AI_MODIFIED')
  }
  if (syntheticPerformer) {
    values.push('SYNTHETIC_PERFORMER')
  }

  return values.length > 0 ? { values } : undefined
}

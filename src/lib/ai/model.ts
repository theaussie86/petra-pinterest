/**
 * Provider resolver — the single provider/model swap seam (ADR 0002 / PRD #40).
 *
 * Only Google is wired today via `createGoogleGenerativeAI`. Per-project BYOK
 * keys flow in as `apiKey`; the default model is `gemini-3.5-flash` (the
 * `gemini-2.5-flash` successor — 2.5 is end-of-life). Swapping or adding a
 * provider later is a one-line change here, not a rewrite of callers.
 *
 * Gemini 3.x replaced the numeric `thinkingBudget` with `thinkingLevel`; the
 * shared levels live here so both AI call sites cap their reasoning spend
 * (issue #71).
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

export const DEFAULT_MODEL_ID = 'gemini-3.5-flash'

/**
 * Thinking level per task.
 *
 * Thinking tokens bill at the full output rate, so an unbounded default is a
 * silent cost driver (issue #71) — but article extraction cannot go below
 * `medium`: measured against himmelstraenen.de, `minimal` and `low` make
 * gemini-3.5-flash run past the output cap (8177 of 8192 tokens, 65k without a
 * cap) and emit corrupted fields such as `2026-03-1026-03-10T00:00:00Z`, so the
 * JSON never validates. At `medium` the same calls finish in ~3k output plus
 * ~2k reasoning tokens. Pin metadata is short and stays fine at `low`.
 */
export const ARTICLE_THINKING_LEVEL = 'medium' as const
export const METADATA_THINKING_LEVEL = 'low' as const

/**
 * Resolve a `LanguageModel` for the given BYOK API key.
 *
 * @param apiKey  per-project Gemini API key (from Supabase Vault)
 * @param modelId optional model override; defaults to `gemini-3.5-flash`
 */
export function getModel(apiKey: string, modelId: string = DEFAULT_MODEL_ID): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

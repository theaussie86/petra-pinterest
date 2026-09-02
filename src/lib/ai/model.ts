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
 * Thinking level per task. Article extraction is mechanical, so it runs at
 * `minimal`; pin metadata is a writing task and keeps a small budget at `low`.
 * Thinking tokens bill at the full output rate, so an unbounded default is a
 * silent cost driver (issue #71).
 */
export const ARTICLE_THINKING_LEVEL = 'minimal' as const
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

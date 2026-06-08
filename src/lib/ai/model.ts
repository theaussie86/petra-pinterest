/**
 * Provider resolver — the single provider/model swap seam (ADR 0002 / PRD #40).
 *
 * Only Google is wired today via `createGoogleGenerativeAI`. Per-project BYOK
 * keys flow in as `apiKey`; the default model is `gemini-2.5-flash`. Swapping or
 * adding a provider later is a one-line change here, not a rewrite of callers.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash'

/**
 * Resolve a `LanguageModel` for the given BYOK API key.
 *
 * @param apiKey  per-project Gemini API key (from Supabase Vault)
 * @param modelId optional model override; defaults to `gemini-2.5-flash`
 */
export function getModel(apiKey: string, modelId: string = DEFAULT_MODEL_ID): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

/**
 * Public AI operations as options-object wrappers over `generateObject`
 * (ADR 0002 / PRD #40).
 *
 * Slice 1 ships article extraction only; pin-metadata wrappers land in a later
 * slice. Each wrapper accepts an optional injected `model` so tests can exercise
 * the real `generateObject` + Zod + repair path via `MockLanguageModelV2` with
 * no network. Production calls resolve the model from the BYOK key via
 * `getModel(apiKey)`.
 */

import { generateObject, type LanguageModel } from 'ai'
import { getModel } from './model'
import { repairText } from './repair'
import { ARTICLE_SCRAPER_SYSTEM_PROMPT } from './prompts'
import { scrapedArticleSchema, type ScrapedArticle } from './schemas'

const MAX_HTML_CHARS = 100000

export interface GenerateArticleOptions {
  html: string
  url: string
  apiKey: string
  /** Injected model for tests; defaults to `getModel(apiKey)`. */
  model?: LanguageModel
}

/**
 * Extract structured article content from raw HTML.
 *
 * Wraps `generateObject` with the article Zod schema and the article-scraper
 * system prompt at `temperature: 0.1`. No manual `JSON.parse` on the happy
 * path; the carried-over control-char repair only fires on parse failure.
 */
export async function generateArticleFromHtml({
  html,
  url,
  apiKey,
  model,
}: GenerateArticleOptions): Promise<ScrapedArticle> {
  const truncatedHtml = html.slice(0, MAX_HTML_CHARS)

  const { object } = await generateObject({
    model: model ?? getModel(apiKey),
    schema: scrapedArticleSchema,
    system: ARTICLE_SCRAPER_SYSTEM_PROMPT,
    prompt: `URL: ${url}\n\nHTML Content:\n${truncatedHtml}`,
    temperature: 0.1,
    experimental_repairText: repairText,
  })

  return object
}

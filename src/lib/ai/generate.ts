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

import { generateObject, type LanguageModel, type ModelMessage } from 'ai'
import { getModel } from './model'
import { repairText } from './repair'
import { ARTICLE_SCRAPER_SYSTEM_PROMPT, PINTEREST_SEO_SYSTEM_PROMPT } from './prompts'
import {
  scrapedArticleSchema,
  generatedMetadataSchema,
  type ScrapedArticle,
  type GeneratedMetadata,
} from './schemas'
import type { ImageBytes } from './image'

const MAX_HTML_CHARS = 100000
const MAX_ARTICLE_CONTENT_CHARS = 4000

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

export interface PinMetadataArticle {
  title?: string | null
  content?: string | null
}

export interface GeneratePinMetadataOptions {
  /** Linked article context; null/undefined (or no title) → image-only branch. */
  article?: PinMetadataArticle | null
  /** Pre-fetched image bytes. Video pins pass the ffmpeg keyframe bytes here. */
  image: ImageBytes
  mediaType: 'image' | 'video'
  /** Language- and aiContext-aware system prompt (built by the caller). */
  systemPrompt?: string
  apiKey: string
  /** Injected model for tests; defaults to `getModel(apiKey)`. */
  model?: LanguageModel
}

/**
 * Build the multimodal user prompt text for pin metadata.
 *
 * Mirrors the former `@google/genai` path: a pin-type line plus the article
 * section, or the image-only branch when no article (title) is linked.
 */
function buildPinMetadataPromptText({
  article,
  mediaType,
}: {
  article?: PinMetadataArticle | null
  mediaType: 'image' | 'video'
}): string {
  const articleSection = article?.title
    ? `\n\nArticle Title: ${article.title}\n\nArticle Content: ${(article.content ?? '').slice(0, MAX_ARTICLE_CONTENT_CHARS)}`
    : `\n\n[No article linked — generate metadata based solely on the image.]`
  return `Pin Type: ${mediaType === 'video' ? 'Video' : 'Image'}${articleSection}`
}

/**
 * Build the multimodal user turn: the pin prompt text plus a `Uint8Array` image
 * part. Image and video pins share this part (video pins pass keyframe bytes).
 */
function buildPinMetadataUserMessage({
  article,
  mediaType,
  image,
}: Pick<GeneratePinMetadataOptions, 'article' | 'mediaType' | 'image'>): ModelMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: buildPinMetadataPromptText({ article, mediaType }) },
      { type: 'image', image: image.bytes, mediaType: image.mimeType },
    ],
  }
}

/**
 * Shared `generateObject` call for both pin-metadata paths.
 *
 * Wraps the metadata Zod schema with the same temperature, token, and Google
 * provider-option settings the old `@google/genai` path used (`thinkingBudget: 0`,
 * `temperature: 0.7`); the control-char repair only fires on parse failure
 * (ADR 0002 / PRD #40).
 */
async function generatePinMetadataObject(
  messages: ModelMessage[],
  { model, apiKey, systemPrompt }: Pick<GeneratePinMetadataOptions, 'model' | 'apiKey' | 'systemPrompt'>,
): Promise<GeneratedMetadata> {
  const { object } = await generateObject({
    model: model ?? getModel(apiKey),
    schema: generatedMetadataSchema,
    system: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
    messages,
    temperature: 0.7,
    maxOutputTokens: 8192,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    experimental_repairText: repairText,
  })

  return object
}

/**
 * Generate Pinterest-optimized metadata (title, description, alt text) for a pin.
 *
 * Sends a single multimodal user turn — a text section plus the image part — to
 * the shared metadata generator.
 */
export async function generatePinMetadata(
  options: GeneratePinMetadataOptions,
): Promise<GeneratedMetadata> {
  return generatePinMetadataObject([buildPinMetadataUserMessage(options)], options)
}

export interface GeneratePinMetadataWithFeedbackOptions extends GeneratePinMetadataOptions {
  /** The previous generation being refined; replayed as the assistant turn. */
  previousMetadata: GeneratedMetadata
  /** Operator feedback steering the refinement; sent as the final user turn. */
  feedback: string
}

/**
 * Regenerate pin metadata from operator feedback.
 *
 * Replaces the old chat-session API with an explicit `[user, assistant, user]`
 * messages array: the original multimodal request, the previous generation
 * replayed as JSON, then the feedback.
 */
export async function generatePinMetadataWithFeedback(
  options: GeneratePinMetadataWithFeedbackOptions,
): Promise<GeneratedMetadata> {
  const { previousMetadata, feedback } = options

  return generatePinMetadataObject(
    [
      buildPinMetadataUserMessage(options),
      {
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(previousMetadata) }],
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Please regenerate the metadata with this feedback: ${feedback}` },
        ],
      },
    ],
    options,
  )
}

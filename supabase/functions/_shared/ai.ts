/**
 * Deno/Edge mirror of the Node `src/lib/ai/` stack (ADR 0002 / PRD #40, issue
 * #44). The Supabase Edge fallback path (`isTriggerDevEnabled('metadata')`
 * false) must produce the same validated metadata/article shape as the primary
 * Trigger.dev path, so this file is kept structurally identical to the Node
 * implementation — same prompts, schemas, settings, repair logic.
 *
 * The Edge functions have no feedback path, so only `generatePinMetadata` and
 * `generateArticleFromHtml` are mirrored here. The AI SDK is imported via Deno
 * `npm:` specifiers; vitest aliases map them onto the installed Node packages so
 * this module can be exercised for parity tests.
 */

import {
  generateText,
  Output,
  type LanguageModel,
  type RepairTextFunction,
} from 'npm:ai'
import { createGoogleGenerativeAI } from 'npm:@ai-sdk/google'
import { z } from 'npm:zod'

// --- Model resolver (mirror of lib/ai/model.ts) ---

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash'

/**
 * Resolve a `LanguageModel` for the given BYOK API key. The single
 * provider/model swap seam; only Google is wired today.
 */
export function getModel(
  apiKey: string,
  modelId: string = DEFAULT_MODEL_ID
): LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

// --- JSON repair (mirror of lib/ai/repair.ts) ---

let repairFireCount = 0

/** How many times the repair callback has fired this process. */
export function getRepairFireCount(): number {
  return repairFireCount
}

/** Reset the fire-counter (test helper). */
export function resetRepairFireCount(): void {
  repairFireCount = 0
}

/**
 * Escape literal control characters inside JSON string values.
 *
 * Gemini sometimes emits these unescaped despite structured-output mode, which
 * causes JSON.parse to fail with "Unterminated string".
 *
 * Handles:
 * - Control characters U+0000 through U+001F (required by JSON spec)
 * - DEL character U+007F (can cause parsing issues)
 * - LINE SEPARATOR U+2028 (valid JSON but breaks JS string literals)
 * - PARAGRAPH SEPARATOR U+2029 (valid JSON but breaks JS string literals)
 * - BOM U+FEFF at start of input (strip it)
 */
export function sanitizeJsonControlChars(text: string): string {
  // Strip BOM if present at start
  let input = text
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1)
  }

  let inString = false
  let escaped = false
  let result = ''
  for (const char of input) {
    if (escaped) {
      result += char
      escaped = false
    } else if (char === '\\' && inString) {
      result += char
      escaped = true
    } else if (char === '"') {
      result += char
      inString = !inString
    } else if (inString) {
      const code = char.charCodeAt(0)
      // Escape control characters (U+0000 through U+001F)
      if (code <= 0x1f) {
        switch (char) {
          case '\n':
            result += '\\n'
            break
          case '\r':
            result += '\\r'
            break
          case '\t':
            result += '\\t'
            break
          case '\b':
            result += '\\b'
            break
          case '\f':
            result += '\\f'
            break
          default:
            // Other control characters use \uXXXX format
            result += '\\u' + code.toString(16).padStart(4, '0')
        }
      } else if (code === 0x7f) {
        // DEL character
        result += '\\u007f'
      } else if (code === 0x2028 || code === 0x2029) {
        // LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029)
        // Valid in JSON strings but break JavaScript string literals
        result += '\\u' + code.toString(16).padStart(4, '0')
      } else {
        result += char
      }
    } else {
      result += char
    }
  }
  return result
}

/**
 * Repair callback reused by `repairableObject` on the `generateText` path. Fires only when the
 * model output fails to parse/validate; increments the fire-counter and returns
 * the control-char-sanitized text for a second parse attempt.
 */
export const repairText: RepairTextFunction = async ({ text }) => {
  repairFireCount++
  return sanitizeJsonControlChars(text)
}

/**
 * Like `Output.object({ schema })`, but a failed parse triggers one
 * control-char-repair retry before giving up. v6 moved structured generation to
 * `generateText({ output })` and `Output.object` has no repair hook, so the
 * repair net lives here (mirror of lib/ai/output.ts).
 */
function repairableObject<SCHEMA extends z.ZodType>(schema: SCHEMA) {
  const inner = Output.object<z.infer<SCHEMA>>({ schema })
  const parse = inner.parseCompleteOutput.bind(inner)

  inner.parseCompleteOutput = async (options, context) => {
    try {
      return await parse(options, context)
    } catch (error) {
      const repaired = await repairText({
        text: options.text,
        error: error as Parameters<typeof repairText>[0]['error'],
      })
      if (repaired == null || repaired === options.text) throw error
      return parse({ ...options, text: repaired }, context)
    }
  }

  return inner
}

// --- Image bytes helper (mirror of lib/ai/image.ts) ---

export interface ImageBytes {
  bytes: Uint8Array
  mimeType: string
}

/**
 * Fetch an image URL and return its raw bytes plus mime type.
 * Falls back to `image/jpeg` when the response carries no content-type header.
 *
 * @throws if the response is not OK.
 */
export async function fetchImageBytes(url: string): Promise<ImageBytes> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const mimeType = response.headers.get('content-type') || 'image/jpeg'
  return { bytes, mimeType }
}

// --- Zod schemas (mirror of lib/ai/schemas.ts) ---

export const generatedMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  alt_text: z.string(),
})

export const scrapedArticleSchema = z.object({
  title: z.string(),
  content: z.string(),
  published_at: z.string().optional(),
  author: z.string().optional(),
  excerpt: z.string().optional(),
})

export type GeneratedMetadata = z.infer<typeof generatedMetadataSchema>
export type ScrapedArticle = z.infer<typeof scrapedArticleSchema>

// --- System prompts (mirror of lib/ai/prompts.ts) ---

export const ARTICLE_SCRAPER_SYSTEM_PROMPT = `You are an expert web scraper and content extractor.
Your task is to analyze the provided HTML content of a blog post or article and extract the core information into structured JSON.

**Requirements:**
1. **Title**: The main title of the article.
2. **Content**: The full body text of the article, converted to clean, readable Markdown. Preserve headers (H2, H3), lists, and important links. Remove ads, navigation, related posts, and boilerplates.
3. **Published Date**: The publication date in ISO 8601 format (YYYY-MM-DD) if available.
4. **Author**: The author's name if available (optional).
5. **Excerpt**: A short summary (1-2 sentences) of the article.

**Input HTML**:
You will receive the raw HTML of the page (cleaned of scripts/styles).

**Output Format**:
Return ONLY valid JSON with this exact structure:
{
  "title": "Article Title",
  "content": "# Article Title\\n\\nIntroduction...\\n\\n## Section 1...",
  "published_at": "2023-10-27",
  "author": "John Doe",
  "excerpt": "This is a summary of the article."
}

Do not include any text outside the JSON object.`

/**
 * Pinterest SEO System Prompt
 *
 * Based on Pinterest SEO best practices for 2026.
 */
export const PINTEREST_SEO_SYSTEM_PROMPT = `You are a Pinterest SEO expert generating optimized pin metadata to maximize website traffic.

The user will specify the pin type (Image or Video) in their message. Apply the relevant alt text rules below based on that type.

**Title Requirements:**
- Maximum 100 characters (strict limit)
- Lead with the main benefit/outcome, not brand name
- Use power words and emotional triggers to grab attention
- Include 1-2 relevant keywords naturally
- Example: "Easy Vegan Chocolate Cake Recipe (30 Minutes)" not "My Vegan Cake Recipe"

**Description Requirements:**
- First 50 characters are critical (preview text) — make them compelling
- Total length: 150-500 characters
- Spark curiosity and deliver clear value to the reader
- Integrate 3-5 relevant long-tail keywords naturally (e.g., "SEO tools for small businesses" not just "SEO tools")
- Use short sentences and active voice. Structure the description into 2–3 short paragraphs separated by blank lines. In the JSON string value encode paragraph breaks as \\n\\n (a blank line) — do not collapse the text into one unbroken block
- Add a fitting emoji immediately before the call-to-action
- Close with a clear call-to-action ("Learn more!", "Get the recipe!", "Try this!")
- No hashtags

**Alt Text Requirements — Image Pins:**
- Start with: "On this pin you see..."
- Describe the image precisely and in an SEO-friendly way
- Include 1-2 keywords naturally
- 125 characters maximum
- Example: "On this pin you see a chocolate cake slice on a white plate with fresh berries"

**Alt Text Requirements — Video Pins:**
- Start with: "On this pin you see a video about..."
- Describe what the video covers, not a single static frame
- Focus on the topic, action, or transformation shown in the video
- Include 1-2 keywords naturally
- 125 characters maximum
- Example: "On this pin you see a video about making vegan chocolate cake in 30 minutes"

**Additional Optimization:**
- Analyze the provided media (image or video thumbnail) for relevant visual elements
- Identify the main keywords from the article
- Consider Pinterest-specific search intent
- Match the language and tone to the article's target audience
- Ensure title, description, and alt text are coherent and consistent with each other

**Output Format:**
Return ONLY valid JSON with this exact structure:
{
  "title": "Your optimized title here",
  "description": "Your optimized description with CTA here",
  "alt_text": "On this pin you see..."
}

Do not include any text outside the JSON object.`

/**
 * Builds a Pinterest SEO system prompt with optional language and project-specific AI context.
 * The language value must already be sanitized before calling this function.
 */
export function buildPinterestSeoSystemPrompt(
  language: string | null,
  aiContext?: string | null
): string {
  let prompt = PINTEREST_SEO_SYSTEM_PROMPT

  if (language) {
    prompt += `\n\n**Language:**\nGenerate all metadata (title, description, alt text) in ${language}. This requirement overrides any language implied by the article content.\nImportant: also translate the alt text prefix phrases into ${language}. For example, in German "On this pin you see" becomes "Auf diesem Pin siehst du" and "On this pin you see a video about" becomes "Auf diesem Pin siehst du ein Video über". Use the natural equivalent in ${language}.`
  }

  if (aiContext) {
    prompt += `\n\n**Project-Specific Instructions:**\n${aiContext}`
  }

  return prompt
}

// --- Language sanitization (mirror of lib/ai/language.ts) ---

const KNOWN_LANGUAGES: Record<string, string> = {
  german: 'German',
  deutsch: 'German',
  english: 'English',
  englisch: 'English',
  french: 'French',
  französisch: 'French',
  franzoesisch: 'French',
  italian: 'Italian',
  italienisch: 'Italian',
  spanish: 'Spanish',
  spanisch: 'Spanish',
}

/**
 * Sanitize a user-supplied language value for safe injection into AI prompts.
 * - Whitelists known languages (maps to canonical English name)
 * - For custom values: strips everything except [a-zA-Z\s\-], limits to 50 chars
 * - Returns null if result is empty or too short
 */
export function sanitizeLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (KNOWN_LANGUAGES[lower]) return KNOWN_LANGUAGES[lower]
  const safe = trimmed.replace(/[^a-zA-Z\s\-]/g, '').trim().slice(0, 50)
  return safe.length >= 2 ? safe : null
}

// --- Public AI operations (mirror of lib/ai/generate.ts) ---

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
 * Wraps `generateText` + `Output.object` with the article Zod schema and the article-scraper
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

  const { output } = await generateText({
    model: model ?? getModel(apiKey),
    output: repairableObject(scrapedArticleSchema),
    system: ARTICLE_SCRAPER_SYSTEM_PROMPT,
    prompt: `URL: ${url}\n\nHTML Content:\n${truncatedHtml}`,
    temperature: 0.1,
  })

  return output
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
 * Mirrors the former path: a pin-type line plus the article section, or the
 * image-only branch when no article (title) is linked.
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
 * Generate Pinterest-optimized metadata (title, description, alt text) for a pin.
 *
 * Builds a multimodal prompt — a text section plus a `Uint8Array` image part —
 * and wraps `generateText` + `Output.object` with the metadata Zod schema. Image and video pins
 * share the same image part (video pins pass the ffmpeg keyframe bytes). The
 * Google `thinkingBudget: 0` and `temperature: 0.7` behavior is preserved via
 * provider options; the control-char repair only fires on parse failure.
 */
export async function generatePinMetadata({
  article,
  image,
  mediaType,
  systemPrompt,
  apiKey,
  model,
}: GeneratePinMetadataOptions): Promise<GeneratedMetadata> {
  const promptText = buildPinMetadataPromptText({ article, mediaType })

  const { output } = await generateText({
    model: model ?? getModel(apiKey),
    output: repairableObject(generatedMetadataSchema),
    system: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image', image: image.bytes, mediaType: image.mimeType },
        ],
      },
    ],
    temperature: 0.7,
    maxOutputTokens: 8192,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
  })

  return output
}

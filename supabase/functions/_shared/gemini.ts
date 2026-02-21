import { GoogleGenAI } from 'npm:@google/genai'
import { z } from 'npm:zod'

// --- System Prompts ---

const PINTEREST_SEO_SYSTEM_PROMPT = `You are a Pinterest SEO expert generating optimized pin metadata to maximize website traffic.

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
- Use short sentences, active voice, and structure with line breaks and blank lines for readability — actually use whitespace and paragraphs in the output
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

// --- Language sanitization and prompt building ---

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

export function sanitizeLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (KNOWN_LANGUAGES[lower]) return KNOWN_LANGUAGES[lower]
  const safe = trimmed.replace(/[^a-zA-Z\s\-]/g, '').trim().slice(0, 50)
  return safe.length >= 2 ? safe : null
}

export function buildPinterestSeoSystemPrompt(language: string | null): string {
  if (!language) return PINTEREST_SEO_SYSTEM_PROMPT
  return (
    PINTEREST_SEO_SYSTEM_PROMPT +
    `\n\n**Language:**\nGenerate all metadata (title, description, alt text) in ${language}. This requirement overrides any language implied by the article content.`
  )
}

const ARTICLE_SCRAPER_SYSTEM_PROMPT = `You are an expert web scraper and content extractor.
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

// --- Zod Schemas ---

const generatedMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  alt_text: z.string(),
})

const scrapedArticleSchema = z.object({
  title: z.string(),
  content: z.string(),
  published_at: z.string().optional(),
  author: z.string().optional(),
  excerpt: z.string().optional(),
})

export type GeneratedMetadata = z.infer<typeof generatedMetadataSchema>
export type ScrapedArticle = z.infer<typeof scrapedArticleSchema>

// --- JSON schemas for Gemini structured output ---

const metadataJsonSchema = z.toJSONSchema(generatedMetadataSchema)
const articleJsonSchema = z.toJSONSchema(scrapedArticleSchema)

/**
 * Fetch an image URL and return it as base64 for Gemini inline data.
 * Uses Deno-compatible base64 encoding instead of Node.js Buffer.
 */
async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  // Chunk the conversion to avoid blowing the call stack on large images
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const data = btoa(binary)
  const mimeType = response.headers.get('content-type') || 'image/jpeg'
  return { data, mimeType }
}

/**
 * Generate Pinterest-optimized metadata for a pin.
 * Uses Gemini 2.5 Flash with vision to analyze article content + pin image.
 */
export async function generatePinMetadata(
  articleTitle: string | null | undefined,
  articleContent: string | null | undefined,
  pinImageUrl: string,
  systemPrompt: string | undefined,
  apiKey: string,
  mediaType: 'image' | 'video' = 'image'
): Promise<GeneratedMetadata> {
  const articleSection = articleTitle
    ? `\n\nArticle Title: ${articleTitle}\n\nArticle Content: ${(articleContent ?? '').slice(0, 4000)}`
    : `\n\n[No article linked — generate metadata based solely on the image.]`
  const promptText = `Pin Type: ${mediaType === 'video' ? 'Video' : 'Image'}${articleSection}`
  const imageData = await fetchImageAsBase64(pinImageUrl)

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        text: promptText,
      },
      {
        inlineData: { mimeType: imageData.mimeType, data: imageData.data },
      },
    ],
    config: {
      systemInstruction: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
      maxOutputTokens: 2048,
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseJsonSchema: metadataJsonSchema,
    },
  })

  if (!response.text) {
    throw new Error('Gemini returned empty response')
  }

  return generatedMetadataSchema.parse(JSON.parse(response.text))
}

/**
 * Extract article content from HTML using Gemini.
 */
export async function generateArticleFromHtml(
  htmlContent: string,
  url: string,
  apiKey: string
): Promise<ScrapedArticle> {
  const truncatedHtml = htmlContent.slice(0, 100000)

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ text: `URL: ${url}\n\nHTML Content:\n${truncatedHtml}` }],
    config: {
      systemInstruction: ARTICLE_SCRAPER_SYSTEM_PROMPT,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: articleJsonSchema,
    },
  })

  if (!response.text) {
    throw new Error('Gemini returned empty response')
  }

  return scrapedArticleSchema.parse(JSON.parse(response.text))
}

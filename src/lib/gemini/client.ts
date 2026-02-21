/**
 * Gemini Client
 *
 * Singleton Gemini client instance for AI metadata generation.
 * Uses Gemini 2.5 Flash with vision capabilities to analyze pin images and article content.
 * All calls use structured output (responseJsonSchema) for reliable JSON parsing.
 */

import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { PINTEREST_SEO_SYSTEM_PROMPT, ARTICLE_SCRAPER_SYSTEM_PROMPT } from './prompts'

function getAiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey })
}

/**
 * Escape literal control characters (newlines, carriage returns, tabs) inside
 * JSON string values. Gemini sometimes emits these unescaped despite using
 * responseMimeType: 'application/json', which causes JSON.parse to fail with
 * "Unterminated string".
 */
function sanitizeJsonResponse(text: string): string {
  let inString = false
  let escaped = false
  let result = ''
  for (const char of text) {
    if (escaped) {
      result += char
      escaped = false
    } else if (char === '\\' && inString) {
      result += char
      escaped = true
    } else if (char === '"') {
      result += char
      inString = !inString
    } else if (inString && char === '\n') {
      result += '\\n'
    } else if (inString && char === '\r') {
      result += '\\r'
    } else if (inString && char === '\t') {
      result += '\\t'
    } else {
      result += char
    }
  }
  return result
}

// --- Zod schemas ---

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
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = response.headers.get('content-type') || 'image/jpeg'
  return { data: base64, mimeType }
}

/**
 * Generate Pinterest-optimized metadata for a pin
 *
 * Uses Gemini 2.5 Flash with vision to analyze both the article content and pin image
 * to generate SEO-optimized title, description, and alt text.
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

  const response = await getAiClient(apiKey).models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        text: promptText,
      },
      { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
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

  return generatedMetadataSchema.parse(JSON.parse(sanitizeJsonResponse(response.text)))
}

/**
 * Generate metadata with feedback using Gemini multi-turn conversation.
 *
 * Replays the original request and previous generation as chat history,
 * then sends the user's feedback to get refined metadata.
 */
export async function generatePinMetadataWithFeedback(
  articleTitle: string | null | undefined,
  articleContent: string | null | undefined,
  pinImageUrl: string,
  previousMetadata: GeneratedMetadata,
  feedback: string,
  apiKey: string,
  mediaType: 'image' | 'video' = 'image',
  systemPrompt?: string
): Promise<GeneratedMetadata> {
  const articleSection = articleTitle
    ? `\n\nArticle Title: ${articleTitle}\n\nArticle Content: ${(articleContent ?? '').slice(0, 4000)}`
    : `\n\n[No article linked — generate metadata based solely on the image.]`
  const promptText = `Pin Type: ${mediaType === 'video' ? 'Video' : 'Image'}${articleSection}`
  const imageData = await fetchImageAsBase64(pinImageUrl)

  const chat = getAiClient(apiKey).chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
      maxOutputTokens: 2048,
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseJsonSchema: metadataJsonSchema,
    },
    history: [
      {
        role: 'user',
        parts: [
          {
            text: promptText,
          },
          { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
        ],
      },
      {
        role: 'model',
        parts: [{ text: JSON.stringify(previousMetadata) }],
      },
    ],
  })

  const response = await chat.sendMessage({
    message: `Please regenerate the metadata with this feedback: ${feedback}`,
  })

  if (!response.text) {
    throw new Error('Gemini returned empty response')
  }

  return generatedMetadataSchema.parse(JSON.parse(sanitizeJsonResponse(response.text)))
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

    const response = await getAiClient(apiKey).models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: `URL: ${url}\n\nHTML Content:\n${truncatedHtml}` },
      ],
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

    return scrapedArticleSchema.parse(JSON.parse(sanitizeJsonResponse(response.text)))
  }

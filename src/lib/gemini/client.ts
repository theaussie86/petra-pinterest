/**
 * Gemini Client
 *
 * Singleton Gemini client instance for AI metadata generation.
 * Uses Gemini 2.0 Flash with vision capabilities to analyze pin images and article content.
 */

import { GoogleGenAI } from '@google/genai'
import { PINTEREST_SEO_SYSTEM_PROMPT } from './prompts'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

/**
 * Generated metadata structure from Gemini
 */
export interface GeneratedMetadata {
  title: string
  description: string
  alt_text: string
}

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
 * Parse a Gemini response that should contain JSON.
 * Strips markdown code fences if present and validates required fields.
 */
function parseMetadataResponse(responseContent: string): GeneratedMetadata {
  const cleaned = responseContent
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()

  const metadata = JSON.parse(cleaned) as GeneratedMetadata

  if (!metadata.title || !metadata.description || !metadata.alt_text) {
    throw new Error('Gemini response missing required fields (title, description, alt_text)')
  }

  return metadata
}

/**
 * Generate Pinterest-optimized metadata for a pin
 *
 * Uses Gemini 2.0 Flash with vision to analyze both the article content and pin image
 * to generate SEO-optimized title, description, and alt text.
 */
export async function generatePinMetadata(
  articleTitle: string,
  articleContent: string,
  pinImageUrl: string,
  systemPrompt?: string
): Promise<GeneratedMetadata> {
  const truncatedContent = articleContent.slice(0, 4000)
  const imageData = await fetchImageAsBase64(pinImageUrl)

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      { text: `Article Title: ${articleTitle}\n\nArticle Content: ${truncatedContent}` },
      { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
    ],
    config: {
      systemInstruction: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  })

  const responseContent = response.text

  if (!responseContent) {
    throw new Error('Gemini returned empty response')
  }

  try {
    return parseMetadataResponse(responseContent)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse Gemini response as JSON. Response: ${responseContent.slice(0, 200)}`
      )
    }
    throw error
  }
}

/**
 * Generate metadata with feedback using Gemini multi-turn conversation.
 *
 * Replays the original request and previous generation as chat history,
 * then sends the user's feedback to get refined metadata.
 */
export async function generatePinMetadataWithFeedback(
  articleTitle: string,
  articleContent: string,
  pinImageUrl: string,
  previousMetadata: GeneratedMetadata,
  feedback: string
): Promise<GeneratedMetadata> {
  const truncatedContent = articleContent.slice(0, 4000)
  const imageData = await fetchImageAsBase64(pinImageUrl)

  const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    config: {
      systemInstruction: PINTEREST_SEO_SYSTEM_PROMPT,
      maxOutputTokens: 500,
      temperature: 0.7,
    },
    history: [
      {
        role: 'user',
        parts: [
          { text: `Article Title: ${articleTitle}\n\nArticle Content: ${truncatedContent}` },
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

  const responseContent = response.text

  if (!responseContent) {
    throw new Error('Gemini returned empty response')
  }

  try {
    return parseMetadataResponse(responseContent)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse Gemini response as JSON. Response: ${responseContent.slice(0, 200)}`
      )
    }
    throw error
  }
}

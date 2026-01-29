/**
 * OpenAI Client
 *
 * Singleton OpenAI client instance for AI metadata generation.
 * Uses GPT-4o with vision capabilities to analyze pin images and article content.
 */

import OpenAI from 'openai'
import { PINTEREST_SEO_SYSTEM_PROMPT } from './prompts'

// Singleton OpenAI client instance
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Generated metadata structure from OpenAI
 */
export interface GeneratedMetadata {
  title: string
  description: string
  alt_text: string
}

/**
 * Generate Pinterest-optimized metadata for a pin
 *
 * Uses GPT-4o with vision to analyze both the article content and pin image
 * to generate SEO-optimized title, description, and alt text.
 *
 * @param articleTitle - The title of the blog article
 * @param articleContent - The full content of the blog article (will be truncated to 4000 chars)
 * @param pinImageUrl - Public URL of the pin image
 * @param systemPrompt - Optional custom system prompt (defaults to PINTEREST_SEO_SYSTEM_PROMPT)
 * @returns Generated metadata with title, description, and alt_text
 * @throws Error if OpenAI API call fails or response cannot be parsed
 */
export async function generatePinMetadata(
  articleTitle: string,
  articleContent: string,
  pinImageUrl: string,
  systemPrompt?: string
): Promise<GeneratedMetadata> {
  // Truncate article content to ~1000 tokens (4000 chars) to manage costs
  const truncatedContent = articleContent.slice(0, 4000)

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt || PINTEREST_SEO_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Article Title: ${articleTitle}\n\nArticle Content: ${truncatedContent}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: pinImageUrl,
              detail: 'auto', // Intelligent detail selection for cost efficiency
            },
          },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.7,
  })

  const responseContent = completion.choices[0].message.content

  if (!responseContent) {
    throw new Error('OpenAI returned empty response')
  }

  // Parse JSON response with error handling
  try {
    const metadata = JSON.parse(responseContent) as GeneratedMetadata

    // Validate required fields
    if (!metadata.title || !metadata.description || !metadata.alt_text) {
      throw new Error('OpenAI response missing required fields (title, description, alt_text)')
    }

    return metadata
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse OpenAI response as JSON. Response: ${responseContent.slice(0, 200)}`
      )
    }
    throw error
  }
}

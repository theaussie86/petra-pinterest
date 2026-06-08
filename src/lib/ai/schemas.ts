/**
 * Zod schemas for AI structured output (re-homed from lib/gemini, unchanged).
 *
 * Used as `generateObject` schemas so the happy path is parsed + validated
 * natively, with no manual `JSON.parse` of model output (ADR 0002 / PRD #40).
 */

import { z } from 'zod'

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

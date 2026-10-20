import { z } from 'zod'
import { getArticle, listArticles } from '@/lib/api/articles'
import { defineTool, jsonResult } from '../tool'
import { MAX_LIST_LIMIT } from './limits'

/**
 * `list_articles` — scraped articles, filtered by project, archive state and a
 * title search, offset-paginated (Spec #115, user story 20). The agent uses it
 * to find articles worth pinning. Content is omitted here (large); use
 * `get_article` for the full text.
 */
export const listArticlesTool = defineTool({
  name: 'list_articles',
  description:
    'Listet Artikel (neueste zuerst). Filter: Projekt, Archivstatus und Titel-Suche. Ohne Volltext — den liefert get_article. Paginierung über offset/limit.',
  inputSchema: {
    project_id: z.string().optional().describe('Nur Artikel dieses Projekts.'),
    archived: z
      .boolean()
      .optional()
      .describe('Weglassen oder false = nur aktive Artikel, true = nur archivierte.'),
    search: z.string().optional().describe('Teilstring-Suche im Titel (case-insensitive).'),
    offset: z.number().int().min(0).optional().describe('Startindex für die Seite. Standard 0.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIST_LIMIT)
      .optional()
      .describe(`Maximale Anzahl pro Seite (1–${MAX_LIST_LIMIT}). Standard 20.`),
  },
  handler: async ({ input, ctx }) => {
    const { articles, hasMore } = await listArticles(
      {
        projectId: input.project_id,
        archived: input.archived,
        search: input.search,
        offset: input.offset,
        limit: input.limit,
      },
      ctx.supabase,
    )
    return jsonResult({
      count: articles.length,
      has_more: hasMore,
      articles: articles.map((a) => ({
        id: a.id,
        project_id: a.blog_project_id,
        title: a.title,
        url: a.url,
        published_at: a.published_at,
        archived_at: a.archived_at,
        workshop_status: a.workshop_status,
      })),
    })
  },
})

/**
 * `get_article` — a single article including its scraped content, so the agent
 * can formulate pin metadata from it (Spec #115, user story 21).
 */
export const getArticleTool = defineTool({
  name: 'get_article',
  description:
    'Liefert einen Artikel inklusive gescraptem Volltext (content) anhand seiner ID, damit der Agent daraus Metadaten formulieren kann.',
  inputSchema: {
    article_id: z.string().describe('Die ID des Artikels.'),
  },
  handler: async ({ input, ctx }) => {
    const article = await getArticle(input.article_id, ctx.supabase)
    return jsonResult(article)
  },
})

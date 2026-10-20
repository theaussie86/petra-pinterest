import { z } from 'zod'
import { archiveArticle, getArticle, restoreArticle } from '@/lib/api/articles'
import { normalizeUrl } from '@/lib/utils'
import type { Article } from '@/types/articles'
import { defineTool, errorResult, jsonResult } from '../tool'

/**
 * Article, scraping and metadata tools for a Connected Agent (Spec #115, user
 * stories 41, 43–46; ADR-0006).
 *
 * Guardrails baked in here:
 * - No delete tool. Articles are archived/restored (reversible), never deleted —
 *   a delete would take the article's pins with it.
 * - The three enqueue tools (`scrape_blog`, `scrape_article`, `generate_metadata`)
 *   default to a dry run: they preview what would happen and only touch the
 *   tenant-checked enqueue RPCs when the caller passes `dry_run: false`.
 * - `generate_metadata` is the only MCP path that triggers Gemini; every other
 *   write tool stays Gemini-free.
 *
 * Every RPC runs through `ctx.supabase`, the agent's token-bound client, so the
 * SECURITY DEFINER enqueue functions see the user via `auth.uid()` and enforce
 * tenant ownership — no service role (ADR-0006).
 */

/**
 * `add_article` — add an article to a project by URL (Spec #115, user story 43).
 * Enqueues one `scrape_article` message via the tenant-checked RPC; the worker
 * scrapes the page and upserts the article within ~15s (ADR-0004). Adding is an
 * explicit action, so there is no dry run.
 */
export const addArticleTool = defineTool({
  name: 'add_article',
  description:
    'Fügt einem Projekt einen Artikel per URL hinzu. Stößt das Scrapen der Seite an (tenant-geprüfte Enqueue-RPC); der Artikel erscheint nach dem Scrape. Kein Probelauf.',
  inputSchema: {
    project_id: z.string().describe('ID des Blog-Projekts, zu dem der Artikel gehört.'),
    url: z.string().describe('URL des Artikels (wird normalisiert).'),
  },
  handler: async ({ input, ctx }) => {
    if (!input.url.trim()) return errorResult('url darf nicht leer sein.')
    const url = normalizeUrl(input.url)

    const { error } = await ctx.supabase.rpc('enqueue_scrape_article', {
      p_blog_project_id: input.project_id,
      p_url: url,
    })
    if (error) return errorResult(`Artikel konnte nicht hinzugefügt werden: ${error.message}`)

    return jsonResult({
      enqueued: 'scrape_article',
      project_id: input.project_id,
      url,
    })
  },
})

/**
 * `archive_article` — archive an article (Spec #115, user story 44). Reversible
 * via `restore_article`. Archiving instead of deleting keeps the article's pins
 * intact; there is deliberately no delete tool (ADR-0006).
 */
export const archiveArticleTool = defineTool({
  name: 'archive_article',
  description:
    'Archiviert einen Artikel (reversibel über restore_article). Löscht nichts — die Pins des Artikels bleiben erhalten. Es gibt bewusst kein Lösch-Tool.',
  inputSchema: {
    article_id: z.string().describe('ID des Artikels.'),
  },
  handler: async ({ input, ctx }) => {
    let article: Article
    try {
      article = await archiveArticle(input.article_id, ctx.supabase)
    } catch {
      return errorResult('Artikel nicht gefunden oder kein Zugriff.')
    }
    return jsonResult({ id: article.id, title: article.title, archived_at: article.archived_at })
  },
})

/**
 * `restore_article` — restore a previously archived article (Spec #115, user
 * story 44). The reverse of `archive_article`.
 */
export const restoreArticleTool = defineTool({
  name: 'restore_article',
  description:
    'Stellt einen archivierten Artikel wieder her (Umkehrung von archive_article).',
  inputSchema: {
    article_id: z.string().describe('ID des Artikels.'),
  },
  handler: async ({ input, ctx }) => {
    let article: Article
    try {
      article = await restoreArticle(input.article_id, ctx.supabase)
    } catch {
      return errorResult('Artikel nicht gefunden oder kein Zugriff.')
    }
    return jsonResult({ id: article.id, title: article.title, archived_at: article.archived_at })
  },
})

/**
 * `scrape_blog` — re-scrape a whole blog project (Spec #115, user story 45).
 * Dry run by default: previews the project that would be scraped and touches the
 * `enqueue_scrape_blog` RPC only on `dry_run: false`. The worker discovers the
 * sitemap and fans out into per-article scrapes (ADR-0004).
 */
export const scrapeBlogTool = defineTool({
  name: 'scrape_blog',
  description:
    'Stößt einen Blog-Scrape für ein Projekt an (Sitemap-Discovery + Fan-out in Einzelartikel). Standard ist ein Probelauf: er zeigt nur, was passieren würde. Echte Ausführung mit dry_run: false.',
  dryRun: true,
  inputSchema: {
    project_id: z.string().describe('ID des Blog-Projekts.'),
  },
  handler: async ({ input, ctx, dryRun }) => {
    if (dryRun) {
      return jsonResult({
        dry_run: true,
        would_enqueue: 'scrape_blog',
        project_id: input.project_id,
        note: 'Probelauf — nichts angestoßen. Mit dry_run: false ausführen.',
      })
    }

    const { error } = await ctx.supabase.rpc('enqueue_scrape_blog', {
      p_blog_project_id: input.project_id,
    })
    if (error) return errorResult(`Blog-Scrape konnte nicht angestoßen werden: ${error.message}`)

    return jsonResult({ enqueued: 'scrape_blog', project_id: input.project_id })
  },
})

/**
 * `scrape_article` — re-scrape a single existing article (Spec #115, user story
 * 46). Looks the article up (so the agent passes just its id) and enqueues a
 * `scrape_article` for its URL. Dry run by default; real run on `dry_run: false`.
 */
export const scrapeArticleTool = defineTool({
  name: 'scrape_article',
  description:
    'Scrapt einen bestehenden Artikel neu (anhand seiner ID). Standard ist ein Probelauf: er zeigt nur, was passieren würde. Echte Ausführung mit dry_run: false.',
  dryRun: true,
  inputSchema: {
    article_id: z.string().describe('ID des neu zu scrapenden Artikels.'),
  },
  handler: async ({ input, ctx, dryRun }) => {
    let article: Article
    try {
      article = await getArticle(input.article_id, ctx.supabase)
    } catch {
      return errorResult('Artikel nicht gefunden oder kein Zugriff.')
    }

    if (dryRun) {
      return jsonResult({
        dry_run: true,
        would_enqueue: 'scrape_article',
        article_id: article.id,
        title: article.title,
        url: article.url,
        project_id: article.blog_project_id,
        note: 'Probelauf — nichts angestoßen. Mit dry_run: false ausführen.',
      })
    }

    const { error } = await ctx.supabase.rpc('enqueue_scrape_article', {
      p_blog_project_id: article.blog_project_id,
      p_url: article.url,
    })
    if (error) return errorResult(`Artikel konnte nicht neu gescrapt werden: ${error.message}`)

    return jsonResult({
      enqueued: 'scrape_article',
      article_id: article.id,
      url: article.url,
    })
  },
})

/**
 * `generate_metadata` — explicitly request Gemini metadata generation for one or
 * more pins (Spec #115, user story 41). This is the *only* MCP path that triggers
 * Gemini; every other write tool stays Gemini-free (ADR-0006). Dry run by
 * default, so the agent can confirm the pin set before spending credits; the real
 * run goes through the tenant-checked `enqueue_generate_metadata` RPC, which sets
 * the pins to `generating_metadata` and returns how many were queued.
 */
export const generateMetadataTool = defineTool({
  name: 'generate_metadata',
  description:
    'Stößt die Gemini-Metadaten-Generierung für einen oder mehrere Pins an — der einzige MCP-Weg, der Gemini-Credits verbraucht. Standard ist ein Probelauf: er zeigt nur, welche Pins betroffen wären. Echte Ausführung mit dry_run: false.',
  dryRun: true,
  inputSchema: {
    pin_ids: z
      .array(z.string())
      .min(1)
      .describe('IDs der Pins, für die Metadaten generiert werden sollen.'),
  },
  handler: async ({ input, ctx, dryRun }) => {
    if (dryRun) {
      return jsonResult({
        dry_run: true,
        would_enqueue: 'generate_metadata',
        pin_ids: input.pin_ids,
        count: input.pin_ids.length,
        note: 'Probelauf — kein Gemini-Aufruf. Mit dry_run: false ausführen.',
      })
    }

    const { data, error } = await ctx.supabase.rpc('enqueue_generate_metadata', {
      p_pin_ids: input.pin_ids,
    })
    if (error) return errorResult(`Metadaten-Generierung konnte nicht angestoßen werden: ${error.message}`)

    return jsonResult({ enqueued: 'generate_metadata', pins_queued: (data as number) ?? 0 })
  },
})

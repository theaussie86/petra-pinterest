import { z } from 'zod'
import { getBlogProject, getBlogProjects } from '@/lib/api/blog-projects'
import { defineTool, jsonResult } from '../tool'

/**
 * `list_projects` — every Blog-Projekt the user owns. A Connected Agent calls
 * this to learn which projects it can work with (Spec #115, user story 19).
 * Runs under the caller's RLS via the shared API function (ADR-0006).
 */
export const listProjects = defineTool({
  name: 'list_projects',
  description:
    'Listet alle Blog-Projekte der Nutzerin (neueste zuerst) mit ID, Name, Blog-URL und Scraping-Rhythmus.',
  handler: async ({ ctx }) => {
    const projects = await getBlogProjects(ctx.supabase)
    return jsonResult({
      count: projects.length,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        blog_url: p.blog_url,
        sitemap_url: p.sitemap_url,
        scraping_frequency: p.scraping_frequency,
        description: p.description,
        language: p.language,
        created_at: p.created_at,
      })),
    })
  },
})

/**
 * `get_project` — one project in full, including the AI/brand context fields an
 * agent needs to write on-brand metadata (Spec #115, user story 19).
 */
export const getProject = defineTool({
  name: 'get_project',
  description:
    'Liefert ein Blog-Projekt mit allen Feldern, inklusive Marken- und KI-Kontext (Zielgruppe, Tonalität, Stil), anhand seiner ID.',
  inputSchema: {
    project_id: z.string().describe('Die ID des Blog-Projekts.'),
  },
  handler: async ({ input, ctx }) => {
    const project = await getBlogProject(input.project_id, ctx.supabase)
    return jsonResult(project)
  },
})

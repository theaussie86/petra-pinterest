export interface Article {
  id: string
  tenant_id: string
  blog_project_id: string
  title: string
  url: string
  content: string | null
  published_at: string | null
  scraped_at: string
  archived_at: string | null
  /** Pin-Werkstatt curation: null = undecided (migration 00035). */
  workshop_status: ArticleWorkshopStatus | null
  /** Optional note for the template agent, set with `wanted`. */
  workshop_note: string | null
  workshop_status_changed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Whether the external agent should write pin templates for an article:
 * `wanted` puts it in the agent's queue, `excluded` keeps it out of the
 * Werkstatt (the article stays usable elsewhere, unlike archiving).
 */
export type ArticleWorkshopStatus = 'wanted' | 'excluded'

// For manual article addition (just a URL, content scraped automatically)
export interface ArticleInsert {
  blog_project_id: string
  url: string
}

// Scrape request payload sent to server function
export interface ScrapeRequest {
  blog_project_id: string
  blog_url: string
  sitemap_url?: string | null
}

// Scrape response from server function
export interface ScrapeResponse {
  success: boolean
  articles_found: number
  articles_created: number
  articles_updated: number
  method: 'gemini-fetch' | 'single'
  errors: string[]
}

// Sort options for the articles table
export type ArticleSortField = 'title' | 'published_at' | 'scraped_at' | 'url' | 'pin_count'
export type SortDirection = 'asc' | 'desc'

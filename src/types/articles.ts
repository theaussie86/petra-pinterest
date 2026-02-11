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
  created_at: string
  updated_at: string
}

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
  rss_url?: string | null
}

// Scrape response from server function
export interface ScrapeResponse {
  success: boolean
  articles_found: number
  articles_created: number
  articles_updated: number
  method: 'firecrawl-map' | 'firecrawl' | 'single'
  errors: string[]
}

// Sort options for the articles table
export type ArticleSortField = 'title' | 'published_at' | 'scraped_at' | 'url'
export type SortDirection = 'asc' | 'desc'

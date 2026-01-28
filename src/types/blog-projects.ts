export interface BlogProject {
  id: string
  tenant_id: string
  name: string
  blog_url: string
  rss_url: string | null
  sitemap_url: string | null
  scraping_frequency: 'daily' | 'weekly' | 'manual'
  description: string | null
  created_at: string
  updated_at: string
}

export type BlogProjectInsert = Pick<BlogProject, 'name' | 'blog_url'> & {
  rss_url?: string | null
  sitemap_url?: string | null
  scraping_frequency?: 'daily' | 'weekly' | 'manual'
  description?: string | null
}

export type BlogProjectUpdate = {
  id: string
  name?: string
  blog_url?: string
  rss_url?: string | null
  sitemap_url?: string | null
  scraping_frequency?: 'daily' | 'weekly' | 'manual'
  description?: string | null
}

export interface BlogProject {
  id: string
  tenant_id: string
  name: string
  blog_url: string
  sitemap_url: string | null
  scraping_frequency: 'daily' | 'weekly' | 'manual'
  description: string | null
  language: string | null
  target_audience: string | null
  brand_voice: string | null
  visual_style: string | null
  general_keywords: string | null
  value_proposition: string | null
  style_options: string | null
  content_type: string | null
  main_motifs: string | null
  color_palette: string | null
  text_instructions: string | null
  blog_niche: string | null
  additional_instructions: string | null
  topic_context: string | null
  visual_audience: string | null
  lighting_description: string | null
  created_at: string
  updated_at: string
}

export type BlogProjectInsert = Pick<BlogProject, 'name' | 'blog_url'> & {
  sitemap_url?: string | null
  scraping_frequency?: 'daily' | 'weekly' | 'manual'
  description?: string | null
}

export type BlogProjectUpdate = {
  id: string
  name?: string
  blog_url?: string
  sitemap_url?: string | null
  scraping_frequency?: 'daily' | 'weekly' | 'manual'
  description?: string | null
  language?: string | null
  target_audience?: string | null
  brand_voice?: string | null
  visual_style?: string | null
  general_keywords?: string | null
  value_proposition?: string | null
  style_options?: string | null
  content_type?: string | null
  main_motifs?: string | null
  color_palette?: string | null
  text_instructions?: string | null
  blog_niche?: string | null
  additional_instructions?: string | null
  topic_context?: string | null
  visual_audience?: string | null
  lighting_description?: string | null
}

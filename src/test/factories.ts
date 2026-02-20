import type { Pin, PinInsert, PinMetadataGeneration } from '@/types/pins'
import type { Article } from '@/types/articles'
import type { BlogProject, BlogProjectInsert } from '@/types/blog-projects'

let counter = 0
function nextId() {
  return `test-id-${++counter}`
}

export function buildPin(overrides: Partial<Pin> = {}): Pin {
  const id = nextId()
  return {
    id,
    tenant_id: 'test-tenant-id',
    blog_project_id: 'project-1',
    blog_article_id: 'article-1',
    pinterest_board_id: null,
    pinterest_board_name: null,
    image_path: `test-tenant-id/${id}.png`,
    media_type: 'image',
    title: 'Test Pin Title',
    description: 'Test pin description',
    alt_text: 'Test alt text',
    alternate_url: null,
    status: 'draft',
    error_message: null,
    previous_status: null,
    scheduled_at: null,
    published_at: null,
    pinterest_pin_id: null,
    pinterest_pin_url: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

export function buildPinInsert(overrides: Partial<PinInsert> = {}): PinInsert {
  return {
    blog_project_id: 'project-1',
    blog_article_id: 'article-1',
    image_path: `test-tenant-id/${nextId()}.png`,
    ...overrides,
  }
}

export function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: nextId(),
    tenant_id: 'test-tenant-id',
    blog_project_id: 'project-1',
    title: 'Test Article',
    url: 'https://example.com/article',
    content: 'Article content here',
    published_at: '2025-01-01T00:00:00Z',
    scraped_at: '2025-01-01T00:00:00Z',
    archived_at: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

export function buildBlogProject(overrides: Partial<BlogProject> = {}): BlogProject {
  return {
    id: nextId(),
    tenant_id: 'test-tenant-id',
    name: 'Test Blog',
    blog_url: 'https://example.com',
    sitemap_url: null,
    scraping_frequency: 'manual',
    description: null,
    language: null,
    target_audience: null,
    brand_voice: null,
    visual_style: null,
    general_keywords: null,
    value_proposition: null,
    style_options: null,
    content_type: null,
    main_motifs: null,
    color_palette: null,
    text_instructions: null,
    blog_niche: null,
    additional_instructions: null,
    topic_context: null,
    visual_audience: null,
    lighting_description: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

export function buildBlogProjectInsert(overrides: Partial<BlogProjectInsert> = {}): BlogProjectInsert {
  return {
    name: 'Test Blog',
    blog_url: 'https://example.com',
    ...overrides,
  }
}

export function buildMetadataGeneration(overrides: Partial<PinMetadataGeneration> = {}): PinMetadataGeneration {
  return {
    id: nextId(),
    pin_id: 'pin-1',
    tenant_id: 'test-tenant-id',
    title: 'Generated Title',
    description: 'Generated description for Pinterest',
    alt_text: 'Generated alt text',
    feedback: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

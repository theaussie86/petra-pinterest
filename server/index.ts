import express from 'express'
import cors from 'cors'
import { serve } from 'inngest/express'
import { inngest, functions } from './inngest'
import { createClient } from '@supabase/supabase-js'
import { scrapeRss, scrapeHtml, scrapeSingleUrl } from './inngest/functions/scrape-blog'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())
app.use(cors({
  origin: ['http://localhost:3000', process.env.CLIENT_ORIGIN || ''].filter(Boolean),
  credentials: true,
}))

// Inngest serve endpoint
app.use('/api/inngest', serve({ client: inngest, functions }))

// Helper: verify Supabase auth token and get user info
async function verifyAuth(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    throw new Error('Invalid auth token')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new Error('Profile not found')
  }

  return { user, tenant_id: profile.tenant_id }
}

// POST /api/scrape — Full blog scrape
app.post('/api/scrape', async (req, res) => {
  try {
    const { user: _, tenant_id } = await verifyAuth(req.headers.authorization)
    const { blog_project_id, blog_url, rss_url } = req.body

    if (!blog_project_id || !blog_url) {
      return res.status(400).json({
        success: false,
        errors: ['blog_project_id and blog_url are required']
      })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let articles: { title: string; url: string; content?: string; published_at?: string }[] = []
    let method: 'rss' | 'html' = 'html'
    const errors: string[] = []

    try {
      articles = await scrapeRss(blog_url, rss_url || undefined)
      if (articles.length > 0) method = 'rss'
    } catch (error) {
      errors.push(`RSS failed: ${String(error)}`)
    }

    if (articles.length === 0) {
      try {
        articles = await scrapeHtml(blog_url)
        method = 'html'
      } catch (error) {
        errors.push(`HTML scraping failed: ${String(error)}`)
      }
    }

    if (articles.length === 0) {
      return res.json({
        success: false,
        articles_found: 0,
        articles_created: 0,
        articles_updated: 0,
        method,
        errors: errors.length > 0 ? errors : ['No articles found'],
      })
    }

    let created = 0
    let updated = 0

    for (const article of articles) {
      try {
        const { data: existing } = await supabase
          .from('blog_articles')
          .select('id')
          .eq('blog_project_id', blog_project_id)
          .eq('url', article.url)
          .single()

        const { error: upsertError } = await supabase
          .from('blog_articles')
          .upsert({
            tenant_id,
            blog_project_id,
            title: article.title,
            url: article.url,
            content: article.content,
            published_at: article.published_at,
            scraped_at: new Date().toISOString(),
          }, { onConflict: 'blog_project_id,url' })

        if (upsertError) {
          errors.push(`Failed to upsert ${article.url}: ${upsertError.message}`)
        } else {
          if (existing) updated++
          else created++
        }
      } catch (error) {
        errors.push(`Error processing ${article.url}: ${String(error)}`)
      }
    }

    res.json({
      success: true,
      articles_found: articles.length,
      articles_created: created,
      articles_updated: updated,
      method,
      errors,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(message.includes('auth') || message.includes('token') ? 401 : 500)
      .json({ success: false, errors: [message] })
  }
})

// POST /api/scrape/single — Single article scrape
app.post('/api/scrape/single', async (req, res) => {
  try {
    const { user: _, tenant_id } = await verifyAuth(req.headers.authorization)
    const { blog_project_id, url } = req.body

    if (!blog_project_id || !url) {
      return res.status(400).json({
        success: false,
        errors: ['blog_project_id and url are required']
      })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const article = await scrapeSingleUrl(url)

    const { error: upsertError } = await supabase
      .from('blog_articles')
      .upsert({
        tenant_id,
        blog_project_id,
        title: article.title,
        url: article.url,
        content: article.content,
        published_at: article.published_at,
        scraped_at: new Date().toISOString(),
      }, { onConflict: 'blog_project_id,url' })

    if (upsertError) {
      return res.status(500).json({
        success: false,
        errors: [upsertError.message],
      })
    }

    res.json({
      success: true,
      articles_found: 1,
      articles_created: 1,
      articles_updated: 0,
      method: 'single',
      errors: [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(message.includes('auth') || message.includes('token') ? 401 : 500)
      .json({ success: false, errors: [message] })
  }
})

app.listen(PORT, () => {
  console.log(`Scraping server running on http://localhost:${PORT}`)
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`)
})

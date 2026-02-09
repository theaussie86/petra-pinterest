#!/usr/bin/env tsx
/**
 * Verify Article Migration
 * Quick verification script to check article migration results
 */

import { supabaseAdmin } from './lib/supabase-admin'

async function verifyArticles() {
  console.log('=== Article Migration Verification ===\n')

  // 1. Count total articles
  const { count: totalArticles } = await supabaseAdmin
    .from('blog_articles')
    .select('*', { count: 'exact', head: true })

  console.log(`Total articles: ${totalArticles}\n`)

  // 2. Show sample articles with project relationship
  const { data: sampleArticles } = await supabaseAdmin
    .from('blog_articles')
    .select(`
      id,
      title,
      url,
      blog_projects (name)
    `)
    .limit(5)

  console.log('Sample articles with project:')
  sampleArticles?.forEach((article: any) => {
    console.log(`  - ${article.title} (${article.blog_projects?.name})`)
  })
  console.log()

  // 3. Verify content is not truncated
  const { data: articlesWithContent } = await supabaseAdmin
    .from('blog_articles')
    .select('id, title, content')
    .not('content', 'is', null)
    .limit(3)

  console.log('Article content lengths:')
  articlesWithContent?.forEach((article: any) => {
    const contentLength = article.content?.length || 0
    console.log(`  - ${article.title.substring(0, 50)}: ${contentLength} chars`)
  })
  console.log()

  // 4. Check articles by project
  const { data: projects } = await supabaseAdmin
    .from('blog_projects')
    .select(`
      name,
      blog_articles (count)
    `)

  console.log('Articles by project:')
  projects?.forEach((project: any) => {
    const count = project.blog_articles?.[0]?.count || 0
    console.log(`  - ${project.name}: ${count} articles`)
  })
  console.log()

  console.log('=== Verification Complete ===')
}

verifyArticles()

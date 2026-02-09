#!/usr/bin/env tsx
import { supabaseAdmin } from './lib/supabase-admin'

async function verify() {
  console.log('=== Board Migration Verification ===\n')

  // Sample of boards
  const { data: sample, error: sampleError } = await supabaseAdmin
    .from('boards')
    .select('id, name, pinterest_board_id, blog_project_id')
    .limit(5)

  console.log('Sample boards (first 5):')
  if (sampleError) {
    console.error('Error:', sampleError)
  } else {
    console.table(sample)
  }

  // Count with pinterest_board_id
  const { data: counts, error: countError } = await supabaseAdmin
    .from('boards')
    .select('pinterest_board_id')

  console.log('\nPinterest ID stats:')
  if (countError) {
    console.error('Error:', countError)
  } else {
    const total = counts.length
    const withPinterestId = counts.filter(b => b.pinterest_board_id !== null).length
    console.log(`  Total boards: ${total}`)
    console.log(`  With pinterest_board_id: ${withPinterestId}`)
    console.log(`  Without pinterest_board_id: ${total - withPinterestId}`)
  }

  // Verify project FKs
  const { data: projectCheck, error: projectError } = await supabaseAdmin
    .from('boards')
    .select('blog_project_id, blog_projects!inner(name)')
    .limit(5)

  console.log('\nProject FK verification (first 5):')
  if (projectError) {
    console.error('Error:', projectError)
  } else {
    projectCheck.forEach((b: any) => {
      console.log(`  Project: ${b.blog_projects.name}`)
    })
  }

  // Check cover images
  const { data: coverCheck } = await supabaseAdmin
    .from('boards')
    .select('cover_image_url')

  const withCover = coverCheck?.filter(b => b.cover_image_url !== null).length || 0
  console.log(`\nCover images: ${withCover} boards have cover_image_url`)

  console.log('\n=== Verification Complete ===')
}

verify()

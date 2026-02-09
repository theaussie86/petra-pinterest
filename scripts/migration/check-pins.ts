#!/usr/bin/env tsx
/**
 * Quick check script for pin migration status
 */
import { supabaseAdmin } from './lib/supabase-admin'

async function checkPins() {
  // Count total pins
  const { count } = await supabaseAdmin
    .from('pins')
    .select('*', { count: 'exact', head: true })

  console.log(`Total pins in database: ${count}`)

  // Sample 5 pins
  const { data: sample } = await supabaseAdmin
    .from('pins')
    .select('id, title, status, image_path, blog_article_id, pinterest_board_id')
    .limit(5)

  console.log('\nSample pins:')
  console.log(JSON.stringify(sample, null, 2))

  // Count by status
  const { data: statusCounts } = await supabaseAdmin
    .from('pins')
    .select('status')

  const statusMap = new Map<string, number>()
  statusCounts?.forEach((pin) => {
    statusMap.set(pin.status, (statusMap.get(pin.status) || 0) + 1)
  })

  console.log('\nPins by status:')
  statusMap.forEach((count, status) => {
    console.log(`  ${status}: ${count}`)
  })

  // Count images in storage
  const { data: images } = await supabaseAdmin.storage
    .from('pin-images')
    .list('300aacb4-3625-4251-9240-1a64ccbecb1d')

  console.log(`\nImages in storage: ${images?.length || 0}`)
}

checkPins()

#!/usr/bin/env tsx
/**
 * Cleanup: Remove orphaned images from pin-images bucket
 *
 * Compares all files in Supabase Storage against actual pin records.
 * Any image without a matching pin.image_path is deleted.
 *
 * Usage:
 *   npx tsx scripts/migration/cleanup-orphaned-images.ts            # dry run (default)
 *   npx tsx scripts/migration/cleanup-orphaned-images.ts --confirm  # actually delete
 */

import { supabaseAdmin } from './lib/supabase-admin'
import { getTenantId } from './lib/helpers'

const CONFIRM = process.argv.includes('--confirm')
const BUCKET = 'pin-images'

/**
 * List all files in the bucket under a prefix (with pagination)
 */
async function listAllFiles(prefix: string): Promise<string[]> {
  const paths: string[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, { limit, offset })

    if (error) {
      console.error(`Error listing files:`, error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      paths.push(`${prefix}/${item.name}`)
    }

    if (data.length < limit) break
    offset += limit
  }

  return paths
}

/**
 * Fetch all pin image_path values from the database (with pagination)
 */
async function fetchAllPinImagePaths(): Promise<Set<string>> {
  const paths = new Set<string>()
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('pins')
      .select('image_path')
      .not('image_path', 'is', null)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('Failed to fetch pins:', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const pin of data) {
      paths.add(pin.image_path)
    }

    if (data.length < pageSize) break
    from += pageSize
  }

  return paths
}

async function main() {
  console.log('=== Orphaned Pin Images Cleanup ===\n')

  if (!CONFIRM) {
    console.log('DRY RUN — pass --confirm to actually delete\n')
  }

  const tenantId = getTenantId()
  console.log(`Tenant: ${tenantId}\n`)

  // 1. Get all image_paths from pins table
  console.log('Fetching pin image paths from database...')
  const pinPaths = await fetchAllPinImagePaths()
  console.log(`Pins with image_path: ${pinPaths.size}`)

  // 2. List all files in storage bucket
  console.log('Listing files in storage bucket...')
  const storageFiles = await listAllFiles(tenantId)
  console.log(`Files in storage: ${storageFiles.length}\n`)

  // 3. Find orphans
  const orphaned = storageFiles.filter((f) => !pinPaths.has(f))
  const referenced = storageFiles.length - orphaned.length

  console.log(`Referenced by a pin: ${referenced}`)
  console.log(`Orphaned (no matching pin): ${orphaned.length}\n`)

  if (orphaned.length === 0) {
    console.log('No orphaned images found. Nothing to do.')
    return
  }

  // Show sample
  const sample = orphaned.slice(0, 10)
  console.log(`Sample orphaned files:`)
  for (const f of sample) {
    console.log(`  ${f}`)
  }
  if (orphaned.length > 10) {
    console.log(`  ... and ${orphaned.length - 10} more`)
  }

  if (!CONFIRM) {
    console.log(`\n[DRY RUN] Would delete ${orphaned.length} orphaned files`)
    console.log('\n=== Done ===\n')
    return
  }

  // 4. Delete in batches of 100
  console.log(`\nDeleting ${orphaned.length} orphaned files...`)
  const batchSize = 100
  let deleted = 0
  let errors = 0

  for (let i = 0; i < orphaned.length; i += batchSize) {
    const batch = orphaned.slice(i, i + batchSize)
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(batch)

    if (error) {
      console.error(`Batch ${i / batchSize + 1} failed:`, error.message)
      errors += batch.length
    } else {
      deleted += batch.length
      console.log(`  Deleted ${deleted}/${orphaned.length}...`)
    }
  }

  console.log(`\nDeleted: ${deleted}`)
  if (errors > 0) console.log(`Errors: ${errors}`)
  console.log('\n=== Done ===\n')
}

main()

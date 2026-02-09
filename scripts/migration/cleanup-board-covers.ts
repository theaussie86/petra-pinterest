#!/usr/bin/env tsx
/**
 * Cleanup: Remove board-covers bucket from Supabase Storage
 *
 * The boards table was removed — board info is now stored directly on pins.
 * This script deletes all files in the board-covers bucket, then the bucket itself.
 *
 * Usage:
 *   npx tsx scripts/migration/cleanup-board-covers.ts            # dry run (default)
 *   npx tsx scripts/migration/cleanup-board-covers.ts --confirm  # actually delete
 */

import { supabaseAdmin } from './lib/supabase-admin'

const CONFIRM = process.argv.includes('--confirm')
const BUCKET = 'board-covers'

async function listAllFiles(prefix = ''): Promise<string[]> {
  const paths: string[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(prefix, { limit, offset })

    if (error) {
      console.error(`Error listing files (prefix="${prefix}"):`, error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const item of data) {
      if (item.name === '.emptyFolderPlaceholder') continue
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name

      if (item.id === null) {
        // It's a folder — recurse
        const nested = await listAllFiles(fullPath)
        paths.push(...nested)
      } else {
        paths.push(fullPath)
      }
    }

    if (data.length < limit) break
    offset += limit
  }

  return paths
}

async function main() {
  console.log(`=== Board-Covers Bucket Cleanup ===\n`)

  if (!CONFIRM) {
    console.log('DRY RUN — pass --confirm to actually delete\n')
  }

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) {
    console.error('Failed to list buckets:', listError.message)
    process.exit(1)
  }

  const bucketExists = buckets?.some((b) => b.id === BUCKET)
  if (!bucketExists) {
    console.log(`Bucket "${BUCKET}" does not exist. Nothing to do.`)
    return
  }

  // List all files
  console.log('Listing files...')
  const files = await listAllFiles()

  if (files.length === 0) {
    console.log('No files found in bucket.')
  } else {
    console.log(`Found ${files.length} files:\n`)
    for (const f of files) {
      console.log(`  ${f}`)
    }

    if (CONFIRM) {
      console.log(`\nDeleting ${files.length} files...`)
      const { error: deleteError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(files)

      if (deleteError) {
        console.error('Delete failed:', deleteError.message)
        process.exit(1)
      }
      console.log('Files deleted.')
    }
  }

  // Delete bucket
  if (CONFIRM) {
    console.log(`\nDeleting bucket "${BUCKET}"...`)
    // Bucket must be emptied first (done above)
    const { error: bucketError } = await supabaseAdmin.storage.deleteBucket(BUCKET)
    if (bucketError) {
      console.error('Bucket delete failed:', bucketError.message)
      process.exit(1)
    }
    console.log('Bucket deleted.')
  } else {
    console.log(`\n[DRY RUN] Would delete ${files.length} files and bucket "${BUCKET}"`)
  }

  console.log('\n=== Done ===\n')
}

main()

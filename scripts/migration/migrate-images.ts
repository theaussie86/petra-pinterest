#!/usr/bin/env tsx
/**
 * Board Cover & Brand Kit Migration Script
 * Downloads board cover images and brand kit files from Airtable,
 * uploads them to Supabase Storage, and updates board cover_image_url.
 *
 * Usage: npx tsx scripts/migration/migrate-images.ts [--force] [--dry-run]
 *
 * Prerequisites:
 * - migrate-projects.ts and migrate-boards.ts must have run first
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
 */

import { fetchAllRecords, TABLES } from './lib/airtable-client'
import { supabaseAdmin } from './lib/supabase-admin'
import {
  getTenantId,
  downloadFile,
  uploadToStorage,
  sleep,
  getFileExtension,
} from './lib/helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface IdMaps {
  projects: Record<string, string>
  articles: Record<string, string>
  boards: Record<string, string>
  pins: Record<string, string>
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

const FORCE = process.argv.includes('--force')
const DRY_RUN = process.argv.includes('--dry-run')

function loadIdMaps(): IdMaps {
  if (!fs.existsSync(ID_MAPS_PATH)) {
    throw new Error(
      `ID mapping file not found at ${ID_MAPS_PATH}. Run migrate-projects.ts and migrate-boards.ts first.`
    )
  }
  const content = fs.readFileSync(ID_MAPS_PATH, 'utf-8')
  return JSON.parse(content)
}

/**
 * Load existing filenames from a storage bucket (single batch call)
 */
async function loadExistingFiles(
  bucket: string,
  prefix: string
): Promise<Set<string>> {
  const existing = new Set<string>()
  try {
    let offset = 0
    const limit = 1000
    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(prefix, { limit, offset })

      if (error) {
        console.error(`Error listing ${bucket} files:`, error)
        break
      }
      if (!data || data.length === 0) break

      for (const file of data) {
        existing.add(`${prefix}/${file.name}`)
      }

      if (data.length < limit) break
      offset += limit
    }
  } catch (error) {
    console.error(`Error loading existing files from ${bucket}:`, error)
  }
  return existing
}

/**
 * Load existing files in nested directories (for brand-kit: tenant/project/*)
 */
async function loadExistingBrandKitFiles(
  tenantId: string,
  projectIds: string[]
): Promise<Set<string>> {
  const existing = new Set<string>()
  for (const projectId of projectIds) {
    const prefix = `${tenantId}/${projectId}`
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('brand-kit')
        .list(prefix, { limit: 1000 })

      if (error) continue
      if (!data) continue

      for (const file of data) {
        existing.add(`${prefix}/${file.name}`)
      }
    } catch {
      // Folder may not exist yet
    }
  }
  return existing
}

/**
 * Migrate board cover images
 */
async function migrateBoardCovers(
  tenantId: string,
  idMaps: IdMaps
): Promise<{ uploaded: number; skipped: number; errors: number }> {
  console.log('\n--- Board Cover Images ---\n')

  const stats = { uploaded: 0, skipped: 0, errors: 0 }

  // Load existing files from Storage
  const existingFiles = await loadExistingFiles('board-covers', tenantId)
  console.log(`Found ${existingFiles.size} existing board cover files\n`)

  // Fetch all boards from Airtable
  console.log('Fetching boards from Airtable...')
  const airtableRecords = await fetchAllRecords(TABLES.BOARDS)
  console.log(`Fetched ${airtableRecords.length} board records\n`)

  const supabaseUrl = process.env.SUPABASE_URL!

  for (let i = 0; i < airtableRecords.length; i++) {
    const record = airtableRecords[i]
    const name = record.fields['Name'] || record.id

    // Check for cover attachment
    const coverAttachments = record.fields['Cover']
    if (
      !coverAttachments ||
      !Array.isArray(coverAttachments) ||
      coverAttachments.length === 0
    ) {
      continue // No cover image, skip silently
    }

    // Look up Supabase board ID
    const boardId = idMaps.boards[record.id]
    if (!boardId) {
      console.warn(`⚠ Board "${name}" not in id-maps, skipping cover`)
      stats.skipped++
      continue
    }

    const attachment = coverAttachments[0]
    const ext = getFileExtension(attachment.filename)
    const storagePath = `${tenantId}/${boardId}.${ext}`

    const shouldUpload = FORCE || !existingFiles.has(storagePath)

    if (!shouldUpload) {
      // File exists, just update the URL in case it's still pointing to Airtable
      if (!DRY_RUN) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/board-covers/${storagePath}`
        await supabaseAdmin
          .from('boards')
          .update({ cover_image_url: publicUrl })
          .eq('id', boardId)
      }
      stats.skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would upload cover for: ${name}`)
      stats.uploaded++
      continue
    }

    // Download from Airtable CDN
    const buffer = await downloadFile(attachment.url)
    if (!buffer) {
      console.error(`✗ Download failed for cover: ${name}`)
      stats.errors++
      continue
    }

    // Determine content type
    const extLower = ext.toLowerCase()
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const contentType = contentTypeMap[extLower] || 'image/jpeg'

    // Upload to Supabase Storage
    const publicUrl = await uploadToStorage(
      'board-covers',
      storagePath,
      buffer,
      contentType
    )

    if (!publicUrl) {
      console.error(`✗ Upload failed for cover: ${name}`)
      stats.errors++
      continue
    }

    // Update board record with Supabase Storage URL
    const { error: updateError } = await supabaseAdmin
      .from('boards')
      .update({ cover_image_url: publicUrl })
      .eq('id', boardId)

    if (updateError) {
      console.error(
        `✗ Failed to update cover_image_url for ${name}: ${updateError.message}`
      )
      stats.errors++
      continue
    }

    stats.uploaded++
    console.log(`✓ Uploaded cover: ${name}`)
    await sleep(200)
  }

  return stats
}

/**
 * Migrate brand kit files
 */
async function migrateBrandKitFiles(
  tenantId: string,
  idMaps: IdMaps
): Promise<{ uploaded: number; skipped: number; errors: number }> {
  console.log('\n--- Brand Kit Files ---\n')

  const stats = { uploaded: 0, skipped: 0, errors: 0 }

  // Load existing brand kit files
  const projectIds = Object.values(idMaps.projects)
  const existingFiles = await loadExistingBrandKitFiles(tenantId, projectIds)
  console.log(`Found ${existingFiles.size} existing brand kit files\n`)

  // Fetch all projects from Airtable
  console.log('Fetching projects from Airtable...')
  const airtableRecords = await fetchAllRecords(TABLES.BLOG_PROJEKTE)
  console.log(`Fetched ${airtableRecords.length} project records\n`)

  for (const record of airtableRecords) {
    const name = record.fields['Name'] || record.id

    // Check for brand kit attachments
    const brandKitAttachments = record.fields['Brand Kit']
    if (
      !brandKitAttachments ||
      !Array.isArray(brandKitAttachments) ||
      brandKitAttachments.length === 0
    ) {
      continue // No brand kit, skip silently
    }

    // Look up Supabase project ID
    const projectId = idMaps.projects[record.id]
    if (!projectId) {
      console.warn(`⚠ Project "${name}" not in id-maps, skipping brand kit`)
      stats.skipped++
      continue
    }

    // Process each attachment
    for (const attachment of brandKitAttachments) {
      const filename = attachment.filename
      const storagePath = `${tenantId}/${projectId}/${filename}`

      const shouldUpload = FORCE || !existingFiles.has(storagePath)

      if (!shouldUpload) {
        stats.skipped++
        continue
      }

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would upload brand kit: ${name}/${filename}`)
        stats.uploaded++
        continue
      }

      // Download from Airtable CDN
      const buffer = await downloadFile(attachment.url)
      if (!buffer) {
        console.error(`✗ Download failed: ${name}/${filename}`)
        stats.errors++
        continue
      }

      // Determine content type from extension
      const ext = getFileExtension(filename).toLowerCase()
      const contentTypeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        pdf: 'application/pdf',
        svg: 'image/svg+xml',
        ai: 'application/postscript',
        eps: 'application/postscript',
        zip: 'application/zip',
      }
      const contentType = contentTypeMap[ext] || 'application/octet-stream'

      const publicUrl = await uploadToStorage(
        'brand-kit',
        storagePath,
        buffer,
        contentType
      )

      if (!publicUrl) {
        console.error(`✗ Upload failed: ${name}/${filename}`)
        stats.errors++
        continue
      }

      stats.uploaded++
      console.log(`✓ Uploaded: ${name}/${filename}`)
      await sleep(200)
    }
  }

  return stats
}

async function main() {
  console.log('=== Starting Image Migration ===\n')

  if (DRY_RUN) console.log('DRY RUN MODE - No changes will be made\n')
  if (FORCE) console.log('FORCE MODE - Re-uploading all files\n')

  const tenantId = getTenantId()
  console.log(`Target tenant: ${tenantId}`)

  const idMaps = loadIdMaps()
  const boardCount = Object.keys(idMaps.boards).length
  const projectCount = Object.keys(idMaps.projects).length

  if (boardCount === 0) {
    throw new Error('No board mappings found. Run migrate-boards.ts first.')
  }
  if (projectCount === 0) {
    throw new Error('No project mappings found. Run migrate-projects.ts first.')
  }

  console.log(`Found ${boardCount} board mappings, ${projectCount} project mappings`)

  // Migrate board covers
  const coverStats = await migrateBoardCovers(tenantId, idMaps)

  // Migrate brand kit files
  const brandKitStats = await migrateBrandKitFiles(tenantId, idMaps)

  // Summary
  console.log('\n=== Image Migration Complete ===')
  console.log(
    `Board covers: ${coverStats.uploaded} uploaded, ${coverStats.skipped} skipped, ${coverStats.errors} errors`
  )
  console.log(
    `Brand kit files: ${brandKitStats.uploaded} uploaded, ${brandKitStats.skipped} skipped, ${brandKitStats.errors} errors`
  )
  console.log('=====================================\n')
}

main()

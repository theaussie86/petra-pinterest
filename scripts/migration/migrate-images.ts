#!/usr/bin/env tsx
/**
 * Brand Kit Migration Script
 * Downloads brand kit files from Airtable and uploads them to Supabase Storage.
 *
 * Usage: npx tsx scripts/migration/migrate-images.ts [--force] [--dry-run]
 *
 * Prerequisites:
 * - migrate-projects.ts must have run first
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
  pins: Record<string, string>
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

const FORCE = process.argv.includes('--force')
const DRY_RUN = process.argv.includes('--dry-run')

function loadIdMaps(): IdMaps {
  if (!fs.existsSync(ID_MAPS_PATH)) {
    throw new Error(
      `ID mapping file not found at ${ID_MAPS_PATH}. Run migrate-projects.ts first.`
    )
  }
  const content = fs.readFileSync(ID_MAPS_PATH, 'utf-8')
  return JSON.parse(content)
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
  console.log('=== Starting Brand Kit Migration ===\n')

  if (DRY_RUN) console.log('DRY RUN MODE - No changes will be made\n')
  if (FORCE) console.log('FORCE MODE - Re-uploading all files\n')

  const tenantId = getTenantId()
  console.log(`Target tenant: ${tenantId}`)

  const idMaps = loadIdMaps()
  const projectCount = Object.keys(idMaps.projects).length

  if (projectCount === 0) {
    throw new Error('No project mappings found. Run migrate-projects.ts first.')
  }

  console.log(`Found ${projectCount} project mappings`)

  // Migrate brand kit files
  const brandKitStats = await migrateBrandKitFiles(tenantId, idMaps)

  // Summary
  console.log('\n=== Brand Kit Migration Complete ===')
  console.log(
    `Brand kit files: ${brandKitStats.uploaded} uploaded, ${brandKitStats.skipped} skipped, ${brandKitStats.errors} errors`
  )
  console.log('=====================================\n')
}

main()

/**
 * Shared Migration Helpers
 * Common utilities for file download, storage upload, logging, etc.
 */

import { supabaseAdmin } from './supabase-admin'

/**
 * Download a file from a URL (e.g., Airtable CDN)
 * @param url - File URL to download
 * @returns Buffer containing file data, or null on error
 */
export async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`Failed to download file from ${url}: ${response.statusText}`)
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error)
    return null
  }
}

/**
 * Upload a file to Supabase Storage
 * @param bucket - Storage bucket name
 * @param path - File path within bucket (e.g., "tenant_id/filename.jpg")
 * @param buffer - File data
 * @param contentType - MIME type (e.g., "image/jpeg")
 * @returns Public URL on success, null on error
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      })

    if (error) {
      console.error(`Storage upload error for ${path}:`, error)
      return null
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error(`Error uploading to storage (${bucket}/${path}):`, error)
    return null
  }
}

/**
 * Log migration result summary
 * @param entity - Entity type (e.g., "Blog Projects", "Pins")
 * @param stats - Migration statistics
 */
export function logMigrationResult(
  entity: string,
  stats: {
    created: number
    updated: number
    skipped: number
    errors: string[]
  }
): void {
  console.log(`\n=== ${entity} Migration Complete ===`)
  console.log(`Created: ${stats.created}`)
  console.log(`Updated: ${stats.updated}`)
  console.log(`Skipped: ${stats.skipped}`)

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`)
    stats.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`)
    })
  }
  console.log('=====================================\n')
}

/**
 * Sleep for a specified duration (for rate limiting)
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extract file extension from filename
 * @param filename - Filename with extension
 * @returns Extension without dot (e.g., "jpg", "png")
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

/**
 * Get the tenant ID for the migration
 * @returns Tenant UUID from environment variable
 */
export function getTenantId(): string {
  const tenantId = process.env.MIGRATION_TENANT_ID
  if (!tenantId) {
    throw new Error('MIGRATION_TENANT_ID environment variable is not set')
  }
  return tenantId
}

/**
 * Load existing brand kit files from Storage for given projects
 * @param tenantId - Tenant UUID
 * @param projectIds - Array of Supabase project UUIDs
 * @returns Set of existing storage paths (e.g., "tenantId/projectId/filename.png")
 */
export async function loadExistingBrandKitFiles(
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

      if (error || !data) continue

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
 * Migrate brand kit attachments for a single Airtable project record
 * @param record - Airtable record with 'Brand Kit' attachment field
 * @param projectId - Supabase project UUID
 * @param tenantId - Tenant UUID
 * @param existingFiles - Set of existing storage paths (from loadExistingBrandKitFiles)
 * @param force - Re-upload even if file already exists
 * @param dryRun - Log actions without making changes
 * @returns Upload stats
 */
export async function migrateBrandKitForProject(
  record: any,
  projectId: string,
  tenantId: string,
  existingFiles: Set<string>,
  force: boolean,
  dryRun: boolean
): Promise<{ uploaded: number; skipped: number; errors: number }> {
  const stats = { uploaded: 0, skipped: 0, errors: 0 }
  const name = record.fields['Name'] || record.id

  const brandKitAttachments = record.fields['Brand Kit']
  if (
    !brandKitAttachments ||
    !Array.isArray(brandKitAttachments) ||
    brandKitAttachments.length === 0
  ) {
    return stats
  }

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

  for (const attachment of brandKitAttachments) {
    const filename = attachment.filename
    const storagePath = `${tenantId}/${projectId}/${filename}`

    const shouldUpload = force || !existingFiles.has(storagePath)

    if (!shouldUpload) {
      stats.skipped++
      continue
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would upload brand kit: ${name}/${filename}`)
      stats.uploaded++
      continue
    }

    const buffer = await downloadFile(attachment.url)
    if (!buffer) {
      console.error(`✗ Brand kit download failed: ${name}/${filename}`)
      stats.errors++
      continue
    }

    const ext = getFileExtension(filename).toLowerCase()
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    const publicUrl = await uploadToStorage(
      'brand-kit',
      storagePath,
      buffer,
      contentType
    )

    if (!publicUrl) {
      console.error(`✗ Brand kit upload failed: ${name}/${filename}`)
      stats.errors++
      continue
    }

    stats.uploaded++
    console.log(`  ✓ Brand kit: ${name}/${filename}`)
    await sleep(200)
  }

  return stats
}

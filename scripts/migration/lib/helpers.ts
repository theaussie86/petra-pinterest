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

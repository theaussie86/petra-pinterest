#!/usr/bin/env tsx
/**
 * Pin Migration Script
 * Migrates pins from Airtable to Supabase with image upload to Supabase Storage
 *
 * Usage: npx tsx scripts/migration/migrate-pins.ts [--force-images] [--dry-run]
 *
 * Prerequisites:
 * - migrate-projects.ts and migrate-articles.ts must have run first
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
 */

import { fetchAllRecords, TABLES } from './lib/airtable-client'
import { supabaseAdmin } from './lib/supabase-admin'
import {
  logMigrationResult,
  getTenantId,
  downloadFile,
  uploadToStorage,
  sleep,
  getFileExtension,
} from './lib/helpers'
import { PIN_STATUS_MAP } from './lib/field-maps'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ID mapping file structure
interface IdMaps {
  projects: Record<string, string> // airtableId -> supabaseUUID
  articles: Record<string, string>
  pins: Record<string, string>
}

// Airtable board info resolved for direct storage on pins
interface AirtableBoardInfo {
  pinterest_board_id: string | null
  name: string
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

// CLI flags
const FORCE_IMAGES = process.argv.includes('--force-images')
const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Load ID mapping file
 */
function loadIdMaps(): IdMaps {
  if (!fs.existsSync(ID_MAPS_PATH)) {
    throw new Error(
      `ID mapping file not found at ${ID_MAPS_PATH}. Run migrate-projects.ts and migrate-articles.ts first.`
    )
  }

  const content = fs.readFileSync(ID_MAPS_PATH, 'utf-8')
  return JSON.parse(content)
}

/**
 * Save ID mapping file
 */
function saveIdMaps(idMaps: IdMaps): void {
  fs.writeFileSync(ID_MAPS_PATH, JSON.stringify(idMaps, null, 2), 'utf-8')
}

/**
 * Get or create Supabase UUID for a pin
 */
function getSupabaseId(idMaps: IdMaps, airtableId: string): string {
  if (!idMaps.pins[airtableId]) {
    idMaps.pins[airtableId] = uuidv4()
  }
  return idMaps.pins[airtableId]
}

/**
 * Load existing image filenames from Storage (single batch call)
 */
async function loadExistingImages(tenantId: string): Promise<Set<string>> {
  const existing = new Set<string>()
  try {
    let offset = 0
    const limit = 1000
    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from('pin-images')
        .list(tenantId, { limit, offset })

      if (error) {
        console.error(`Error listing storage files:`, error)
        break
      }

      if (!data || data.length === 0) break

      for (const file of data) {
        existing.add(`${tenantId}/${file.name}`)
      }

      if (data.length < limit) break
      offset += limit
    }
  } catch (error) {
    console.error(`Error loading existing images:`, error)
  }
  return existing
}

/**
 * Map Airtable pin record to Supabase schema
 */
function mapPinRecord(
  record: any,
  tenantId: string,
  pinId: string,
  idMaps: IdMaps,
  articleProjectMap: Map<string, string>,
  airtableBoardMap: Map<string, AirtableBoardInfo>
): { data: any; error: string | null; imagePath: string | null } {
  const fields = record.fields

  // FK 1: blog_article_id (NOT NULL - required)
  const airtableArticleIds = fields['Blog Artikel']
  if (
    !airtableArticleIds ||
    !Array.isArray(airtableArticleIds) ||
    airtableArticleIds.length === 0
  ) {
    return { data: null, error: 'No article linked', imagePath: null }
  }

  const airtableArticleId = airtableArticleIds[0]
  const blogArticleId = idMaps.articles[airtableArticleId]
  if (!blogArticleId) {
    return {
      data: null,
      error: `Article mapping not found for ${airtableArticleId}`,
      imagePath: null,
    }
  }

  // Board info: resolve pinterest_board_id and name from Airtable boards
  let pinterestBoardId: string | null = null
  let pinterestBoardName: string | null = null
  const airtableBoardIds = fields['Board']
  if (
    airtableBoardIds &&
    Array.isArray(airtableBoardIds) &&
    airtableBoardIds.length > 0
  ) {
    const boardInfo = airtableBoardMap.get(airtableBoardIds[0])
    if (boardInfo) {
      pinterestBoardId = boardInfo.pinterest_board_id
      pinterestBoardName = boardInfo.name
    } else {
      console.warn(
        `Board info not found for ${airtableBoardIds[0]}, setting pinterest_board fields to NULL`
      )
    }
  }

  // FK 3: blog_project_id (derive from article using preloaded map)
  const blogProjectId = articleProjectMap.get(blogArticleId)
  if (!blogProjectId) {
    return {
      data: null,
      error: `Project mapping not found for article ${blogArticleId}`,
      imagePath: null,
    }
  }

  // Map pin data fields
  const rawStatus = fields['Status']
  let status = PIN_STATUS_MAP[rawStatus] || 'draft'
  if (!PIN_STATUS_MAP[rawStatus]) {
    console.warn(
      `Unknown status "${rawStatus}" for pin ${record.id}, defaulting to 'draft'`
    )
  }

  const scheduledAt = fields['Veroffentlichungsdatum'] || null
  const publishedAt =
    status === 'published' && scheduledAt ? scheduledAt : null

  const pinData: any = {
    id: pinId,
    tenant_id: tenantId,
    blog_article_id: blogArticleId,
    pinterest_board_id: pinterestBoardId,
    pinterest_board_name: pinterestBoardName,
    blog_project_id: blogProjectId,
    title: fields['PIN Titel'] || null,
    description: fields['Beschreibung des Pins'] || null,
    alt_text: fields['Alt Text Bild'] || null,
    status,
    error_message: fields['Fehlerbeschreibung'] || null,
    scheduled_at: scheduledAt,
    published_at: publishedAt,
    pinterest_pin_id: null, // Not stored in Airtable
  }

  // Handle pin image
  let imagePath: string | null = null
  const pinImages = fields['Pin Bilder']
  if (pinImages && Array.isArray(pinImages) && pinImages.length > 0) {
    const attachment = pinImages[0] // Take first image
    const imageUrl = attachment.url
    const filename = attachment.filename
    const ext = getFileExtension(filename)
    imagePath = `${tenantId}/${pinId}.${ext}`
  }

  return { data: pinData, error: null, imagePath }
}

/**
 * Download and upload pin image to Supabase Storage
 */
async function uploadPinImage(
  imageUrl: string,
  imagePath: string,
  filename: string
): Promise<boolean> {
  // Download from Airtable CDN
  const buffer = await downloadFile(imageUrl)
  if (!buffer) {
    return false
  }

  // Determine content type from extension
  const ext = getFileExtension(filename).toLowerCase()
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  const contentType = contentTypeMap[ext] || 'image/jpeg'

  // Upload to Supabase Storage
  const publicUrl = await uploadToStorage(
    'pin-images',
    imagePath,
    buffer,
    contentType
  )

  return publicUrl !== null
}

/**
 * Main migration function
 */
async function migratePins() {
  console.log('=== Starting Pin Migration ===\n')

  if (DRY_RUN) {
    console.log('DRY RUN MODE - No changes will be made\n')
  }

  if (FORCE_IMAGES) {
    console.log('FORCE IMAGES MODE - Re-uploading all images\n')
  }

  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    imageErrors: 0,
    errors: [] as string[],
  }

  try {
    // Load ID mappings
    const idMaps = loadIdMaps()
    console.log('Loaded ID mappings\n')

    // Verify required mappings exist
    const projectCount = Object.keys(idMaps.projects).length
    const articleCount = Object.keys(idMaps.articles).length

    if (projectCount === 0 || articleCount === 0) {
      throw new Error(
        `Missing required mappings. Found: ${projectCount} projects, ${articleCount} articles. Run previous migration scripts first.`
      )
    }

    console.log(
      `Found ${projectCount} projects, ${articleCount} articles\n`
    )

    // Get tenant ID
    const tenantId = getTenantId()
    console.log(`Target tenant: ${tenantId}\n`)

    // Fetch all articles to build article-to-project mapping
    console.log('Fetching articles from Supabase to build project mapping...')
    const { data: articles, error: articlesError } = await supabaseAdmin
      .from('blog_articles')
      .select('id, blog_project_id')

    if (articlesError) {
      throw new Error(`Failed to fetch articles: ${articlesError.message}`)
    }

    const articleProjectMap = new Map<string, string>()
    articles?.forEach((article) => {
      articleProjectMap.set(article.id, article.blog_project_id)
    })
    console.log(`Loaded ${articleProjectMap.size} article-project mappings\n`)

    // Fetch Airtable boards to resolve pinterest_board_id/name for pins
    console.log('Fetching Airtable boards for board info resolution...')
    const airtableBoards = await fetchAllRecords(TABLES.BOARDS)
    const airtableBoardMap = new Map<string, AirtableBoardInfo>()
    for (const board of airtableBoards) {
      airtableBoardMap.set(board.id, {
        pinterest_board_id: board.fields['pinterest_id'] || null,
        name: board.fields['Name'] || '',
      })
    }
    console.log(`Loaded ${airtableBoardMap.size} Airtable boards\n`)

    // Load existing images from Storage (single batch call)
    console.log('Loading existing images from Storage...')
    const existingImages = await loadExistingImages(tenantId)
    console.log(`Found ${existingImages.size} existing images\n`)

    // Fetch all Airtable pin records
    console.log('Fetching records from Airtable...')
    const airtableRecords = await fetchAllRecords(TABLES.PINS)
    console.log(`Fetched ${airtableRecords.length} records\n`)

    // Process each record
    for (let i = 0; i < airtableRecords.length; i++) {
      const record = airtableRecords[i]

      try {
        if (i % 50 === 0) {
          console.log(`Processing pin ${i + 1}/${airtableRecords.length}...`)
        }

        // Get or create Supabase UUID
        const pinId = getSupabaseId(idMaps, record.id)

        // Map to Supabase schema
        const {
          data: pinData,
          error: mapError,
          imagePath,
        } = mapPinRecord(record, tenantId, pinId, idMaps, articleProjectMap, airtableBoardMap)

        if (mapError || !pinData) {
          stats.skipped++
          stats.errors.push(
            `${record.fields['PIN Titel'] || record.id}: ${mapError || 'Mapping failed'}`
          )
          continue
        }

        // Handle image upload
        let imageUploadSuccess = false
        if (imagePath) {
          const shouldUpload =
            FORCE_IMAGES || !existingImages.has(imagePath)

          if (shouldUpload && !DRY_RUN) {
            const pinImages = record.fields['Pin Bilder']
            if (!pinImages || !Array.isArray(pinImages) || pinImages.length === 0) {
              console.error(
                `✗ No image found for pin: ${pinData.title || record.id}`
              )
              stats.imageErrors++
            } else {
              const imageUrl = pinImages[0].url
              const filename = pinImages[0].filename

              imageUploadSuccess = await uploadPinImage(
                imageUrl,
                imagePath,
                filename
              )

              if (!imageUploadSuccess) {
                console.error(
                  `✗ Image upload failed for pin: ${pinData.title || record.id}`
                )
                stats.imageErrors++
                // Continue anyway - pin will be created without image_path
              } else {
                // Only set image_path if upload succeeded
                pinData.image_path = imagePath
                // Rate limit: 200ms delay between image uploads
                await sleep(200)
              }
            }
          } else if (shouldUpload && DRY_RUN) {
            const pinImages = record.fields['Pin Bilder']
            const imageUrl = pinImages?.[0]?.url || 'unknown'
            console.log(
              `[DRY RUN] Would upload image: ${imagePath} from ${imageUrl}`
            )
            imageUploadSuccess = true
            pinData.image_path = imagePath
          } else {
            // Image already exists, skip upload
            console.log(
              `→ Image exists, skipping upload: ${pinData.title || record.id}`
            )
            imageUploadSuccess = true
            pinData.image_path = imagePath
          }
        }

        // Check if record already exists
        const { data: existing } = await supabaseAdmin
          .from('pins')
          .select('id')
          .eq('id', pinId)
          .single()

        if (DRY_RUN) {
          if (existing) {
            stats.updated++
            console.log(`[DRY RUN] Would update: ${pinData.title || record.id}`)
          } else {
            stats.created++
            console.log(`[DRY RUN] Would create: ${pinData.title || record.id}`)
          }
          continue
        }

        // Upsert record
        const { error } = await supabaseAdmin
          .from('pins')
          .upsert(pinData, { onConflict: 'id' })

        if (error) {
          stats.errors.push(
            `${pinData.title || record.id}: ${error.message}`
          )
          continue
        }

        if (existing) {
          stats.updated++
          console.log(
            `✓ Updated: ${pinData.title || record.id} ${imageUploadSuccess ? '(with image)' : '(no image)'}`
          )
        } else {
          stats.created++
          console.log(
            `✓ Created: ${pinData.title || record.id} ${imageUploadSuccess ? '(with image)' : '(no image)'}`
          )
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error)
        stats.errors.push(
          `${record.fields['PIN Titel'] || record.id}: ${errorMsg}`
        )
      }
    }

    if (!DRY_RUN) {
      // Save updated ID mappings
      saveIdMaps(idMaps)
      console.log(`\nSaved ID mappings to ${ID_MAPS_PATH}`)
    }

    // Log results
    console.log(`\n=== Pin Migration Complete ===`)
    console.log(`Created: ${stats.created}`)
    console.log(`Updated: ${stats.updated}`)
    console.log(`Skipped: ${stats.skipped}`)
    console.log(`Image Errors: ${stats.imageErrors}`)

    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`)
      stats.errors.slice(0, 10).forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`)
      })
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more`)
      }
    }
    console.log('=====================================\n')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migratePins()

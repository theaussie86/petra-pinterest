#!/usr/bin/env tsx
/**
 * Pin Migration Script
 * Migrates pins from Airtable to Supabase with image upload to Supabase Storage
 *
 * Usage: npx tsx scripts/migration/migrate-pins.ts [--force-images] [--dry-run] [--delete-excess]
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


const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

// CLI flags
const FORCE_IMAGES = process.argv.includes('--force-images')
const DRY_RUN = process.argv.includes('--dry-run')
const DELETE_EXCESS = process.argv.includes('--delete-excess')

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
  boardMap: Map<string, { pinterest_id: string; name: string }>
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

  // FK 2: blog_project_id (derive from article using preloaded map)
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

  const scheduledAt = fields['Veröffentlichungsdatum'] || null
  const publishedAt =
    status === 'published' && scheduledAt ? scheduledAt : null

  const pinData: any = {
    id: pinId,
    tenant_id: tenantId,
    blog_article_id: blogArticleId,
    blog_project_id: blogProjectId,
    title: fields['PIN Titel'] || null,
    description: fields['Beschreibung des Pins'] || null,
    alt_text: fields['Alt Text Bild'] || null,
    status,
    error_message: fields['Fehlerbeschreibung'] || null,
    scheduled_at: scheduledAt,
    published_at: publishedAt,
  }

  // Board resolution
  const boardIds = fields['Board']
  if (boardIds && Array.isArray(boardIds) && boardIds.length > 0) {
    const board = boardMap.get(boardIds[0])
    if (board) {
      pinData.pinterest_board_id = board.pinterest_id
      pinData.pinterest_board_name = board.name
    }
  }

  // Handle pin image
  let imagePath: string | null = null
  const pinImages = fields['Pin Bilder']
  if (pinImages && Array.isArray(pinImages) && pinImages.length > 0) {
    const attachment = pinImages[0] // Take first image
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

  if (DELETE_EXCESS) {
    console.log('DELETE EXCESS MODE - Will remove pins not in import set\n')
  }

  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    skippedPublished: 0,
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

    // Fetch all Supabase articles to build article-to-project mapping
    console.log('Fetching articles from Supabase to build project mapping...')
    const { data: articles, error: articlesError } = await supabaseAdmin
      .from('blog_articles')
      .select('id, blog_project_id, url')

    if (articlesError) {
      throw new Error(`Failed to fetch articles: ${articlesError.message}`)
    }

    const articleProjectMap = new Map<string, string>()
    // Also index by (project_id, url) for reconciliation
    const articleByKey = new Map<string, string>()
    articles?.forEach((article) => {
      articleProjectMap.set(article.id, article.blog_project_id)
      articleByKey.set(`${article.blog_project_id}::${article.url}`, article.id)
    })
    console.log(`Loaded ${articleProjectMap.size} article-project mappings\n`)

    // Reconcile stale article mappings in id-maps
    // Articles may have been re-scraped (new UUIDs) since the last migration
    console.log('Reconciling article mappings...')
    const airtableArticles = await fetchAllRecords(TABLES.BLOG_ARTIKEL)
    let reconciled = 0
    for (const atArticle of airtableArticles) {
      const currentMapping = idMaps.articles[atArticle.id]
      if (currentMapping && articleProjectMap.has(currentMapping)) continue

      // Stale or missing — try to find by (project_id, url)
      const url = atArticle.fields['Post URL']
      const atProjectIds = atArticle.fields['Projekt']
      if (!url || !atProjectIds?.length) continue

      const projectId = idMaps.projects[atProjectIds[0]]
      if (!projectId) continue

      const match = articleByKey.get(`${projectId}::${url}`)
      if (match) {
        idMaps.articles[atArticle.id] = match
        reconciled++
      }
    }
    if (reconciled > 0) {
      console.log(`Reconciled ${reconciled} stale article mappings`)
    } else {
      console.log('All article mappings are up to date')
    }
    console.log()

    // Load existing images from Storage (single batch call)
    console.log('Loading existing images from Storage...')
    const existingImages = await loadExistingImages(tenantId)
    console.log(`Found ${existingImages.size} existing images\n`)

    // Fetch all boards from Airtable for board resolution
    console.log('Fetching boards from Airtable...')
    const airtableBoards = await fetchAllRecords(TABLES.BOARDS)
    const boardMap = new Map<string, { pinterest_id: string; name: string }>()
    for (const board of airtableBoards) {
      boardMap.set(board.id, {
        pinterest_id: board.fields['pinterest_id'] || '',
        name: board.fields['Name'] || '',
      })
    }
    console.log(`Loaded ${boardMap.size} boards\n`)

    // Fetch all Airtable pin records
    console.log('Fetching records from Airtable...')
    const allAirtableRecords = await fetchAllRecords(TABLES.PINS)
    console.log(`Fetched ${allAirtableRecords.length} records from Airtable`)

    // Filter out published pins before processing
    const airtableRecords = allAirtableRecords.filter(
      (r) => r.fields['Status'] !== 'Veröffentlicht'
    )
    stats.skippedPublished = allAirtableRecords.length - airtableRecords.length
    console.log(
      `Skipping ${stats.skippedPublished} published pins, ${airtableRecords.length} to process\n`
    )

    // Track which Airtable IDs were actually imported (for excess deletion)
    const importedAirtableIds = new Set<string>()

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
        } = mapPinRecord(record, tenantId, pinId, idMaps, articleProjectMap, boardMap)

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
          importedAirtableIds.add(record.id)
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

        importedAirtableIds.add(record.id)

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

    // Delete excess pins (in Supabase but not in imported set)
    let excessDeleted = 0
    let excessImagesDeleted = 0
    if (DELETE_EXCESS) {
      console.log('\n--- Checking for excess pins ---\n')

      // Build reverse map: supabaseId -> airtableId
      const supabaseToAirtable = new Map<string, string>()
      for (const [airtableId, supabaseId] of Object.entries(idMaps.pins)) {
        supabaseToAirtable.set(supabaseId, airtableId)
      }

      // Fetch all pins for this tenant from Supabase
      const { data: allSupabasePins, error: fetchError } = await supabaseAdmin
        .from('pins')
        .select('id, image_path')
        .eq('tenant_id', tenantId)

      if (fetchError) {
        console.error(`Failed to fetch Supabase pins: ${fetchError.message}`)
      } else if (allSupabasePins) {
        // Find excess: pins whose Airtable ID is not in the imported set
        const excessPins: { id: string; image_path: string | null }[] = []
        for (const pin of allSupabasePins) {
          const airtableId = supabaseToAirtable.get(pin.id)
          if (!airtableId || !importedAirtableIds.has(airtableId)) {
            excessPins.push(pin)
          }
        }

        console.log(`Found ${excessPins.length} excess pins to delete`)

        if (excessPins.length > 0) {
          // Collect image paths to delete
          const imagePaths = excessPins
            .map((p) => p.image_path)
            .filter((p): p is string => p !== null)

          if (DRY_RUN) {
            console.log(`[DRY RUN] Would delete ${excessPins.length} pins`)
            console.log(
              `[DRY RUN] Would delete ${imagePaths.length} images from Storage`
            )
            excessPins.slice(0, 10).forEach((pin) => {
              const airtableId = supabaseToAirtable.get(pin.id) || 'unknown'
              console.log(
                `  - ${pin.id} (airtable: ${airtableId}, image: ${pin.image_path || 'none'})`
              )
            })
            if (excessPins.length > 10) {
              console.log(`  ... and ${excessPins.length - 10} more`)
            }
          } else {
            // Delete images from Storage in batches of 100
            if (imagePaths.length > 0) {
              for (let i = 0; i < imagePaths.length; i += 100) {
                const batch = imagePaths.slice(i, i + 100)
                const { error: storageError } = await supabaseAdmin.storage
                  .from('pin-images')
                  .remove(batch)

                if (storageError) {
                  console.error(
                    `Storage delete error (batch ${Math.floor(i / 100) + 1}):`,
                    storageError
                  )
                } else {
                  excessImagesDeleted += batch.length
                }
              }
              console.log(
                `Deleted ${excessImagesDeleted} images from Storage`
              )
            }

            // Delete pin records from DB in batches of 100
            const excessIds = excessPins.map((p) => p.id)
            for (let i = 0; i < excessIds.length; i += 100) {
              const batch = excessIds.slice(i, i + 100)
              const { error: deleteError } = await supabaseAdmin
                .from('pins')
                .delete()
                .in('id', batch)

              if (deleteError) {
                console.error(
                  `DB delete error (batch ${Math.floor(i / 100) + 1}):`,
                  deleteError
                )
              } else {
                excessDeleted += batch.length
              }
            }
            console.log(`Deleted ${excessDeleted} excess pins from DB`)

            // Remove deleted entries from id-maps
            for (const pin of excessPins) {
              const airtableId = supabaseToAirtable.get(pin.id)
              if (airtableId) {
                delete idMaps.pins[airtableId]
              }
            }
          }
        }
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
    console.log(`Skipped (published): ${stats.skippedPublished}`)
    console.log(`Image Errors: ${stats.imageErrors}`)
    if (DELETE_EXCESS) {
      console.log(`Excess pins deleted: ${excessDeleted}`)
      console.log(`Excess images deleted: ${excessImagesDeleted}`)
    }

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

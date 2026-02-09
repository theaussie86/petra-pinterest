#!/usr/bin/env tsx
/**
 * Board Migration Script
 * Migrates boards from Airtable to Supabase
 *
 * Usage: npx tsx scripts/migration/migrate-boards.ts
 *
 * Prerequisites:
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
 * - migrate-projects.ts must have been run first (needs project ID mappings)
 */

import { fetchAllRecords, TABLES } from './lib/airtable-client'
import { supabaseAdmin } from './lib/supabase-admin'
import { logMigrationResult, getTenantId } from './lib/helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ID mapping file structure
interface IdMaps {
  projects: Record<string, string> // airtableId -> supabaseUUID
  articles: Record<string, string>
  boards: Record<string, string>
  pins: Record<string, string>
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

/**
 * Load ID mapping file
 */
function loadIdMaps(): IdMaps {
  if (!fs.existsSync(ID_MAPS_PATH)) {
    throw new Error(
      `ID maps file not found at ${ID_MAPS_PATH}. Run migrate-projects.ts first.`
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
 * Map Airtable board record to Supabase schema
 */
function mapBoardRecord(
  record: any,
  tenantId: string,
  idMaps: IdMaps
): { data: any; airtableId: string } | null {
  const fields = record.fields

  // Extract blog project ID from linked record field
  const blogProjektIds = fields['Blog Projekt'] // Array of Airtable record IDs
  if (!blogProjektIds || blogProjektIds.length === 0) {
    console.warn(`⚠ Skipping board "${fields['Name'] || record.id}": No Blog Projekt linked`)
    return null
  }

  // Look up the first linked project in ID mappings
  const airtableProjectId = blogProjektIds[0]
  const supabaseProjectId = idMaps.projects[airtableProjectId]

  if (!supabaseProjectId) {
    console.error(
      `✗ Skipping board "${fields['Name'] || record.id}": Project ${airtableProjectId} not found in ID mappings`
    )
    return null
  }

  // Extract board name
  const name = fields['Name']
  if (!name) {
    console.warn(`⚠ Skipping board ${record.id}: No Name field`)
    return null
  }

  // Extract pinterest_board_id (the Pinterest external ID)
  const pinterestBoardId = fields['pinterest_id'] || null

  // Extract cover image URL (first attachment from Cover field)
  let coverImageUrl: string | null = null
  const coverAttachments = fields['Cover']
  if (coverAttachments && Array.isArray(coverAttachments) && coverAttachments.length > 0) {
    coverImageUrl = coverAttachments[0].url || null
  }

  const boardData = {
    tenant_id: tenantId,
    blog_project_id: supabaseProjectId,
    name,
    pinterest_board_id: pinterestBoardId,
    cover_image_url: coverImageUrl,
  }

  return { data: boardData, airtableId: record.id }
}

/**
 * Upsert board into Supabase and return the Supabase UUID
 */
async function upsertBoard(boardData: any): Promise<string | null> {
  try {
    // Strategy: Use unique constraint on (blog_project_id, pinterest_board_id) for boards with pinterest_board_id
    // For boards without pinterest_board_id, check by name + project
    if (boardData.pinterest_board_id) {
      // Upsert using unique constraint
      const { data, error } = await supabaseAdmin
        .from('boards')
        .upsert(boardData, {
          onConflict: 'blog_project_id,pinterest_board_id',
        })
        .select('id')
        .single()

      if (error) {
        console.error(`✗ Upsert error for board "${boardData.name}":`, error.message)
        return null
      }

      return data.id
    } else {
      // No pinterest_board_id: check if board with same name + project exists
      const { data: existing } = await supabaseAdmin
        .from('boards')
        .select('id')
        .eq('blog_project_id', boardData.blog_project_id)
        .eq('name', boardData.name)
        .maybeSingle()

      if (existing) {
        // Update existing record
        const { data: updated, error } = await supabaseAdmin
          .from('boards')
          .update(boardData)
          .eq('id', existing.id)
          .select('id')
          .single()

        if (error) {
          console.error(`✗ Update error for board "${boardData.name}":`, error.message)
          return null
        }

        return updated.id
      } else {
        // Insert new record
        const { data: inserted, error } = await supabaseAdmin
          .from('boards')
          .insert(boardData)
          .select('id')
          .single()

        if (error) {
          console.error(`✗ Insert error for board "${boardData.name}":`, error.message)
          return null
        }

        return inserted.id
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`✗ Exception upserting board "${boardData.name}":`, errorMsg)
    return null
  }
}

/**
 * Main migration function
 */
async function migrateBoards() {
  console.log('=== Starting Board Migration ===\n')

  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // Load ID mappings
    const idMaps = loadIdMaps()

    // Verify project mappings exist
    const projectCount = Object.keys(idMaps.projects).length
    if (projectCount === 0) {
      throw new Error(
        'No project mappings found in id-maps.json. Run migrate-projects.ts first.'
      )
    }

    console.log(`Loaded ID mappings (${projectCount} projects)\n`)

    // Get tenant ID
    const tenantId = getTenantId()
    console.log(`Target tenant: ${tenantId}\n`)

    // Fetch all Airtable records
    console.log('Fetching records from Airtable Boards table...')
    const airtableRecords = await fetchAllRecords(TABLES.BOARDS)
    console.log(`Fetched ${airtableRecords.length} records\n`)

    // Track existing boards before migration
    const { count: existingCount } = await supabaseAdmin
      .from('boards')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    console.log(`Existing boards in Supabase: ${existingCount || 0}\n`)

    // Process each record
    for (const record of airtableRecords) {
      try {
        // Map to Supabase schema
        const mapped = mapBoardRecord(record, tenantId, idMaps)
        if (!mapped) {
          stats.skipped++
          continue
        }

        const { data: boardData, airtableId } = mapped

        // Check if this board already exists in ID mappings (indicates update)
        const existingSupabaseId = idMaps.boards[airtableId]
        const isUpdate = !!existingSupabaseId

        // Upsert board and get Supabase UUID
        const supabaseId = await upsertBoard(boardData)

        if (!supabaseId) {
          stats.errors.push(`${boardData.name}: Upsert failed`)
          continue
        }

        // Store ID mapping
        idMaps.boards[airtableId] = supabaseId

        if (isUpdate) {
          stats.updated++
          console.log(`✓ Updated: ${boardData.name}`)
        } else {
          stats.created++
          console.log(`✓ Created: ${boardData.name}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        stats.errors.push(`${record.fields['Name'] || record.id}: ${errorMsg}`)
      }
    }

    // Save updated ID mappings
    saveIdMaps(idMaps)
    console.log(`\nSaved ID mappings to ${ID_MAPS_PATH}`)

    // Log results
    logMigrationResult('Boards', stats)

    // Verify final count
    const { count: finalCount } = await supabaseAdmin
      .from('boards')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    console.log(`Final board count in Supabase: ${finalCount || 0}\n`)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateBoards()

#!/usr/bin/env tsx
/**
 * Blog Project Migration Script
 * Migrates blog projects from Airtable to Supabase with all branding fields
 *
 * Usage: npx tsx scripts/migration/migrate-projects.ts [--force-brand-kit]
 *
 * Prerequisites:
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
 */

import { fetchAllRecords, TABLES } from './lib/airtable-client'
import { supabaseAdmin } from './lib/supabase-admin'
import {
  logMigrationResult,
  getTenantId,
  loadExistingBrandKitFiles,
  migrateBrandKitForProject,
} from './lib/helpers'
import { PROJECT_BRANDING_MAP } from './lib/field-maps'
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
const FORCE_BRAND_KIT = process.argv.includes('--force-brand-kit')

/**
 * Load or create ID mapping file
 */
function loadIdMaps(): IdMaps {
  // Create data directory if it doesn't exist
  const dataDir = path.dirname(ID_MAPS_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Load existing mappings or create new
  if (fs.existsSync(ID_MAPS_PATH)) {
    const content = fs.readFileSync(ID_MAPS_PATH, 'utf-8')
    return JSON.parse(content)
  }

  return {
    projects: {},
    articles: {},
    pins: {},
  }
}

/**
 * Save ID mapping file
 */
function saveIdMaps(idMaps: IdMaps): void {
  fs.writeFileSync(ID_MAPS_PATH, JSON.stringify(idMaps, null, 2), 'utf-8')
}

/**
 * Get or create Supabase UUID for an Airtable record
 */
function getSupabaseId(
  idMaps: IdMaps,
  airtableId: string,
  type: keyof IdMaps
): string {
  if (!idMaps[type][airtableId]) {
    idMaps[type][airtableId] = uuidv4()
  }
  return idMaps[type][airtableId]
}

/**
 * Map Airtable blog project record to Supabase schema
 */
function mapProjectRecord(
  record: any,
  tenantId: string,
  supabaseId: string
): any {
  const fields = record.fields

  // Core fields
  const projectData: any = {
    id: supabaseId,
    tenant_id: tenantId,
    name: fields['Name'] || 'Unnamed Project',
    blog_url: fields['Blog URL'] || '',
    description: fields['Beschreibung des Blogs'] || null,
  }

  // Map branding fields using PROJECT_BRANDING_MAP
  for (const [airtableField, supabaseColumn] of Object.entries(
    PROJECT_BRANDING_MAP
  )) {
    if (fields[airtableField] !== undefined) {
      let value = fields[airtableField]

      // Special handling for multipleSelects (Stil Optionen) - join array to string
      if (airtableField === 'Stil Optionen' && Array.isArray(value)) {
        value = value.join(', ')
      }

      // Special handling for singleSelect (Sprache) - extract string directly
      if (airtableField === 'Sprache' && typeof value === 'string') {
        value = value
      }

      projectData[supabaseColumn] = value || null
    }
  }

  return projectData
}

/**
 * Main migration function
 */
async function migrateProjects() {
  console.log('=== Starting Blog Project Migration ===\n')

  if (FORCE_BRAND_KIT) {
    console.log('FORCE BRAND KIT MODE - Re-uploading all brand kit files\n')
  }

  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  const brandKitStats = { uploaded: 0, skipped: 0, errors: 0 }

  try {
    // Load ID mappings
    const idMaps = loadIdMaps()
    console.log('Loaded ID mappings\n')

    // Get tenant ID
    const tenantId = getTenantId()
    console.log(`Target tenant: ${tenantId}\n`)

    // Fetch all Airtable records
    console.log('Fetching records from Airtable...')
    const airtableRecords = await fetchAllRecords(TABLES.BLOG_PROJEKTE)
    console.log(`Fetched ${airtableRecords.length} records\n`)

    // Pre-load existing brand kit files
    const existingProjectIds = Object.values(idMaps.projects)
    console.log('Loading existing brand kit files from Storage...')
    const existingBrandKitFiles = await loadExistingBrandKitFiles(
      tenantId,
      existingProjectIds
    )
    console.log(`Found ${existingBrandKitFiles.size} existing brand kit files\n`)

    // Process each record
    for (const record of airtableRecords) {
      try {
        // Get or create Supabase UUID
        const supabaseId = getSupabaseId(idMaps, record.id, 'projects')

        // Map to Supabase schema
        const projectData = mapProjectRecord(record, tenantId, supabaseId)

        // Check if record already exists
        const { data: existing } = await supabaseAdmin
          .from('blog_projects')
          .select('id')
          .eq('id', supabaseId)
          .single()

        // Upsert record
        const { error } = await supabaseAdmin
          .from('blog_projects')
          .upsert(projectData, { onConflict: 'id' })

        if (error) {
          stats.errors.push(
            `${record.fields['Name'] || record.id}: ${error.message}`
          )
          continue
        }

        if (existing) {
          stats.updated++
          console.log(`✓ Updated: ${projectData.name}`)
        } else {
          stats.created++
          console.log(`✓ Created: ${projectData.name}`)
        }

        // Migrate brand kit files for this project
        const bkResult = await migrateBrandKitForProject(
          record,
          supabaseId,
          tenantId,
          existingBrandKitFiles,
          FORCE_BRAND_KIT,
          false
        )
        brandKitStats.uploaded += bkResult.uploaded
        brandKitStats.skipped += bkResult.skipped
        brandKitStats.errors += bkResult.errors
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error)
        stats.errors.push(
          `${record.fields['Name'] || record.id}: ${errorMsg}`
        )
      }
    }

    // Save updated ID mappings
    saveIdMaps(idMaps)
    console.log(`\nSaved ID mappings to ${ID_MAPS_PATH}`)

    // Log results
    logMigrationResult('Blog Projects', stats)

    // Log brand kit results
    console.log(`--- Brand Kit ---`)
    console.log(
      `Uploaded: ${brandKitStats.uploaded}, Skipped: ${brandKitStats.skipped}, Errors: ${brandKitStats.errors}`
    )
    console.log('=====================================\n')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateProjects()

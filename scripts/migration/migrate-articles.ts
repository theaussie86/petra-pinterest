#!/usr/bin/env tsx
/**
 * Blog Article Migration Script
 * Migrates blog articles from Airtable to Supabase with correct project relationships
 *
 * Usage: npx tsx scripts/migration/migrate-articles.ts
 *
 * Prerequisites:
 * - migrate-projects.ts must have run first (needs project ID mappings)
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
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
  pins: Record<string, string>
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')

/**
 * Load ID mapping file
 */
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
 * Save ID mapping file
 */
function saveIdMaps(idMaps: IdMaps): void {
  fs.writeFileSync(ID_MAPS_PATH, JSON.stringify(idMaps, null, 2), 'utf-8')
}

/**
 * Map Airtable blog article record to Supabase schema
 */
function mapArticleRecord(
  record: any,
  tenantId: string,
  projectIdMap: Record<string, string>
): { data: any; error: string | null } {
  const fields = record.fields

  // Get project ID from linked record
  const airtableProjektIds = fields['Projekt'] // Array of linked record IDs
  if (!airtableProjektIds || !Array.isArray(airtableProjektIds) || airtableProjektIds.length === 0) {
    return { data: null, error: 'No project linked' }
  }

  const airtableProjektId = airtableProjektIds[0] // Take first project
  const blogProjectId = projectIdMap[airtableProjektId]
  if (!blogProjectId) {
    return { data: null, error: `Project mapping not found for ${airtableProjektId}` }
  }

  // Map article fields
  const articleData: any = {
    tenant_id: tenantId,
    blog_project_id: blogProjectId,
    title: fields['Name'] || 'Untitled Article',
    url: fields['Post URL'] || '',
    content: fields['Content'] || null,
    published_at: fields['Artikel Anderungsdatum'] || null,
    scraped_at: fields['Created'] || new Date().toISOString(),
    archived_at: null, // All articles are active (no archived status in Airtable)
  }

  // Skip validation on url field - we'll let the unique constraint handle duplicates
  if (!articleData.url) {
    return { data: null, error: 'Missing Post URL' }
  }

  return { data: articleData, error: null }
}

/**
 * Main migration function
 */
async function migrateArticles() {
  console.log('=== Starting Blog Article Migration ===\n')

  const stats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    // Load ID mappings
    const idMaps = loadIdMaps()
    console.log('Loaded ID mappings\n')

    // Verify project mappings exist
    const projectCount = Object.keys(idMaps.projects).length
    if (projectCount === 0) {
      throw new Error('No project mappings found. Run migrate-projects.ts first.')
    }
    console.log(`Found ${projectCount} project mappings\n`)

    // Get tenant ID
    const tenantId = getTenantId()
    console.log(`Target tenant: ${tenantId}\n`)

    // Fetch all Airtable records
    console.log('Fetching records from Airtable...')
    const airtableRecords = await fetchAllRecords(TABLES.BLOG_ARTIKEL)
    console.log(`Fetched ${airtableRecords.length} records\n`)

    // Process each record
    for (const record of airtableRecords) {
      try {
        // Map to Supabase schema
        const { data: articleData, error: mapError } = mapArticleRecord(
          record,
          tenantId,
          idMaps.projects
        )

        if (mapError || !articleData) {
          stats.skipped++
          stats.errors.push(
            `${record.fields['Name'] || record.id}: ${mapError || 'Mapping failed'}`
          )
          continue
        }

        // Check if record already exists (based on unique constraint)
        const { data: existing } = await supabaseAdmin
          .from('blog_articles')
          .select('id')
          .eq('blog_project_id', articleData.blog_project_id)
          .eq('url', articleData.url)
          .single()

        // Upsert record using unique constraint on (blog_project_id, url)
        const { data: upserted, error } = await supabaseAdmin
          .from('blog_articles')
          .upsert(articleData, {
            onConflict: 'blog_project_id,url',
          })
          .select('id')
          .single()

        if (error) {
          stats.errors.push(
            `${record.fields['Name'] || record.id}: ${error.message}`
          )
          continue
        }

        // Store Airtable-to-Supabase ID mapping
        if (upserted) {
          idMaps.articles[record.id] = upserted.id
        }

        if (existing) {
          stats.updated++
          console.log(`✓ Updated: ${articleData.title}`)
        } else {
          stats.created++
          console.log(`✓ Created: ${articleData.title}`)
        }
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
    logMigrationResult('Blog Articles', stats)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateArticles()

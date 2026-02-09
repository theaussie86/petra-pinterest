#!/usr/bin/env tsx
/**
 * Migration Validation Script
 * Compares all Airtable source data against Supabase field-by-field
 * and generates a validation report.
 *
 * Usage: npx tsx scripts/migration/validate.ts
 *
 * Prerequisites:
 * - All migration scripts must have run first
 * - AIRTABLE_PAT environment variable set
 * - MIGRATION_TENANT_ID environment variable set
 * - SUPABASE_URL and SUPABASE_SECRET_KEY environment variables set
 */

import { fetchAllRecords, TABLES } from './lib/airtable-client'
import { supabaseAdmin } from './lib/supabase-admin'
import { getTenantId } from './lib/helpers'
import { PIN_STATUS_MAP, PROJECT_BRANDING_MAP } from './lib/field-maps'
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

interface EntitySummary {
  total: number
  matched: number
  mismatches: number
  missing: number
}

interface StorageSummary {
  expected: number
  actual: number
  missing: number
}

interface Mismatch {
  entity: string
  airtableId: string
  supabaseId: string
  field: string
  expected: string
  actual: string
}

interface MissingRecord {
  entity: string
  airtableId: string
  reason: string
}

interface ValidationReport {
  timestamp: string
  summary: {
    projects: EntitySummary
    articles: EntitySummary
    pins: EntitySummary
    storage: {
      pin_images: StorageSummary
      brand_kit: StorageSummary
    }
  }
  mismatches: Mismatch[]
  missing: MissingRecord[]
  errors: string[]
}

const ID_MAPS_PATH = path.join(__dirname, 'data', 'id-maps.json')
const REPORT_JSON_PATH = path.join(__dirname, 'data', 'validation-report.json')
const REPORT_MD_PATH = path.join(__dirname, 'data', 'validation-report.md')

function loadIdMaps(): IdMaps {
  if (!fs.existsSync(ID_MAPS_PATH)) {
    throw new Error(`ID mapping file not found at ${ID_MAPS_PATH}.`)
  }
  const content = fs.readFileSync(ID_MAPS_PATH, 'utf-8')
  return JSON.parse(content)
}

function normalize(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value)
}

/**
 * Count files in a storage bucket under a prefix
 */
async function countStorageFiles(
  bucket: string,
  prefix: string
): Promise<number> {
  let count = 0
  let offset = 0
  const limit = 1000
  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit, offset })

    if (error || !data || data.length === 0) break
    // Filter out .emptyFolderPlaceholder entries
    count += data.filter((f) => f.name !== '.emptyFolderPlaceholder').length
    if (data.length < limit) break
    offset += limit
  }
  return count
}

/**
 * Validate projects
 */
async function validateProjects(
  idMaps: IdMaps
): Promise<{
  summary: EntitySummary
  mismatches: Mismatch[]
  missing: MissingRecord[]
  errors: string[]
}> {
  const mismatches: Mismatch[] = []
  const missing: MissingRecord[] = []
  const errors: string[] = []

  // Fetch Airtable projects
  const airtableRecords = await fetchAllRecords(TABLES.BLOG_PROJEKTE)

  // Fetch all Supabase projects
  const { data: supabaseProjects, error } = await supabaseAdmin
    .from('blog_projects')
    .select('*')

  if (error) {
    errors.push(`Failed to fetch Supabase projects: ${error.message}`)
    return {
      summary: {
        total: airtableRecords.length,
        matched: 0,
        mismatches: 0,
        missing: airtableRecords.length,
      },
      mismatches,
      missing,
      errors,
    }
  }

  const supabaseMap = new Map(supabaseProjects!.map((p) => [p.id, p]))
  let matched = 0
  let mismatchCount = 0

  for (const record of airtableRecords) {
    const supabaseId = idMaps.projects[record.id]
    if (!supabaseId) {
      missing.push({
        entity: 'project',
        airtableId: record.id,
        reason: 'No ID mapping found',
      })
      continue
    }

    const sp = supabaseMap.get(supabaseId)
    if (!sp) {
      missing.push({
        entity: 'project',
        airtableId: record.id,
        reason: `Supabase record ${supabaseId} not found`,
      })
      continue
    }

    const fields = record.fields
    let hasMismatch = false

    // Core fields
    const coreChecks: [string, any, any][] = [
      ['name', fields['Name'] || 'Unnamed Project', sp.name],
      ['blog_url', fields['Blog URL'] || '', sp.blog_url],
      [
        'description',
        fields['Beschreibung des Blogs'] || null,
        sp.description,
      ],
    ]

    for (const [field, expected, actual] of coreChecks) {
      if (normalize(expected) !== normalize(actual)) {
        mismatches.push({
          entity: 'project',
          airtableId: record.id,
          supabaseId,
          field,
          expected: normalize(expected).substring(0, 200),
          actual: normalize(actual).substring(0, 200),
        })
        hasMismatch = true
      }
    }

    // Branding fields
    for (const [airtableField, supabaseColumn] of Object.entries(
      PROJECT_BRANDING_MAP
    )) {
      let expected = fields[airtableField]
      if (expected === undefined) continue // Field not present in Airtable

      if (airtableField === 'Stil Optionen' && Array.isArray(expected)) {
        expected = expected.join(', ')
      }

      const actual = sp[supabaseColumn]
      if (normalize(expected) !== normalize(actual)) {
        mismatches.push({
          entity: 'project',
          airtableId: record.id,
          supabaseId,
          field: supabaseColumn,
          expected: normalize(expected).substring(0, 200),
          actual: normalize(actual).substring(0, 200),
        })
        hasMismatch = true
      }
    }

    if (hasMismatch) {
      mismatchCount++
    } else {
      matched++
    }
  }

  return {
    summary: {
      total: airtableRecords.length,
      matched,
      mismatches: mismatchCount,
      missing: missing.length,
    },
    mismatches,
    missing,
    errors,
  }
}

/**
 * Validate articles
 */
async function validateArticles(
  idMaps: IdMaps
): Promise<{
  summary: EntitySummary
  mismatches: Mismatch[]
  missing: MissingRecord[]
  errors: string[]
}> {
  const mismatches: Mismatch[] = []
  const missing: MissingRecord[] = []
  const errors: string[] = []

  const airtableRecords = await fetchAllRecords(TABLES.BLOG_ARTIKEL)

  const { data: supabaseArticles, error } = await supabaseAdmin
    .from('blog_articles')
    .select('*')

  if (error) {
    errors.push(`Failed to fetch Supabase articles: ${error.message}`)
    return {
      summary: {
        total: airtableRecords.length,
        matched: 0,
        mismatches: 0,
        missing: airtableRecords.length,
      },
      mismatches,
      missing,
      errors,
    }
  }

  const supabaseMap = new Map(supabaseArticles!.map((a) => [a.id, a]))
  let matched = 0
  let mismatchCount = 0

  for (const record of airtableRecords) {
    const supabaseId = idMaps.articles[record.id]
    if (!supabaseId) {
      missing.push({
        entity: 'article',
        airtableId: record.id,
        reason: 'No ID mapping found',
      })
      continue
    }

    const sa = supabaseMap.get(supabaseId)
    if (!sa) {
      missing.push({
        entity: 'article',
        airtableId: record.id,
        reason: `Supabase record ${supabaseId} not found`,
      })
      continue
    }

    const fields = record.fields
    let hasMismatch = false

    // Title
    if (
      normalize(fields['Name'] || 'Untitled Article') !== normalize(sa.title)
    ) {
      mismatches.push({
        entity: 'article',
        airtableId: record.id,
        supabaseId,
        field: 'title',
        expected: normalize(fields['Name']).substring(0, 200),
        actual: normalize(sa.title).substring(0, 200),
      })
      hasMismatch = true
    }

    // URL
    if (normalize(fields['Post URL']) !== normalize(sa.url)) {
      mismatches.push({
        entity: 'article',
        airtableId: record.id,
        supabaseId,
        field: 'url',
        expected: normalize(fields['Post URL']).substring(0, 200),
        actual: normalize(sa.url).substring(0, 200),
      })
      hasMismatch = true
    }

    // Content (first 200 chars)
    const expectedContent = normalize(fields['Content']).substring(0, 200)
    const actualContent = normalize(sa.content).substring(0, 200)
    if (expectedContent !== actualContent) {
      mismatches.push({
        entity: 'article',
        airtableId: record.id,
        supabaseId,
        field: 'content (first 200 chars)',
        expected: expectedContent,
        actual: actualContent,
      })
      hasMismatch = true
    }

    // Verify project FK
    const airtableProjektIds = fields['Projekt']
    if (
      airtableProjektIds &&
      Array.isArray(airtableProjektIds) &&
      airtableProjektIds.length > 0
    ) {
      const expectedProjectId = idMaps.projects[airtableProjektIds[0]]
      if (expectedProjectId && expectedProjectId !== sa.blog_project_id) {
        mismatches.push({
          entity: 'article',
          airtableId: record.id,
          supabaseId,
          field: 'blog_project_id',
          expected: expectedProjectId,
          actual: sa.blog_project_id,
        })
        hasMismatch = true
      }
    }

    if (hasMismatch) {
      mismatchCount++
    } else {
      matched++
    }
  }

  return {
    summary: {
      total: airtableRecords.length,
      matched,
      mismatches: mismatchCount,
      missing: missing.length,
    },
    mismatches,
    missing,
    errors,
  }
}

/**
 * Validate pins
 */
async function validatePins(
  idMaps: IdMaps
): Promise<{
  summary: EntitySummary
  mismatches: Mismatch[]
  missing: MissingRecord[]
  errors: string[]
}> {
  const mismatches: Mismatch[] = []
  const missing: MissingRecord[] = []
  const errors: string[] = []

  const airtableRecords = await fetchAllRecords(TABLES.PINS)

  // Fetch all pins (may need pagination for large sets)
  let allPins: any[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('pins')
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) {
      errors.push(`Failed to fetch Supabase pins: ${error.message}`)
      break
    }
    if (!data || data.length === 0) break
    allPins = allPins.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const supabaseMap = new Map(allPins.map((p) => [p.id, p]))
  let matched = 0
  let mismatchCount = 0

  for (const record of airtableRecords) {
    const supabaseId = idMaps.pins[record.id]
    if (!supabaseId) {
      missing.push({
        entity: 'pin',
        airtableId: record.id,
        reason: 'No ID mapping found',
      })
      continue
    }

    const sp = supabaseMap.get(supabaseId)
    if (!sp) {
      missing.push({
        entity: 'pin',
        airtableId: record.id,
        reason: `Supabase record ${supabaseId} not found`,
      })
      continue
    }

    const fields = record.fields
    let hasMismatch = false

    // Title
    if (normalize(fields['PIN Titel']) !== normalize(sp.title)) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'title',
        expected: normalize(fields['PIN Titel']).substring(0, 200),
        actual: normalize(sp.title).substring(0, 200),
      })
      hasMismatch = true
    }

    // Description
    if (
      normalize(fields['Beschreibung des Pins']) !== normalize(sp.description)
    ) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'description',
        expected: normalize(fields['Beschreibung des Pins']).substring(0, 200),
        actual: normalize(sp.description).substring(0, 200),
      })
      hasMismatch = true
    }

    // Alt text
    if (normalize(fields['Alt Text Bild']) !== normalize(sp.alt_text)) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'alt_text',
        expected: normalize(fields['Alt Text Bild']).substring(0, 200),
        actual: normalize(sp.alt_text).substring(0, 200),
      })
      hasMismatch = true
    }

    // Status mapping
    const expectedStatus = PIN_STATUS_MAP[fields['Status']] || 'draft'
    if (expectedStatus !== sp.status) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'status',
        expected: `${expectedStatus} (from "${fields['Status']}")`,
        actual: sp.status,
      })
      hasMismatch = true
    }

    // Error message
    if (
      normalize(fields['Fehlerbeschreibung']) !== normalize(sp.error_message)
    ) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'error_message',
        expected: normalize(fields['Fehlerbeschreibung']).substring(0, 200),
        actual: normalize(sp.error_message).substring(0, 200),
      })
      hasMismatch = true
    }

    // Scheduled at
    if (
      normalize(fields['Veroffentlichungsdatum']) !== normalize(sp.scheduled_at)
    ) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'scheduled_at',
        expected: normalize(fields['Veroffentlichungsdatum']),
        actual: normalize(sp.scheduled_at),
      })
      hasMismatch = true
    }

    // Article FK
    const airtableArticleIds = fields['Blog Artikel']
    if (
      airtableArticleIds &&
      Array.isArray(airtableArticleIds) &&
      airtableArticleIds.length > 0
    ) {
      const expectedArticleId = idMaps.articles[airtableArticleIds[0]]
      if (expectedArticleId && expectedArticleId !== sp.blog_article_id) {
        mismatches.push({
          entity: 'pin',
          airtableId: record.id,
          supabaseId,
          field: 'blog_article_id',
          expected: expectedArticleId,
          actual: sp.blog_article_id,
        })
        hasMismatch = true
      }
    }

    // Image path exists
    const pinImages = fields['Pin Bilder']
    if (
      pinImages &&
      Array.isArray(pinImages) &&
      pinImages.length > 0 &&
      !sp.image_path
    ) {
      mismatches.push({
        entity: 'pin',
        airtableId: record.id,
        supabaseId,
        field: 'image_path',
        expected: 'Image path set (Airtable has image)',
        actual: '(null)',
      })
      hasMismatch = true
    }

    if (hasMismatch) {
      mismatchCount++
    } else {
      matched++
    }
  }

  return {
    summary: {
      total: airtableRecords.length,
      matched,
      mismatches: mismatchCount,
      missing: missing.length,
    },
    mismatches,
    missing,
    errors,
  }
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: ValidationReport): string {
  const lines: string[] = []

  lines.push('# Migration Validation Report')
  lines.push('')
  lines.push(`Generated: ${report.timestamp}`)
  lines.push('')

  // Overall verdict
  const totalMismatches =
    report.summary.projects.mismatches +
    report.summary.articles.mismatches +
    report.summary.pins.mismatches
  const totalMissing =
    report.summary.projects.missing +
    report.summary.articles.missing +
    report.summary.pins.missing

  if (totalMismatches === 0 && totalMissing === 0 && report.errors.length === 0) {
    lines.push('## Verdict: PASS')
    lines.push('')
    lines.push('All records match between Airtable and Supabase.')
  } else {
    lines.push('## Verdict: ISSUES FOUND')
    lines.push('')
    lines.push(
      `${totalMismatches} records with field mismatches, ${totalMissing} missing records, ${report.errors.length} errors.`
    )
  }
  lines.push('')

  // Summary table
  lines.push('## Record Summary')
  lines.push('')
  lines.push('| Entity | Total | Matched | Mismatches | Missing |')
  lines.push('|--------|-------|---------|------------|---------|')
  for (const [name, summary] of Object.entries(report.summary)) {
    if (name === 'storage') continue
    const s = summary as EntitySummary
    const status = s.mismatches === 0 && s.missing === 0 ? 'OK' : 'ISSUES'
    lines.push(
      `| ${name} | ${s.total} | ${s.matched} | ${s.mismatches} | ${s.missing} | ${status} |`
    )
  }
  lines.push('')

  // Storage summary
  lines.push('## Storage Summary')
  lines.push('')
  lines.push('| Bucket | Expected | Actual | Missing |')
  lines.push('|--------|----------|--------|---------|')
  for (const [name, summary] of Object.entries(report.summary.storage)) {
    const s = summary as StorageSummary
    lines.push(`| ${name} | ${s.expected} | ${s.actual} | ${s.missing} |`)
  }
  lines.push('')

  // Mismatches
  if (report.mismatches.length > 0) {
    lines.push('## Mismatches')
    lines.push('')
    const shown = report.mismatches.slice(0, 50)
    for (const m of shown) {
      lines.push(`### ${m.entity} (Airtable: ${m.airtableId})`)
      lines.push(`- **Field:** ${m.field}`)
      lines.push(`- **Expected:** ${m.expected}`)
      lines.push(`- **Actual:** ${m.actual}`)
      lines.push('')
    }
    if (report.mismatches.length > 50) {
      lines.push(
        `*... and ${report.mismatches.length - 50} more mismatches (see JSON report)*`
      )
      lines.push('')
    }
  }

  // Missing records
  if (report.missing.length > 0) {
    lines.push('## Missing Records')
    lines.push('')
    const shown = report.missing.slice(0, 30)
    for (const m of shown) {
      lines.push(`- **${m.entity}** ${m.airtableId}: ${m.reason}`)
    }
    if (report.missing.length > 30) {
      lines.push(
        `*... and ${report.missing.length - 30} more (see JSON report)*`
      )
    }
    lines.push('')
  }

  // Errors
  if (report.errors.length > 0) {
    lines.push('## Errors')
    lines.push('')
    for (const e of report.errors) {
      lines.push(`- ${e}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  console.log('=== Migration Validation ===\n')

  const tenantId = getTenantId()
  const idMaps = loadIdMaps()

  console.log(`Tenant: ${tenantId}`)
  console.log(
    `ID maps: ${Object.keys(idMaps.projects).length} projects, ${Object.keys(idMaps.articles).length} articles, ${Object.keys(idMaps.pins).length} pins\n`
  )

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      projects: { total: 0, matched: 0, mismatches: 0, missing: 0 },
      articles: { total: 0, matched: 0, mismatches: 0, missing: 0 },
      pins: { total: 0, matched: 0, mismatches: 0, missing: 0 },
      storage: {
        pin_images: { expected: 0, actual: 0, missing: 0 },
        brand_kit: { expected: 0, actual: 0, missing: 0 },
      },
    },
    mismatches: [],
    missing: [],
    errors: [],
  }

  // Validate each entity type
  console.log('Validating projects...')
  const projectResult = await validateProjects(idMaps)
  report.summary.projects = projectResult.summary
  report.mismatches.push(...projectResult.mismatches)
  report.missing.push(...projectResult.missing)
  report.errors.push(...projectResult.errors)
  console.log(
    `  ${projectResult.summary.matched}/${projectResult.summary.total} matched, ${projectResult.summary.mismatches} mismatches, ${projectResult.summary.missing} missing\n`
  )

  console.log('Validating articles...')
  const articleResult = await validateArticles(idMaps)
  report.summary.articles = articleResult.summary
  report.mismatches.push(...articleResult.mismatches)
  report.missing.push(...articleResult.missing)
  report.errors.push(...articleResult.errors)
  console.log(
    `  ${articleResult.summary.matched}/${articleResult.summary.total} matched, ${articleResult.summary.mismatches} mismatches, ${articleResult.summary.missing} missing\n`
  )

  console.log('Validating pins...')
  const pinResult = await validatePins(idMaps)
  report.summary.pins = pinResult.summary
  report.mismatches.push(...pinResult.mismatches)
  report.missing.push(...pinResult.missing)
  report.errors.push(...pinResult.errors)
  console.log(
    `  ${pinResult.summary.matched}/${pinResult.summary.total} matched, ${pinResult.summary.mismatches} mismatches, ${pinResult.summary.missing} missing\n`
  )

  // Storage validation
  console.log('Validating storage...')

  // Pin images
  const pinImageCount = await countStorageFiles('pin-images', tenantId)
  const expectedPinImages = Object.keys(idMaps.pins).length
  report.summary.storage.pin_images = {
    expected: expectedPinImages,
    actual: pinImageCount,
    missing: Math.max(0, expectedPinImages - pinImageCount),
  }
  console.log(`  pin-images: ${pinImageCount}/${expectedPinImages}`)

  // Brand kit
  let brandKitCount = 0
  let expectedBrandKit = 0
  const airtableProjects = await fetchAllRecords(TABLES.BLOG_PROJEKTE)
  for (const project of airtableProjects) {
    const attachments = project.fields['Brand Kit']
    if (attachments && Array.isArray(attachments)) {
      expectedBrandKit += attachments.length
    }
    const projectId = idMaps.projects[project.id]
    if (projectId) {
      brandKitCount += await countStorageFiles(
        'brand-kit',
        `${tenantId}/${projectId}`
      )
    }
  }
  report.summary.storage.brand_kit = {
    expected: expectedBrandKit,
    actual: brandKitCount,
    missing: Math.max(0, expectedBrandKit - brandKitCount),
  }
  console.log(`  brand-kit: ${brandKitCount}/${expectedBrandKit}`)

  console.log('')

  // Save reports
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`Saved JSON report: ${REPORT_JSON_PATH}`)

  const markdown = generateMarkdownReport(report)
  fs.writeFileSync(REPORT_MD_PATH, markdown, 'utf-8')
  console.log(`Saved Markdown report: ${REPORT_MD_PATH}`)

  // Console summary
  const totalMismatches =
    report.summary.projects.mismatches +
    report.summary.articles.mismatches +
    report.summary.pins.mismatches
  const totalMissing =
    report.summary.projects.missing +
    report.summary.articles.missing +
    report.summary.pins.missing

  console.log('\n=== Validation Complete ===')
  if (totalMismatches === 0 && totalMissing === 0 && report.errors.length === 0) {
    console.log('RESULT: PASS - All records match')
  } else {
    console.log(
      `RESULT: ISSUES FOUND - ${totalMismatches} mismatches, ${totalMissing} missing, ${report.errors.length} errors`
    )
    console.log('See validation-report.md for details.')
  }
  console.log('=====================================\n')
}

main()

# Phase 7: Data Migration - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate all existing Airtable data (blog projects, articles, pins, boards, images, brand kit files) into the existing Supabase schema. Scripts are idempotent and re-runnable to support a transition period where Airtable remains the active data source and Supabase receives periodic imports. No new features or UI changes — purely data transfer and validation.

</domain>

<decisions>
## Implementation Decisions

### Migration Approach
- Step-by-step scripts per entity type: projects → articles → boards → pins → images (separate scripts, run and verify each before moving to next)
- Local Node.js scripts (CLI, run with `tsx`) in a `/scripts/migration/` folder — disposable after migration
- Direct Airtable API reads at runtime (no manual JSON export step)
- Transition period: Airtable stays active, data flows Airtable → Supabase only (one-directional)
- Scripts must be idempotent — use upsert logic so re-running updates existing records and adds new ones safely

### Field Mapping
- Airtable's 16+ AI/branding fields on Blog Projekte → individual columns on `blog_projects` table (not JSONB)
- No denormalized/cached fields — rollups and formulas become JOINs at query time
- Article statuses mapped: 'Content gescannt' → 'active', 'Fehler' → mapped equivalent, etc. (Claude maps based on semantics)
- Pin statuses kept exactly as-is (German names already match Supabase enum) — including processing states

### Image Migration
- Pin images: download from Airtable CDN, upload to Supabase Storage using existing convention `{tenant_id}/{pin_id}.ext`
- Board covers: separate `board-covers` bucket in Supabase Storage
- Brand kit files: separate `brand-kit` bucket in Supabase Storage
- All attachments migrated (pin images + board covers + brand kit files)
- Broken image URLs: log the error and skip, continue migration — review failures after completion

### Data Validation
- Full field-by-field comparison: after migration, read every record back from Supabase and compare against Airtable source
- Validation report saved to file (JSON/Markdown) for review
- Mismatches auto-fixed on re-run: running migration again overwrites Supabase with Airtable values, then re-validate

### Claude's Discretion
- Exact script structure and dependency order
- Airtable API pagination handling
- Rate limiting strategy for Airtable API and Supabase Storage uploads
- Validation report format details
- Temporary file handling during image download/upload
- Status mapping for article states ('Blogartikel abrufen', 'Neu' — map to closest Supabase equivalents)

</decisions>

<specifics>
## Specific Ideas

- Scripts should be re-runnable during transition period — Airtable remains the active system, periodic re-imports pick up new data
- Migration is for a single tenant (Petra) — but scripts should still set tenant_id correctly for RLS compatibility
- Airtable base ID: `appWR3q78rre27F5q` with 4 tables: Blog Projekte, Blog Artikel, Pins, Boards
- Data volume is small (~2 projects, ~90 articles, 100+ pins, ~90 boards per project) — no need for batch optimization, but scripts should handle the volume gracefully
- After transition period ends, AIRTABLE_PAT should be removed from ~/.zshrc (existing todo)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-data-migration*
*Context gathered: 2026-02-09*

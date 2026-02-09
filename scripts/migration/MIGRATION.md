# Airtable to Supabase Migration

Migrates all data from the Airtable + n8n workflow into Supabase: projects, articles, boards, pins (with images), board covers, and brand kit files.

## Prerequisites

### Environment Variables

All variables must be set in `.env.local` at the project root:

```
AIRTABLE_PAT=<your-airtable-personal-access-token>
SUPABASE_URL=https://dedacaqstvzxlxpxvxgb.supabase.co
SUPABASE_SECRET_KEY=<your-service-role-key>
MIGRATION_TENANT_ID=300aacb4-3625-4251-9240-1a64ccbecb1d
```

### Database Migration

The branding columns and storage buckets must exist before running scripts. Migration `00008_blog_project_branding_fields.sql` adds 16 branding columns to `blog_projects` and creates the `board-covers` and `brand-kit` storage buckets. This should already be applied -- verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'blog_projects' AND column_name = 'target_audience';
```

### Dependencies

Scripts use `dotenv`, `uuid`, and the Supabase JS client. These are already in `package.json`. No additional installs needed.

## Execution Order

Scripts must be run in this exact order. Each script depends on the ID mappings produced by previous scripts.

```
1. migrate-projects.ts    (2 records, ~5 seconds)
2. migrate-articles.ts    (99 records, ~30 seconds)
3. migrate-boards.ts      (130 records, ~30 seconds)
4. migrate-pins.ts        (1649 records + images, ~10-15 minutes)
5. migrate-images.ts      (board covers + brand kit, ~1-3 minutes)
6. validate.ts            (full validation report, ~1-2 minutes)
```

## Running the Scripts

### Step 1: Projects

```bash
npx tsx scripts/migration/migrate-projects.ts
```

Migrates 2 blog projects (Himmelstränen, Online Heldinnen) with all 16 branding fields. Creates `scripts/migration/data/id-maps.json` with project ID mappings.

**Expected output:** `Created: 2` (or `Updated: 2` on re-run)

### Step 2: Articles

```bash
npx tsx scripts/migration/migrate-articles.ts
```

Migrates 99 blog articles with full content, linked to projects via FK. Uses `onConflict: 'blog_project_id,url'` for idempotent upserts. Updates `id-maps.json` with article mappings.

**Expected output:** `Created: 99` (or `Updated: 99` on re-run)

### Step 3: Boards

```bash
npx tsx scripts/migration/migrate-boards.ts
```

Migrates 130 boards with Pinterest board IDs and cover image URLs (still pointing to Airtable CDN at this stage). Uses `onConflict: 'blog_project_id,pinterest_board_id'` for boards with Pinterest IDs. Updates `id-maps.json` with board mappings.

**Expected output:** `Created: 130` (or `Updated: 130` on re-run)

### Step 4: Pins + Images

```bash
npx tsx scripts/migration/migrate-pins.ts
```

Migrates 1649 pins with status mapping (German to English), FK references to articles/boards/projects, and downloads + uploads pin images to the `pin-images` Supabase Storage bucket.

**Runtime:** ~10-15 minutes due to 200ms rate limiting between image uploads.

**Flags:**
- `--dry-run` -- Preview changes without writing to database or uploading images
- `--force-images` -- Re-upload all images even if they already exist in Storage

**What it does on re-run:** Skips existing images (checks Storage once at startup), upserts existing pin records. Safe to interrupt and restart -- it picks up where it left off.

**Expected output:** `Created: 1649, Image Errors: 0-3` (a few CDN timeouts are normal)

### Step 5: Board Covers + Brand Kit

```bash
npx tsx scripts/migration/migrate-images.ts
```

Downloads board cover images from Airtable and uploads to the `board-covers` Supabase Storage bucket. Updates each board's `cover_image_url` to point to the Supabase Storage URL instead of the Airtable CDN. Also downloads brand kit files and uploads to the `brand-kit` bucket.

**Flags:**
- `--dry-run` -- Preview changes without uploading or updating records
- `--force` -- Re-upload all files even if they already exist in Storage

**Expected output:** `Board covers: X uploaded, Y skipped` and `Brand kit files: X uploaded, Y skipped`

### Step 6: Validation

```bash
npx tsx scripts/migration/validate.ts
```

Re-fetches all 4 Airtable tables and compares field-by-field against Supabase. Also counts storage files per bucket. Generates two report files:

- `scripts/migration/data/validation-report.json` -- Structured data with all mismatches
- `scripts/migration/data/validation-report.md` -- Human-readable report with pass/fail verdict

**Expected output:** `RESULT: PASS - All records match` (or details about mismatches)

## Verification Scripts

Quick-check scripts to spot-check migration results:

```bash
npx tsx scripts/migration/verify-articles.ts   # Article counts, content lengths, project FKs
npx tsx scripts/migration/verify-boards.ts      # Board counts, Pinterest IDs, cover images
npx tsx scripts/migration/check-pins.ts         # Pin counts, status distribution, image counts
```

## How ID Mapping Works

All scripts share `scripts/migration/data/id-maps.json`:

```json
{
  "projects": { "<airtable-id>": "<supabase-uuid>", ... },
  "articles": { "<airtable-id>": "<supabase-uuid>", ... },
  "boards":   { "<airtable-id>": "<supabase-uuid>", ... },
  "pins":     { "<airtable-id>": "<supabase-uuid>", ... }
}
```

- `migrate-projects.ts` creates the file and populates `projects`
- Each subsequent script reads existing mappings and adds its own
- On re-run, existing UUIDs are reused (idempotent)
- This file is gitignored and should not be committed

## Airtable Field Mapping Reference

### Projects (Blog Projekte)

| Airtable Field | Supabase Column |
|---|---|
| Name | name |
| Blog URL | blog_url |
| Beschreibung des Blogs | description |
| Zielgruppe | target_audience |
| Tonalität / Markenstimme | brand_voice |
| Visueller Stil / Bildsprache | visual_style |
| Allgemeine Keywords / Nische | general_keywords |
| Sprache | language |
| Wertversprechen | value_proposition |
| Stil Optionen | style_options |
| Content Typ | content_type |
| Hauptmotive Beispiele | main_motifs |
| Farbpalette Beschreibung | color_palette |
| Spezielle Text Anweisungen | text_instructions |
| Blog Nische | blog_niche |
| Zusätzliche Anweisungen | additional_instructions |
| Themen Kontext | topic_context |
| Visuelle Zielgruppe | visual_audience |
| Licht Beschreibung | lighting_description |

### Articles (Blog Artikel)

| Airtable Field | Supabase Column |
|---|---|
| Name | title |
| Post URL | url |
| Content | content |
| Artikel Anderungsdatum | published_at |
| Created | scraped_at |
| Projekt (linked) | blog_project_id (via id-maps) |

### Boards

| Airtable Field | Supabase Column |
|---|---|
| Name | name |
| pinterest_id | pinterest_board_id |
| Cover (attachment) | cover_image_url |
| Blog Projekt (linked) | blog_project_id (via id-maps) |

### Pins

| Airtable Field | Supabase Column |
|---|---|
| PIN Titel | title |
| Beschreibung des Pins | description |
| Alt Text Bild | alt_text |
| Status | status (mapped via PIN_STATUS_MAP) |
| Fehlerbeschreibung | error_message |
| Veroffentlichungsdatum | scheduled_at / published_at |
| Pin Bilder (attachment) | image_path (uploaded to Storage) |
| Blog Artikel (linked) | blog_article_id (via id-maps) |
| Board (linked) | board_id (via id-maps) |

### Pin Status Mapping

| Airtable (German) | Supabase (English) |
|---|---|
| Entwurf | draft |
| Bereit für Generierung | ready_for_generation |
| Metadaten generieren | generate_metadata |
| Metadaten werden generiert | generating_metadata |
| Metadaten erstellt | metadata_created |
| Bereit zum Planen/Veröffentlichen | ready_to_schedule |
| Veröffentlicht | published |
| Fehler | error |
| Löschen | deleted |
| Pin generieren / Pin wird generiert / Pin generiert | draft (removed statuses) |

## Troubleshooting

**"AIRTABLE_PAT environment variable is not set"**
Scripts load `.env.local` via dotenv. Make sure the file exists at the project root (not in `scripts/migration/`).

**"ID mapping file not found"**
Run `migrate-projects.ts` first. It creates `scripts/migration/data/id-maps.json`.

**Image upload timeouts (Gateway Timeout / Connection Reset)**
Normal for a few images out of 1649. Re-run `migrate-pins.ts` -- it skips already-uploaded images and retries failed ones.

**"Project mapping not found for article X"**
The article references an Airtable project that wasn't migrated. Check if `migrate-projects.ts` completed successfully.

**Script hangs after "Fetching records from Airtable..."**
Airtable pagination with 100ms delay. 1649 pins = ~17 pages = ~2 seconds. If it takes longer, check your `AIRTABLE_PAT` is valid.

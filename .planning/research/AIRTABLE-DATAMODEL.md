# Airtable Data Model Analysis

**Source:** Airtable base "Pinterest Calendar" (`appWR3q78rre27F5q`)
**Analyzed:** 2026-01-27
**Purpose:** Document the existing Airtable data model as a starting point for Supabase schema design.

---

## Tables Overview

| Table | Airtable ID | Record Count (approx) | Purpose |
|-------|-------------|----------------------|---------|
| Blog Projekte | `tblZkW6ektjSmNOMG` | 2 (Himmelstränen, Online Heldinnen) | Blog project configuration with branding/AI context |
| Blog Artikel | `tblBNlgON5h27AHfn` | 90+ | Scraped blog articles with content |
| Pins | `tblW9Qu3B4zzDtr8V` | Many (100+) | Pinterest pins with metadata, images, scheduling |
| Boards | `tblhrv8QYrWYrFpis` | 90+ per project | Pinterest boards synced from Pinterest |

---

## Table: Blog Projekte

### Core Fields

| Field | Type | Airtable ID | Required | Notes |
|-------|------|-------------|----------|-------|
| Name | singleLineText | `fld8tYWhXtDgruxdQ` | Yes | Blog name (e.g., "Himmelstränen") |
| Beschreibung des Blogs | multilineText | `fldxmLni8xRatR2Vz` | No | Blog description for AI context |
| Blog URL | url | `fldz5acz9EfbKtpSe` | Yes | Full blog URL |
| Blog Nische | singleLineText | `flddF25UYAY6CoUpP` | No | Blog niche description |
| Sprache | singleSelect | `flddt1VTxIfpaWqZp` | No | Language: "Deutsch" or "Englisch" |
| Content Typ | singleSelect | `fldpxTPmMoIhDK7qe` | No | Primary content type: Rezept, Anleitung, Liste, Review |

### AI/Branding Context Fields

These fields provide context for AI-generated pin metadata:

| Field | Type | Airtable ID | Notes |
|-------|------|-------------|-------|
| Zielgruppe | multilineText | `fld6W9s0uiHv97E4s` | Target audience description |
| Tonalität / Markenstimme | multilineText | `flded1nhs1U9uaMPp` | Brand voice/tone |
| Visueller Stil / Bildsprache | multilineText | `fldfi6NTA4jxrfjhc` | Visual style description |
| Allgemeine Keywords / Nische | multilineText | `fldTPcu8gJIGmXYem` | General keywords/niche |
| Wertversprechen | multilineText | `fld45u2AoSUhr9LSy` | Value proposition |
| Themen Kontext | singleLineText | `fldOTBuLL1qgSNvhK` | Topic context |
| Visuelle Zielgruppe | multilineText | `fldZRLUKgCYP8wpkv` | Visual target audience |
| Hauptmotive Beispiele | multilineText | `fldpa43gBzaxbbdU0` | Key visual motifs |
| Farbpalette Beschreibung | multilineText | `fldNzTSty6MzzGzrk` | Color palette description |
| Licht Beschreibung | multilineText | `fldk0JNwmaZxqsi1k` | Lighting style description |
| Spezielle Text Anweisungen | multilineText | `fldACSQpfKOMQmVVb` | Special text instructions for AI |
| Zusätzliche Anweisungen | multilineText | `fldUawJ23d6mtA3bC` | Additional instructions (e.g., health claim rules) |
| Stil Optionen | multipleSelects | `fldsCDma2LuGS81dz` | Style options: Fotorealistisch, Flatlay, Minimalistisch, Vintage, Infografik |
| Brand Kit | multipleAttachments | `fldrgCc4pniR8TRIh` | Brand kit images/files |

### Relationship Fields

| Field | Type | Linked Table | Notes |
|-------|------|-------------|-------|
| Blog Artikel | multipleRecordLinks | Blog Artikel | 1:N — one project has many articles |
| Boards | multipleRecordLinks | Boards | 1:N — one project has many boards |

### Computed Fields

| Field | Type | Notes |
|-------|------|-------|
| Domain | formula | Extracts domain from Blog URL (regex strips protocol + path) |
| Hook Prompt Kontext Part | formula | Assembles all AI context fields into a structured prompt string for n8n workflows |

---

## Table: Blog Artikel

### Core Fields

| Field | Type | Airtable ID | Required | Notes |
|-------|------|-------------|----------|-------|
| Name | singleLineText | `fldjL3ULjIhwZIqiy` | Yes | Article title (short name) |
| Post URL | url | `fldiRFP8iEaL9KWnI` | Yes | Full article URL |
| Content | multilineText | `fldeg7ONpwLnf6mq8` | No | Full scraped HTML/markdown content (very large) |
| Artikel Änderungsdatum | dateTime | `fld0mbYnDzeVAbgxB` | No | Article modification date (from blog), timezone: Europe/Berlin |
| Status | singleSelect | `fldWmBeumltmxtimV` | No | Scraping status |
| Fehlerbeschreibung | multilineText | `fldmgyjIyRtwoMIro` | No | Error description if scraping failed |

### Article Status Values

| Status | Color | Meaning |
|--------|-------|---------|
| Blogartikel abrufen | cyanLight2 | Queued for scraping |
| Neu | blueLight2 | Newly discovered, not yet scraped |
| Content gescannt | yellowLight2 | Successfully scraped |
| Fehler | orangeBright | Scraping failed |

### Relationship Fields

| Field | Type | Linked Table | Notes |
|-------|------|-------------|-------|
| Projekt | multipleRecordLinks (prefersSingle) | Blog Projekte | N:1 — each article belongs to one project |
| Pins | multipleRecordLinks | Pins | 1:N — one article can have many pins |

### Rollup Fields

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Projekt Zielgruppe | rollup | Blog Projekte → Zielgruppe | Target audience from parent project |

### Auto Fields

| Field | Type | Notes |
|-------|------|-------|
| Created | createdTime | Auto-set on creation, timezone: Europe/Berlin |
| Last Modified | lastModifiedTime | Auto-updated on any change |

---

## Table: Pins

### Core Fields

| Field | Type | Airtable ID | Required | Notes |
|-------|------|-------------|----------|-------|
| PIN Titel | singleLineText | `fld1jwDqld0SICcBA` | Yes | Pin title (for Pinterest) |
| Beschreibung des Pins | multilineText | `fldmgKoDFmoHegffz` | No | Pin description (for Pinterest) |
| Alt Text Bild | multilineText | `fldybd9SuNWGzrrMN` | No | Image alt text |
| Pin Bilder | multipleAttachments | `fldGLocgT0CQZQNP4` | No | Pin images (typically 1000x1500 portrait) |
| Veröffentlichungsdatum | dateTime | `fldKMj2gpPPZ3bGnp` | No | Scheduled publish date/time, timezone: Europe/Berlin |
| Status | singleSelect | `fldCrSP7H0yXG1Oez` | Yes | Pin workflow status (see below) |
| Andere URL | url | `fldKy0PlY6yWkrtRG` | No | Alternative URL (non-article link) |
| Fehlerbeschreibung | multilineText | `fldmYy5BxBD95zJaw` | No | Error description |

### Pin Status Workflow

The pin status field is the most complex field in the system. It drives the entire workflow:

```
Entwurf (Draft)
  ↓
Bereit für Generierung (Ready for generation)
  ↓
Pin generieren (Generate pin - trigger)
  ↓
Pin wird generiert (Pin is being generated - processing)
  ↓
Pin generiert (Pin generated - complete)
  ↓
Metadaten generieren (Generate metadata - trigger)
  ↓
Metadaten werden generiert (Metadata being generated - processing)
  ↓
Metadaten erstellt (Metadata created - complete)
  ↓
Bereit zum Planen/Veröffentlichen (Ready to schedule/publish)
  ↓
Veröffentlicht (Published)

Error states:
  Fehler (Error) — can occur at any generation step
  Löschen (Delete) — soft delete marker
```

| Status | Color | Meaning |
|--------|-------|---------|
| Entwurf | grayLight2 | Draft — initial state |
| Bereit für Generierung | blueLight2 | Ready for image generation |
| Pin generieren | cyanLight1 | Trigger: start image generation |
| Pin wird generiert | cyanLight2 | Processing: image being generated |
| Pin generiert | purpleLight2 | Image generation complete |
| Metadaten generieren | orangeLight2 | Trigger: start metadata generation |
| Metadaten werden generiert | pinkLight2 | Processing: metadata being generated |
| Metadaten erstellt | blueLight1 | Metadata generation complete |
| Bereit zum Planen/Veröffentlichen | yellowLight2 | Ready to schedule or publish |
| Veröffentlicht | greenLight2 | Published to Pinterest |
| Fehler | redLight2 | Error state |
| Löschen | redBright | Marked for deletion |

### Relationship Fields

| Field | Type | Linked Table | Notes |
|-------|------|-------------|-------|
| Blog Artikel | multipleRecordLinks (prefersSingle) | Blog Artikel | N:1 — each pin links to one article |
| Board | multipleRecordLinks (prefersSingle) | Boards | N:1 — each pin targets one board |

### Rollup Fields (Denormalized Data)

These rollups pull data from linked records for display/n8n access:

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| Blog Artikel Content | rollup | Blog Artikel → Content | Full article content (for AI metadata generation) |
| Blog Artikel URL | rollup | Blog Artikel → Post URL | Article URL (for pin destination link) |
| Projekt Zielgruppe Rollup | rollup | Blog Artikel → Projekt Zielgruppe | Target audience (for AI context) |
| Projekt Rollup | rollup | Blog Artikel → Projekt | Project name |
| Name Rollup | rollup | Blog Artikel → Name | Article name |

---

## Table: Boards

### Core Fields

| Field | Type | Airtable ID | Required | Notes |
|-------|------|-------------|----------|-------|
| Name | singleLineText | `fldT0WcX12sKd2RVF` | Yes | Board name (from Pinterest) |
| Cover | multipleAttachments | `fldDOJMzf63RsPLuC` | No | Board cover image |
| pinterest_id | singleLineText | `fldmLx7yUj0X7q2qI` | Yes | Pinterest board ID (string, numeric) |

### Relationship Fields

| Field | Type | Linked Table | Notes |
|-------|------|-------------|-------|
| Blog Projekt | multipleRecordLinks | Blog Projekte | N:1 — each board belongs to one project |
| Pins | multipleRecordLinks | Pins | 1:N — one board has many pins |

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌──────────────────┐
│  Blog Projekte  │       │     Boards       │
│─────────────────│       │──────────────────│
│ Name            │ 1───N │ Name             │
│ Blog URL        │       │ Cover            │
│ Sprache         │       │ pinterest_id     │
│ Blog Nische     │       │                  │
│ Content Typ     │       └────────┬─────────┘
│ [AI context...] │                │
│ Brand Kit       │                │ N:1
└────────┬────────┘                │
         │                         │
         │ 1:N                     │
         │                         │
┌────────┴────────┐       ┌────────┴─────────┐
│  Blog Artikel   │       │      Pins        │
│─────────────────│       │──────────────────│
│ Name            │ 1───N │ PIN Titel        │
│ Post URL        │       │ Beschreibung     │
│ Content         │       │ Alt Text Bild    │
│ Änderungsdatum  │       │ Pin Bilder       │
│ Status          │       │ Veröffentlichung │
│ Fehlerbeschr.   │       │ Status           │
│                 │       │ Andere URL       │
│                 │       │ Fehlerbeschr.    │
└─────────────────┘       └──────────────────┘
```

**Relationships:**
- Blog Projekte 1:N Blog Artikel (via `Projekt` field)
- Blog Projekte 1:N Boards (via `Blog Projekt` field)
- Blog Artikel 1:N Pins (via `Blog Artikel` field)
- Boards 1:N Pins (via `Board` field)

---

## Key Observations for Supabase Migration

### 1. Multi-tenant Isolation (Already Addressed)
Airtable has no concept of tenants — it's a single-user base. Our Supabase schema already has `tenant_id` on `profiles`. All new tables need `tenant_id` + RLS policies.

### 2. AI Context is Rich and Extensive
The `Blog Projekte` table carries **16+ text fields** dedicated to AI/branding context. These fields are used by n8n to construct prompts for AI pin image generation and metadata generation. Design decision needed:
- **Option A:** Store all fields as individual columns (direct mapping)
- **Option B:** Store as JSONB blob for flexibility (easier to extend)
- **Option C:** Separate `blog_project_ai_config` table

### 3. Rollups Become JOINs
Airtable rollups (denormalized data on Pins table) won't exist in Postgres. These become:
- SQL JOINs in queries
- Or application-level data fetching via foreign keys
- No need to store duplicate data

### 4. Formula Fields Become App Logic
- `Domain`: Simple URL parsing → application code or generated column
- `Hook Prompt Kontext Part`: Complex prompt assembly → application code (server function)

### 5. Attachments Become Supabase Storage
- `Brand Kit` images → Supabase Storage bucket
- `Pin Bilder` → Supabase Storage bucket (pin images)
- `Board Cover` → Supabase Storage bucket (or URL reference to Pinterest CDN)
- Need to store metadata: width, height, filename, size

### 6. Status Fields Are Enums
- Article status: 4 values → Postgres ENUM or check constraint
- Pin status: 12 values → Postgres ENUM or check constraint
- Pin status drives workflow logic — consider a state machine approach

### 7. Timestamps
- Airtable uses `Europe/Berlin` timezone
- Supabase uses `TIMESTAMPTZ` (stores UTC, renders in any timezone)
- Conversion: store as UTC, render in Europe/Berlin in the app

### 8. Links Are Foreign Keys
All Airtable `multipleRecordLinks` with `prefersSingleRecordLink: true` become simple foreign key columns:
- `Blog Artikel.Projekt` → `blog_articles.blog_project_id` (UUID FK)
- `Pins.Blog Artikel` → `pins.blog_article_id` (UUID FK)
- `Pins.Board` → `pins.board_id` (UUID FK)
- `Boards.Blog Projekt` → `boards.blog_project_id` (UUID FK)

### 9. Select Fields
- `Sprache`: singleSelect → ENUM or TEXT with check constraint
- `Content Typ`: singleSelect → ENUM or TEXT with check constraint
- `Stil Optionen`: multipleSelects → TEXT[] array or junction table

### 10. Data Volume
Current data is small (2 projects, ~90 articles, ~100+ pins, ~90 boards per project). Performance won't be an issue, but the schema should support growth.

---

## Proposed Supabase Table Mapping

### blog_projects
```sql
-- Maps from: Blog Projekte
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id UUID NOT NULL REFERENCES profiles(tenant_id)
name TEXT NOT NULL
description TEXT                    -- Beschreibung des Blogs
blog_url TEXT NOT NULL              -- Blog URL
blog_niche TEXT                     -- Blog Nische
language TEXT CHECK (language IN ('de', 'en'))  -- Sprache
content_type TEXT                   -- Content Typ
-- AI context fields
target_audience TEXT                -- Zielgruppe
brand_voice TEXT                    -- Tonalität / Markenstimme
visual_style TEXT                   -- Visueller Stil / Bildsprache
keywords TEXT                       -- Allgemeine Keywords / Nische
value_proposition TEXT              -- Wertversprechen
topic_context TEXT                  -- Themen Kontext
visual_audience TEXT                -- Visuelle Zielgruppe
key_motifs TEXT                     -- Hauptmotive Beispiele
color_palette TEXT                  -- Farbpalette Beschreibung
lighting_style TEXT                 -- Licht Beschreibung
text_instructions TEXT              -- Spezielle Text Anweisungen
additional_instructions TEXT        -- Zusätzliche Anweisungen
style_options TEXT[]                -- Stil Optionen (array)
-- Timestamps
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### blog_articles
```sql
-- Maps from: Blog Artikel
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id UUID NOT NULL REFERENCES profiles(tenant_id)
blog_project_id UUID NOT NULL REFERENCES blog_projects(id) ON DELETE CASCADE
name TEXT NOT NULL                  -- Name (short title)
post_url TEXT NOT NULL              -- Post URL
content TEXT                        -- Content (scraped HTML/markdown)
article_modified_at TIMESTAMPTZ    -- Artikel Änderungsdatum
status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('fetch', 'new', 'scanned', 'error'))
error_description TEXT              -- Fehlerbeschreibung
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### pins
```sql
-- Maps from: Pins
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id UUID NOT NULL REFERENCES profiles(tenant_id)
blog_article_id UUID REFERENCES blog_articles(id) ON DELETE SET NULL
board_id UUID REFERENCES boards(id) ON DELETE SET NULL
title TEXT                          -- PIN Titel
description TEXT                    -- Beschreibung des Pins
alt_text TEXT                       -- Alt Text Bild
publish_date TIMESTAMPTZ           -- Veröffentlichungsdatum
status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
  'draft',                         -- Entwurf
  'ready_for_generation',          -- Bereit für Generierung
  'generate_pin',                  -- Pin generieren
  'generating_pin',                -- Pin wird generiert
  'pin_generated',                 -- Pin generiert
  'generate_metadata',             -- Metadaten generieren
  'generating_metadata',           -- Metadaten werden generiert
  'metadata_created',              -- Metadaten erstellt
  'ready_to_publish',              -- Bereit zum Planen/Veröffentlichen
  'published',                     -- Veröffentlicht
  'error',                         -- Fehler
  'deleted'                        -- Löschen
))
other_url TEXT                      -- Andere URL
error_description TEXT              -- Fehlerbeschreibung
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### boards
```sql
-- Maps from: Boards
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id UUID NOT NULL REFERENCES profiles(tenant_id)
blog_project_id UUID NOT NULL REFERENCES blog_projects(id) ON DELETE CASCADE
name TEXT NOT NULL                  -- Name
pinterest_id TEXT NOT NULL          -- pinterest_id (Pinterest's board ID)
cover_image_url TEXT               -- Cover (store URL reference)
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### pin_images (new — replaces Airtable attachments)
```sql
-- Replaces: Pin Bilder attachment field
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE
storage_path TEXT NOT NULL          -- Supabase Storage path
filename TEXT NOT NULL
width INTEGER
height INTEGER
size_bytes INTEGER
mime_type TEXT
sort_order INTEGER DEFAULT 0       -- preserve image ordering
created_at TIMESTAMPTZ DEFAULT NOW()
```

### brand_kit_files (new — replaces Airtable attachments)
```sql
-- Replaces: Brand Kit attachment field
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
blog_project_id UUID NOT NULL REFERENCES blog_projects(id) ON DELETE CASCADE
storage_path TEXT NOT NULL          -- Supabase Storage path
filename TEXT NOT NULL
width INTEGER
height INTEGER
size_bytes INTEGER
mime_type TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

---

## Airtable Field → Supabase Column Mapping (Complete)

### Blog Projekte → blog_projects

| Airtable Field | Airtable Type | Supabase Column | Supabase Type | Notes |
|----------------|--------------|-----------------|---------------|-------|
| Name | singleLineText | name | TEXT NOT NULL | |
| Beschreibung des Blogs | multilineText | description | TEXT | |
| Blog URL | url | blog_url | TEXT NOT NULL | |
| Blog Nische | singleLineText | blog_niche | TEXT | |
| Sprache | singleSelect | language | TEXT (check) | 'de', 'en' |
| Content Typ | singleSelect | content_type | TEXT | |
| Zielgruppe | multilineText | target_audience | TEXT | AI context |
| Tonalität / Markenstimme | multilineText | brand_voice | TEXT | AI context |
| Visueller Stil / Bildsprache | multilineText | visual_style | TEXT | AI context |
| Allgemeine Keywords / Nische | multilineText | keywords | TEXT | AI context |
| Wertversprechen | multilineText | value_proposition | TEXT | AI context |
| Themen Kontext | singleLineText | topic_context | TEXT | AI context |
| Visuelle Zielgruppe | multilineText | visual_audience | TEXT | AI context |
| Hauptmotive Beispiele | multilineText | key_motifs | TEXT | AI context |
| Farbpalette Beschreibung | multilineText | color_palette | TEXT | AI context |
| Licht Beschreibung | multilineText | lighting_style | TEXT | AI context |
| Spezielle Text Anweisungen | multilineText | text_instructions | TEXT | AI context |
| Zusätzliche Anweisungen | multilineText | additional_instructions | TEXT | AI context |
| Stil Optionen | multipleSelects | style_options | TEXT[] | Array |
| Brand Kit | multipleAttachments | → brand_kit_files table | Separate table | Storage |
| Blog Artikel | multipleRecordLinks | (reverse FK) | — | Query via blog_articles.blog_project_id |
| Boards | multipleRecordLinks | (reverse FK) | — | Query via boards.blog_project_id |
| Domain | formula | (computed) | — | Derive in app code |
| Hook Prompt Kontext Part | formula | (computed) | — | Build in server function |

### Blog Artikel → blog_articles

| Airtable Field | Airtable Type | Supabase Column | Supabase Type | Notes |
|----------------|--------------|-----------------|---------------|-------|
| Name | singleLineText | name | TEXT NOT NULL | |
| Post URL | url | post_url | TEXT NOT NULL | |
| Content | multilineText | content | TEXT | Large field |
| Artikel Änderungsdatum | dateTime | article_modified_at | TIMESTAMPTZ | |
| Status | singleSelect | status | TEXT (check) | Mapped to English keys |
| Fehlerbeschreibung | multilineText | error_description | TEXT | |
| Projekt | multipleRecordLinks | blog_project_id | UUID FK | |
| Pins | multipleRecordLinks | (reverse FK) | — | Query via pins.blog_article_id |
| Created | createdTime | created_at | TIMESTAMPTZ | |
| Last Modified | lastModifiedTime | updated_at | TIMESTAMPTZ | |
| Projekt Zielgruppe | rollup | (JOIN) | — | JOIN blog_projects |

### Pins → pins

| Airtable Field | Airtable Type | Supabase Column | Supabase Type | Notes |
|----------------|--------------|-----------------|---------------|-------|
| PIN Titel | singleLineText | title | TEXT | |
| Beschreibung des Pins | multilineText | description | TEXT | |
| Alt Text Bild | multilineText | alt_text | TEXT | |
| Pin Bilder | multipleAttachments | → pin_images table | Separate table | Storage |
| Veröffentlichungsdatum | dateTime | publish_date | TIMESTAMPTZ | |
| Status | singleSelect | status | TEXT (check) | 12-value enum |
| Andere URL | url | other_url | TEXT | |
| Fehlerbeschreibung | multilineText | error_description | TEXT | |
| Blog Artikel | multipleRecordLinks | blog_article_id | UUID FK | |
| Board | multipleRecordLinks | board_id | UUID FK | |
| Blog Artikel Content | rollup | (JOIN) | — | JOIN blog_articles |
| Blog Artikel URL | rollup | (JOIN) | — | JOIN blog_articles |
| Projekt Zielgruppe Rollup | rollup | (JOIN) | — | JOIN blog_articles → blog_projects |
| Projekt Rollup | rollup | (JOIN) | — | JOIN blog_articles → blog_projects |
| Name Rollup | rollup | (JOIN) | — | JOIN blog_articles |

### Boards → boards

| Airtable Field | Airtable Type | Supabase Column | Supabase Type | Notes |
|----------------|--------------|-----------------|---------------|-------|
| Name | singleLineText | name | TEXT NOT NULL | |
| Cover | multipleAttachments | cover_image_url | TEXT | URL or storage path |
| pinterest_id | singleLineText | pinterest_id | TEXT NOT NULL | |
| Blog Projekt | multipleRecordLinks | blog_project_id | UUID FK | |
| Pins | multipleRecordLinks | (reverse FK) | — | Query via pins.board_id |

---

## Design Decisions to Make During Planning

1. **AI context fields:** Individual columns vs JSONB? Individual columns are proposed above for type safety and queryability, but JSONB would allow easier extension without migrations.

2. **Pin status:** CHECK constraint (proposed above) vs Postgres ENUM vs separate status lookup table? CHECK constraint is simplest and most flexible for changes.

3. **Soft delete on pins:** The "Löschen" status acts as soft delete in Airtable. Keep as status value, or implement proper soft delete with `deleted_at` timestamp?

4. **Board cover storage:** Store in Supabase Storage (like pin images) or just reference the Pinterest CDN URL? Since boards are synced from Pinterest via n8n, a URL reference is simpler.

5. **Article content size:** Content can be very large (full HTML pages). Consider: TEXT column is fine for Postgres, but may need pagination in the UI. No need for a separate content table.

6. **RSS/scraping configuration:** Not present in current Airtable model. The roadmap requirements (BLOG-05) call for scraping settings per blog project. This needs to be added as new fields.

---

## Data Already in Supabase (Phase 1)

The existing migration (`00001_initial_schema.sql`) created:
- `profiles` table with `id`, `tenant_id`, `display_name`, `avatar_url`
- RLS policies on profiles
- Auto-profile creation trigger on user signup
- Auto-updated_at trigger

All new tables will extend this foundation and use `tenant_id` for RLS.

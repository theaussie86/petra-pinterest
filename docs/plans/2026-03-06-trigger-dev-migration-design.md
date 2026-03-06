# Trigger.dev Migration Design

**Date:** 2026-03-06
**Status:** Draft
**Scope:** Migrate metadata generation and blog scraping from Supabase Edge Functions to Trigger.dev

## Problem

Current Edge Functions have reliability issues with bulk operations:
- Fire-and-forget pattern loses track of job status
- No visibility into what's running or failing
- Silent failures in bulk metadata generation
- No automatic retries
- Manual re-invocation required for failed jobs

## Solution

Migrate to Trigger.dev for background job processing with:
- Built-in job queue with automatic retries
- Real-time status tracking
- Dashboard for monitoring and debugging
- In-app toast notifications for progress

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TanStack Start App                          │
├─────────────────────────────────────────────────────────────────┤
│  Client Components                                               │
│       ↓                                                          │
│  Server Functions (createServerFn)                               │
│       ↓                                                          │
│  src/trigger/                                                    │
│    ├── generate-metadata.ts   (single pin metadata)              │
│    ├── generate-metadata-batch.ts (bulk with child jobs)         │
│    ├── scrape-blog.ts         (sitemap discovery + dispatch)     │
│    └── scrape-single.ts       (single URL extraction)            │
└─────────────────────────────────────────────────────────────────┘
          ↓ trigger.tasks.trigger()
┌─────────────────────────────────────────────────────────────────┐
│                   Trigger.dev Cloud                              │
│  - Job queue with automatic retries (3x exponential backoff)     │
│  - Real-time status tracking via runs.retrieve()                 │
│  - Built-in dashboard for monitoring                             │
└─────────────────────────────────────────────────────────────────┘
          ↓ job execution
┌─────────────────────────────────────────────────────────────────┐
│                   External Services                              │
│  - Supabase (database + storage + Vault)                         │
│  - Gemini API (AI extraction + metadata)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Jobs to Create

### 1. `generate-metadata.ts` (Single Pin)
**Replaces:** `generate-metadata-single` edge function + sync `generateMetadataFn`

**Input:** `{ pin_id: string, tenant_id: string }`

**Steps:**
1. Set pin status to `generating_metadata`
2. Fetch pin + article data from Supabase
3. Get Gemini API key from Vault via RPC
4. Call Gemini vision API on pin image
5. Update pin with generated metadata
6. Record in `pin_metadata_generations` (prune to last 3)
7. Set status to `metadata_created`

**Error handling:** Update pin status to `error` with message, then re-throw for retry

### 2. `generate-metadata-batch.ts` (Bulk)
**Replaces:** `triggerBulkMetadataFn`

**Input:** `{ pin_ids: string[], tenant_id: string }`

**Behavior:** Uses `batchTrigger()` to spawn child `generate-metadata` jobs with concurrency limit

### 3. `scrape-blog.ts` (Discovery)
**Replaces:** `scrape-blog` edge function

**Input:** `{ project_id: string, tenant_id: string }`

**Steps:**
1. Fetch project's `sitemap_url` from database
2. Call `discoverSitemapUrls()` to get all URLs
3. Diff against existing `blog_articles` (check `lastmod`)
4. Trigger `scrape-single` jobs for new/updated URLs (batched)
5. Update project's `last_scraped_at`

### 4. `scrape-single.ts` (Single URL)
**Replaces:** `scrape-single` edge function

**Input:** `{ url: string, project_id: string, tenant_id: string }`

**Steps:**
1. Fetch HTML via `fetch()`
2. Extract article via `scrapeArticleWithGemini()`
3. Upsert to `blog_articles`

## UI Changes

### Toast-based Progress
- Persistent toast shows progress: "Generating metadata... 3/10 complete"
- Updates as jobs complete via polling `runs.retrieve()`
- Final summary: "✓ 8 succeeded, ✗ 2 failed (click to retry)"
- Link to Trigger.dev dashboard for detailed logs

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/server/metadata.ts` | Replace `supabase.functions.invoke()` with Trigger.dev |
| `src/lib/server/scraping.ts` | Replace `supabase.functions.invoke()` with Trigger.dev |
| `src/trigger/` (new dir) | Create 4 job files |

## Existing Utilities to Reuse

| Utility | Location |
|---------|----------|
| `scrapeArticleWithGemini()` | `server/lib/gemini-scraper.ts` |
| `discoverSitemapUrls()` | `server/lib/scraping.ts` |
| `getSupabaseServiceClient()` | `src/lib/supabase/service.ts` |
| Gemini API patterns | `supabase/functions/_shared/gemini.ts` |

## Error Handling

**Retry configuration (from trigger.config.ts):**
- 3 attempts max
- Exponential backoff: 1s → 2s → 4s (with jitter)
- Retries enabled in dev

**Error categories:**
| Type | Behavior |
|------|----------|
| Transient (timeout, 5xx) | Retry up to 3x |
| Rate limit (429) | Retry with backoff |
| Permanent (4xx, missing data) | Fail immediately |

**Pin status updates:**
- On start: `generating_metadata`
- On success: `metadata_created`
- On error: `error` + `error_message` field

## Migration Strategy

Keep Edge Functions during migration:
1. Add Trigger.dev jobs alongside existing Edge Functions
2. Add feature flag to switch between systems
3. Test Trigger.dev path, monitor for issues
4. Gradually enable Trigger.dev for all operations
5. Remove Edge Functions once stable

## Non-Goals

- Publishing pipeline (stays in n8n/Edge Functions for now)
- Token refresh (stays in Edge Functions)
- Image cleanup (stays in Edge Functions)
- Scheduled scraping (future enhancement)

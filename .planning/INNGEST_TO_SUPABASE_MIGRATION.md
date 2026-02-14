# Migration Plan: Inngest to Supabase Edge Functions

**Created:** 2026-02-14
**Status:** Draft — Ready for implementation
**Motivation:** Inngest free plan (500 runs/month) is insufficient. Cron jobs alone consume ~2,910 runs/month. Supabase-native stack has no run limits.

---

## Architecture Overview

### Current (Inngest)

```
Client → createServerFn → inngest.send(event)
                              ↓
                    Inngest Cloud orchestrates
                              ↓
                    Inngest calls back /api/inngest
                              ↓
                    Inngest function executes (step.run)
```

### Target (Supabase-native)

```
User-triggered (scraping, metadata):
  Client → createServerFn (orchestrator) → supabase.functions.invoke() per item
                                                      ↓
                                            Supabase Edge Function executes
                                                      ↓
                                            Writes to DB → Realtime pushes to client

Cron-triggered (publish, token refresh):
  pg_cron → pg_net HTTP POST → Supabase Edge Function
                                        ↓
                              Writes to DB → Realtime pushes to client
```

---

## What Changes

### Functions that become Edge Functions (4)

| # | Edge Function Name | Trigger | Current Inngest ID |
|---|---|---|---|
| 1 | `scrape-single` | `supabase.functions.invoke()` from server fn | `scrape-single-article` |
| 2 | `generate-metadata-single` | `supabase.functions.invoke()` from server fn | NEW (split from `generate-metadata-bulk`) |
| 3 | `publish-scheduled-pins` | `pg_cron` every 15 min | `publish-scheduled-pins` |
| 4 | `refresh-pinterest-tokens` | `pg_cron` daily 2 AM UTC | `refresh-pinterest-tokens` |

### Functions that become server-side orchestrators (2)

| # | Server Function | Current Inngest ID | Pattern |
|---|---|---|---|
| 1 | `scrapeBlogFn` (rewrite) | `scrape-blog` | Discover sitemap URLs, diff, loop → invoke `scrape-single` edge fn per URL |
| 2 | `triggerBulkMetadataFn` (rewrite) | `generate-metadata-bulk` | Loop pin IDs → invoke `generate-metadata-single` edge fn per pin |

### Code to delete

| Path | Reason |
|---|---|
| `server/inngest/` (entire directory) | Inngest client, all 5 function files, index.ts |
| `src/routes/api/inngest.ts` | Inngest webhook endpoint |
| `inngest` dependency in package.json | No longer needed |

---

## Detailed Plan by Function

### Plan 1: Database Setup — pg_cron, pg_net, Realtime Publication

**Goal:** Enable required Postgres extensions and add tables to Realtime publication.

**Migration SQL:**
```sql
-- Enable extensions (pg_cron and pg_net are likely already available)
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- Add tables to Realtime publication for live UI updates
alter publication supabase_realtime add table blog_articles;
alter publication supabase_realtime add table pins;
alter publication supabase_realtime add table pinterest_connections;

-- Store project URL and anon key in Vault (needed for pg_net → edge function calls)
-- (Run manually per environment, not in migration)
-- select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- select vault.create_secret('<anon-key>', 'edge_function_anon_key');
```

**Verification:** `select * from pg_extension where extname in ('pg_cron', 'pg_net');` returns 2 rows.

---

### Plan 2: Edge Function — `scrape-single`

**Goal:** Supabase Edge Function that scrapes a single URL with Gemini and upserts to `blog_articles`.

**Input (JSON body):**
```json
{
  "blog_project_id": "uuid",
  "url": "https://...",
  "tenant_id": "uuid"
}
```

**Logic (port from `server/inngest/functions/scrape-single.ts`):**
1. Create Supabase client with service role (from env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
2. Get Gemini API key from Vault via `get_gemini_api_key` RPC
3. Fetch URL HTML, clean, send to Gemini for extraction
4. Upsert article to `blog_articles` (conflict on `blog_project_id, url`)
5. Return `{ success: true }` or `{ success: false, error: "..." }`

**Deno dependencies:**
- `@google/genai` (Gemini SDK) — via npm specifier
- `@supabase/supabase-js` — via JSR
- HTML parsing: use Deno DOM or a lightweight approach (no `node-html-parser`)

**Key difference from Node version:**
- `server/lib/gemini-scraper.ts` uses `node-html-parser` — need Deno-compatible HTML cleaning
- `src/lib/gemini/client.ts` (`generateArticleFromHtml`) can be inlined or imported as shared code

**Auth:** `verify_jwt: false` — called from server function with service role, not from client. Alternatively, pass the user's JWT and verify it inside the function.

**Wall clock limit:** 400s (plenty for a single article scrape + Gemini call)

---

### Plan 3: Edge Function — `generate-metadata-single`

**Goal:** Supabase Edge Function that generates AI metadata for a single pin.

**Input (JSON body):**
```json
{
  "pin_id": "uuid",
  "tenant_id": "uuid"
}
```

**Logic (extract per-pin logic from `server/inngest/functions/generate-metadata.ts`):**
1. Create Supabase service client
2. Fetch pin + article data (join `blog_articles` for title/content/blog_project_id)
3. Get Gemini API key from Vault
4. Construct pin image URL from `image_path`
5. Call Gemini to generate title/description/alt_text
6. Insert into `pin_metadata_generations`
7. Update pin with metadata + status `metadata_created`
8. Prune old generations (keep last 3)
9. On error: set pin status to `error` with error_message

**Deno dependencies:**
- `@google/genai`, `@supabase/supabase-js`
- Gemini prompt imported from shared code or inlined

**Auth:** `verify_jwt: false` — invoked server-side.

---

### Plan 4: Edge Function — `publish-scheduled-pins`

**Goal:** Cron-triggered Edge Function that finds due pins and publishes them to Pinterest.

**Logic (port from `server/inngest/functions/publish-scheduled-pins.ts`):**
1. Create Supabase service client
2. Query pins where `status = 'ready_to_schedule'` AND `scheduled_at <= now()` AND project has `pinterest_connection_id`
3. Group by `pinterest_connection_id`
4. For each connection: get access token from Vault
5. For each pin in group:
   a. Set status to `publishing`
   b. Build Pinterest API payload (title, description, alt_text, image URL, link)
   c. Call Pinterest API (`createPinterestPin`)
   d. On success: set status `published`, store `pinterest_pin_id` and URL
   e. On error: set status `error` with message
   f. Rate limit: 10s delay between pins (use `setTimeout`)
6. Handle 429 (rate limit) with exponential backoff
7. Handle 401 (auth failure) by marking connection inactive

**Auth:** `verify_jwt: false` — invoked by pg_cron, no user context.

**Wall clock consideration:** With 10s delay per pin, this can process ~38 pins per 400s wall clock limit. If more pins are due, they'll be caught in the next 15-minute cron run.

**Retry behavior:** The function itself implements retry logic for 429s. pg_cron will re-trigger every 15 minutes regardless, picking up any missed pins.

---

### Plan 5: Edge Function — `refresh-pinterest-tokens`

**Goal:** Cron-triggered Edge Function that refreshes expiring Pinterest OAuth tokens.

**Logic (port from `server/inngest/functions/refresh-pinterest-tokens.ts`):**
1. Create Supabase service client
2. Query `pinterest_connections` where `is_active = true` AND `token_expires_at < now() + interval '7 days'`
3. For each connection:
   a. Get refresh token from Vault via `get_pinterest_refresh_token` RPC
   b. Call Pinterest API to refresh (`refreshPinterestToken`)
   c. Store new tokens in Vault via `store_pinterest_tokens` RPC
   d. Update `token_expires_at` on connection
   e. On error: mark connection `is_active = false` with `last_error`
4. Return summary (total, refreshed, failed)

**Auth:** `verify_jwt: false` — invoked by pg_cron.

---

### Plan 6: Rewrite Server Orchestrators

**Goal:** Rewrite `scrapeBlogFn` and `triggerBulkMetadataFn` to invoke Edge Functions instead of sending Inngest events.

#### 6a: `scrapeBlogFn` (src/lib/server/scraping.ts)

**Current:** Sends `blog/scrape.requested` Inngest event → Inngest orchestrates `scrape-blog` → fans out `scrape-single` events.

**New:** The server function itself becomes the orchestrator:
```ts
export const scrapeBlogFn = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    // 1. Auth check (existing)
    // 2. Call discoverSitemapUrls() directly (existing lib)
    // 3. Diff against existing articles in DB
    // 4. For each new URL: supabase.functions.invoke('scrape-single', { body: { ... } })
    //    - Fire-and-forget (don't await each one)
    //    - Or batch with Promise.allSettled for controlled concurrency
    // 5. Return { dispatched: N }
  })
```

**Concurrency strategy:** Use batched `Promise.allSettled` with a concurrency limit (e.g., 5 at a time) to avoid overwhelming the edge function runtime.

#### 6b: `triggerBulkMetadataFn` (src/lib/server/metadata.ts)

**Current:** Sends `pin/metadata.bulk-requested` Inngest event → Inngest orchestrates `generate-metadata-bulk` → processes pins sequentially.

**New:**
```ts
export const triggerBulkMetadataFn = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    // 1. Auth check (existing)
    // 2. Set all pin statuses to 'generating_metadata' (existing)
    // 3. For each pin_id: supabase.functions.invoke('generate-metadata-single', { body: { ... } })
    //    - Fire-and-forget per pin
    // 4. Return { pins_queued: N }
  })
```

**Note:** `generateMetadataFn` (single pin, synchronous) and `generateMetadataWithFeedbackFn` remain as server functions — they don't need edge functions since they're already synchronous and user-awaited.

---

### Plan 7: Set Up pg_cron Schedules

**Goal:** Register cron jobs to invoke edge functions on schedule.

**Migration SQL:**
```sql
-- Publish scheduled pins every 15 minutes
select cron.schedule(
  'publish-scheduled-pins',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/publish-scheduled-pins',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);

-- Refresh Pinterest tokens daily at 2 AM UTC
select cron.schedule(
  'refresh-pinterest-tokens',
  '0 2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/refresh-pinterest-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
```

**Verification:** `select * from cron.job;` shows 2 jobs.

---

### Plan 8: Add Supabase Realtime Subscriptions (Client)

**Goal:** Subscribe to database changes on articles and pins tables so the UI updates live during scraping/metadata generation.

**Where to add subscriptions:**

1. **Articles list page** (`_authed/projects/$id.tsx` or articles section):
   ```ts
   // Subscribe to new articles being inserted for this project
   supabase
     .channel(`articles:${projectId}`)
     .on('postgres_changes', {
       event: 'INSERT',
       schema: 'public',
       table: 'blog_articles',
       filter: `blog_project_id=eq.${projectId}`,
     }, () => {
       queryClient.invalidateQueries({ queryKey: ['articles', projectId] })
     })
     .subscribe()
   ```

2. **Pins list / Calendar** (status changes during metadata gen and publishing):
   ```ts
   supabase
     .channel(`pins:${projectId}`)
     .on('postgres_changes', {
       event: 'UPDATE',
       schema: 'public',
       table: 'pins',
       filter: `blog_project_id=eq.${projectId}`,
     }, () => {
       queryClient.invalidateQueries({ queryKey: ['pins'] })
     })
     .subscribe()
   ```

3. **Pinterest connection status** (token refresh):
   ```ts
   supabase
     .channel('connections')
     .on('postgres_changes', {
       event: 'UPDATE',
       schema: 'public',
       table: 'pinterest_connections',
     }, () => {
       queryClient.invalidateQueries({ queryKey: ['pinterest-connection'] })
     })
     .subscribe()
   ```

**Cleanup:** Unsubscribe in `useEffect` cleanup to prevent memory leaks.

**Pattern:** Use TanStack Query `invalidateQueries` on Realtime events rather than manual cache updates — simpler, uses existing hooks.

---

### Plan 9: Remove Inngest & Cleanup

**Goal:** Remove all Inngest-related code and dependencies.

**Files to delete:**
- `server/inngest/client.ts`
- `server/inngest/index.ts`
- `server/inngest/functions/scrape-blog.ts`
- `server/inngest/functions/scrape-single.ts`
- `server/inngest/functions/generate-metadata.ts`
- `server/inngest/functions/publish-scheduled-pins.ts`
- `server/inngest/functions/refresh-pinterest-tokens.ts`
- `src/routes/api/inngest.ts`

**Imports to remove:**
- `inngest` imports from `src/lib/server/scraping.ts`
- `inngest` imports from `src/lib/server/metadata.ts`

**Dependencies to remove:**
- `inngest` from `package.json`

**Server lib to keep:**
- `server/lib/scraping.ts` — still used by `scrapeBlogFn` orchestrator for `discoverSitemapUrls()`
- `server/lib/gemini-scraper.ts` — logic moves into edge function (can delete after porting)
- `server/lib/vault-helpers.ts` — still used by server functions for single-pin metadata

---

## Observability

### Built-in (no extra work)

| Layer | What it shows | Where |
|---|---|---|
| Edge Function logs | Per-invocation logs, status codes, execution time | Supabase Dashboard → Edge Functions |
| Edge Function reports | Execution time charts, invocation counts, regions | Supabase Dashboard → Reports → Edge Functions |
| `cron.job_run_details` | Every cron trigger with status/timing | `select * from cron.job_run_details order by start_time desc` |
| `net._http_response` | HTTP responses from pg_net calls (stored 6 hours) | `select * from net._http_response where status_code >= 400` |

### Useful debug queries

```sql
-- Check cron job health
select jobname, schedule, active,
       (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed')
from cron.job j;

-- Failed edge function invocations (last 6 hours)
select id, status_code, error_msg, content, created
from net._http_response
where status_code >= 400 or error_msg is not null
order by created desc limit 20;
```

---

## Execution Order

| Step | Plan | Depends on | Can parallelize? |
|---|---|---|---|
| 1 | DB Setup (pg_cron, pg_net, Realtime) | — | — |
| 2 | Edge Function: `scrape-single` | 1 | Yes, with 3-5 |
| 3 | Edge Function: `generate-metadata-single` | 1 | Yes, with 2,4,5 |
| 4 | Edge Function: `publish-scheduled-pins` | 1 | Yes, with 2,3,5 |
| 5 | Edge Function: `refresh-pinterest-tokens` | 1 | Yes, with 2-4 |
| 6 | Rewrite server orchestrators | 2, 3 | — |
| 7 | pg_cron schedules | 4, 5 | — |
| 8 | Realtime subscriptions (client) | 1 | Yes, with 2-7 |
| 9 | Remove Inngest & cleanup | 6, 7, 8 | — |

**Estimated effort:** ~4-6 hours total. Plans 2-5 are the bulk of the work (porting Node.js to Deno). Plans 6-9 are mostly wiring changes.

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Deno compatibility for Gemini SDK | Blocks scraping + metadata EFs | Test `@google/genai` via npm specifier in Deno early. Fallback: use Gemini REST API directly. |
| Edge Function 400s wall clock limit | Could timeout on large publish batches | Current 10s delay = ~38 pins max. Next cron run catches the rest. Acceptable. |
| pg_net 200 req/s limit | Could bottleneck high-volume scraping | Orchestrator batches with concurrency limit (5). Well within 200/s. |
| Realtime adds DB load | Each change checked against subscribers | Low subscriber count (single user per tenant). Use table-level filters to minimize overhead. |
| `node-html-parser` not available in Deno | Need alternative HTML cleaning | Use Deno DOM (`deno-dom`) or `linkedom`. Or simplify to regex-based tag stripping (already minimal logic). |

---

## What We Gain

1. **No run limits** — Supabase Edge Functions have no invocation cap
2. **No third-party dependency** — Everything runs on Supabase infrastructure
3. **Live UI updates** — Realtime subscriptions show scraping/metadata/publishing progress as it happens
4. **Better cron observability** — `cron.job_run_details` + `net._http_response` tables for debugging
5. **Cost savings** — Eliminates Inngest (would need $25/month upgrade)
6. **Simpler deployment** — No Inngest webhook endpoint, no separate Inngest dashboard to monitor

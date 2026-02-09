---
phase: 08-pinterest-oauth
plan: 04
subsystem: pinterest-publishing
tags: [pinterest, oauth, publishing, inngest, cron, automation]
dependency_graph:
  requires:
    - 08-03-pinterest-connection-ui-board-sync
  provides:
    - manual-pin-publishing
    - auto-publish-cron
    - token-refresh-cron
  affects:
    - pin-workflow
    - pinterest-connections
tech_stack:
  added:
    - pinterest-api-v5-pin-creation
    - inngest-cron-jobs
  patterns:
    - server-function-publishing
    - durable-execution-inngest
    - rate-limiting-exponential-backoff
    - vault-token-retrieval
key_files:
  created:
    - src/lib/server/pinterest-publishing.ts
    - server/inngest/functions/publish-scheduled-pins.ts
    - server/inngest/functions/refresh-pinterest-tokens.ts
  modified:
    - server/inngest/index.ts
decisions:
  - summary: "Exported publishSinglePin helper for Inngest reuse"
    context: "Both manual and automatic publishing need the same core logic"
    rationale: "Single source of truth prevents drift between manual and cron publish logic"
    alternatives: ["Duplicate logic in cron function", "Create separate publish service"]
  - summary: "10-second delay between bulk publishes"
    context: "Pinterest rate limits are 300 requests/hour per user"
    rationale: "Conservative rate limiting (6 pins/min = 360/hour) provides safety margin below API limits"
    alternatives: ["5-second delay (higher risk)", "Dynamic rate limiting based on response headers"]
  - summary: "No auto-retry on publish failure in manual functions"
    context: "User-triggered publish operations via server functions"
    rationale: "Per user decision in plan - failures set pin to error status for manual review"
    alternatives: ["Automatic retry with exponential backoff"]
  - summary: "Inngest cron uses step.sleep for rate limiting"
    context: "Need delay between pin publishes in cron job"
    rationale: "Inngest step.sleep enables durable execution with proper sleep/resume semantics"
    alternatives: ["setTimeout (not durable)", "Queue-based rate limiting"]
metrics:
  duration: 163
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  completed_at: "2026-02-09T14:09:38Z"
---

# Phase 8 Plan 04: Pin Publishing & Token Refresh Summary

**One-liner:** Manual and automatic Pinterest pin publishing with dual cron jobs (15-min auto-publish + daily token refresh) via Pinterest API v5

## What Was Built

Implemented the core value delivery of Pinterest integration — creating pins on Pinterest via both manual user actions and automatic scheduled publishing. Added proactive token refresh to keep OAuth connections healthy without user re-authorization.

### Server Functions (Manual Publishing)

**`src/lib/server/pinterest-publishing.ts`** — Server functions for user-triggered publishing:

- **`publishSinglePin(supabase, serviceClient, pinId)`** — Core publish logic shared by manual and cron operations:
  - Fetches pin with joined blog_articles (url), boards (pinterest_board_id), blog_projects (pinterest_connection_id)
  - Validates pin requirements: has board with pinterest_board_id, has pinterest_connection_id, has image_path
  - Updates pin status to 'publishing'
  - Retrieves access token from Vault via service client RPC
  - Constructs public image URL from Supabase storage
  - Builds PinterestCreatePinPayload with all fields: board_id, title (100 char max), description (800 char), alt_text (500 char), link (article URL), media_source (image_url)
  - Calls createPinterestPin from pinterest-api.ts
  - On success: updates pin with status='published', published_at, pinterest_pin_id, pinterest_pin_url
  - On error: updates pin with status='error', error_message
  - Returns PublishResult with success flag, pinterest_pin_id, and error message

- **`publishPinFn`** — TanStack Start server function for single pin manual publish:
  - Authenticates user via getSupabaseServerClient
  - Verifies pin belongs to user's tenant (RLS enforcement)
  - Calls publishSinglePin helper
  - Returns result to client

- **`publishPinsBulkFn`** — Server function for bulk manual publish:
  - Authenticates user and verifies all pins belong to tenant
  - Processes pins sequentially (not parallel) to respect rate limits
  - Adds 10-second delay between each pin (conservative rate limiting)
  - Collects results for all pins
  - Returns summary: total, published, failed, results array

### Inngest Cron Jobs (Automatic Publishing & Token Refresh)

**`server/inngest/functions/publish-scheduled-pins.ts`** — Auto-publish cron running every 15 minutes:

- Cron schedule: `TZ=UTC */15 * * * *`
- Finds pins with status='ready_to_schedule', scheduled_at <= now, and active pinterest_connection
- Groups pins by pinterest_connection_id for efficient token retrieval
- For each connection group:
  - Uses step.run for durable token retrieval from Vault
  - If token retrieval fails: marks all pins in group as error
  - Processes pins sequentially with step.run per pin for durability
  - Updates status to 'publishing' before API call
  - Builds same PinterestCreatePinPayload as manual publish
  - Calls createPinterestPin with retry logic:
    - On 429 (rate limited): respects Retry-After header, exponential backoff, max 3 retries
    - On 401 (auth failed): marks connection inactive, sets pin to error
    - On other error: sets pin to error with error_message
  - On success: updates pin with published status, pinterest_pin_id, pinterest_pin_url
  - Uses step.sleep for 10-second delay between pins (durable execution)
- Returns summary: total, published, failed, details array

**`server/inngest/functions/refresh-pinterest-tokens.ts`** — Token refresh cron running daily at 2 AM UTC:

- Cron schedule: `TZ=UTC 0 2 * * *`
- Finds active connections with token_expires_at < now + 7 days
- For each connection (using step.run for durability):
  - Retrieves refresh_token from Vault via RPC
  - Calls refreshPinterestToken from pinterest-api.ts
  - Calculates new expiration time (expires_in seconds)
  - Stores new access_token and refresh_token via store_pinterest_tokens RPC
  - Updates connection with new token_expires_at and clears last_error
  - On failure: marks connection inactive, sets last_error
- Returns summary: total, refreshed, failed, details array

**`server/inngest/index.ts`** — Updated to register 5 total functions:
- scrapeBlog
- scrapeSingle
- generateMetadataBulk
- publishScheduledPins (new)
- refreshPinterestTokens (new)

## Key Technical Decisions

### Shared Publish Logic

Extracted `publishSinglePin` as a standalone exported function used by both manual server functions and Inngest cron. This prevents drift between manual and automatic publishing logic — both code paths execute identical validation, token retrieval, API calls, and status updates.

### Rate Limiting Strategy

Implemented 10-second delays between consecutive pin publishes (both manual bulk and cron auto-publish). This conservative rate limit allows 6 pins/minute (360/hour), staying well below Pinterest's 300 requests/hour limit to account for other API calls (board sync, token refresh).

### Error Handling Patterns

**Manual publish (server functions):** No automatic retries per user decision. Failures immediately set pin to 'error' status with error_message for manual review and retry.

**Cron auto-publish:** Implements retry logic with exponential backoff for 429 (rate limit) errors. On 401 (auth failure), marks the entire connection inactive to prevent further failed publish attempts until user re-authorizes.

### Durable Execution with Inngest

Used Inngest's durable execution features:
- `step.run()` for each pin publish and token refresh — individual failures don't abort entire cron job
- `step.sleep()` for rate limiting delays — properly handles sleep/resume across function invocations
- Retry configuration: publishScheduledPins has `retries: 0` (per-pin retry logic handles transient errors), refreshPinterestTokens has `retries: 3` (token refresh is idempotent)

### Vault Security Pattern

All token retrieval goes through Supabase Vault RPCs:
- `get_pinterest_access_token(p_connection_id)` — retrieves decrypted access token
- `get_pinterest_refresh_token(p_connection_id)` — retrieves decrypted refresh token
- `store_pinterest_tokens(p_connection_id, p_access_token, p_refresh_token)` — stores encrypted tokens

Service role client required for Vault RPC calls (authenticated client can't access vault.secrets directly). Both manual and cron operations use getSupabaseServiceClient() for token operations.

## Deviations from Plan

None - plan executed exactly as written.

## What's Next

Phase 8 Plan 05: UI Integration - Add publish buttons to pin detail page and calendar view, wire up manual publish server functions, display publish status and Pinterest pin URLs.

## Files Reference

**Created:**
- `/Users/cweissteiner/NextJS/petra-pinterest/src/lib/server/pinterest-publishing.ts` — Manual pin publishing server functions (publishPinFn, publishPinsBulkFn, publishSinglePin)
- `/Users/cweissteiner/NextJS/petra-pinterest/server/inngest/functions/publish-scheduled-pins.ts` — Auto-publish cron (every 15 min)
- `/Users/cweissteiner/NextJS/petra-pinterest/server/inngest/functions/refresh-pinterest-tokens.ts` — Token refresh cron (daily 2 AM UTC)

**Modified:**
- `/Users/cweissteiner/NextJS/petra-pinterest/server/inngest/index.ts` — Registered publishScheduledPins and refreshPinterestTokens in functions array

## Self-Check: PASSED

All created files verified:
- FOUND: src/lib/server/pinterest-publishing.ts
- FOUND: server/inngest/functions/publish-scheduled-pins.ts
- FOUND: server/inngest/functions/refresh-pinterest-tokens.ts
- FOUND: server/inngest/index.ts (modified)

All commits verified:
- FOUND: af7a2ad (Task 1: Manual pin publishing server functions)
- FOUND: 0d99be9 (Task 2: Inngest cron jobs for auto-publishing and token refresh)

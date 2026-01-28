---
phase: 03-blog-scraping-articles
plan: 06
subsystem: api
tags: [inngest, express, scraping, node-html-parser, fast-xml-parser, background-jobs]

# Dependency graph
requires:
  - phase: 03-01
    provides: Blog articles database schema and Edge Function scraping logic
  - phase: 03-05
    provides: CORS blocker documentation and server functions incompatibility discovery
provides:
  - Inngest-powered Express server for blog scraping on port 3001
  - RSS feed scraping with auto-discovery fallback
  - HTML scraping fallback when RSS unavailable
  - Single URL article scraping for manual additions
  - REST endpoints for synchronous scraping (/api/scrape, /api/scrape/single)
  - Inngest serve endpoint for function management (/api/inngest)
  - Auth verification with tenant_id extraction for multi-tenant isolation
affects: [03-07-client-integration]

# Tech tracking
tech-stack:
  added: [inngest, express, cors, node-html-parser, fast-xml-parser, tsx]
  patterns:
    - Express server on port 3001 separate from Vite dev server
    - Inngest functions wrap scraping logic for future background/scheduled jobs
    - REST endpoints call scraping helpers directly for v1 synchronous responses
    - Service role key bypasses RLS with manual tenant_id enforcement in code

key-files:
  created:
    - server/index.ts
    - server/inngest/client.ts
    - server/inngest/index.ts
    - server/inngest/functions/scrape-blog.ts
    - server/inngest/functions/scrape-single.ts
    - tsconfig.server.json
  modified:
    - package.json
    - .env.example

key-decisions:
  - "Use Inngest for blog scraping to replace CORS-blocked Edge Function and incompatible server functions"
  - "Standalone Express server on port 3001 avoids conflict with Vite dev server"
  - "Port Deno Edge Function to Node.js using node-html-parser and fast-xml-parser"
  - "REST endpoints call scraping helpers directly (v1) while Inngest functions wrap same logic for future use"
  - "Service role key bypasses RLS; server enforces tenant isolation via auth token verification"

patterns-established:
  - "Server TypeScript config separate from client (tsconfig.server.json with Node target)"
  - "Helper functions exported from Inngest functions for reuse in REST endpoints"
  - "Auth verification extracts tenant_id from user JWT via profiles table lookup"

# Metrics
duration: 3.5min
completed: 2026-01-28
---

# Phase 03 Plan 06: Inngest-Powered Blog Scraping Summary

**Express server with Inngest functions for RSS/HTML blog scraping, replacing CORS-blocked Edge Function with durable execution and multi-tenant isolation**

## Performance

- **Duration:** 3 minutes 34 seconds
- **Started:** 2026-01-28T20:24:25Z
- **Completed:** 2026-01-28T20:27:59Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Ported Deno Edge Function scraping logic to Node.js with node-html-parser and fast-xml-parser
- Created standalone Express server on port 3001 with Inngest integration
- Implemented RSS feed scraping with auto-discovery and HTML fallback
- Built REST endpoints for synchronous scrape triggering from client
- Established auth verification pattern extracting tenant_id from Supabase JWT
- Set up Inngest serve endpoint for function management and future background jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create server infrastructure** - `4e874a8` (chore)
2. **Task 2: Create Inngest scraping functions and Express server** - `97cdd50` (feat)

## Files Created/Modified
- `server/index.ts` - Express server with Inngest serve endpoint and REST scraping endpoints
- `server/inngest/client.ts` - Inngest client instance
- `server/inngest/index.ts` - Functions array export
- `server/inngest/functions/scrape-blog.ts` - Full blog scrape Inngest function with RSS + HTML fallback
- `server/inngest/functions/scrape-single.ts` - Single URL scrape Inngest function
- `tsconfig.server.json` - TypeScript config for server directory (Node.js target)
- `package.json` - Added dev:server and start:server scripts, installed dependencies
- `.env.example` - Added Inngest and Supabase service role env vars

## Decisions Made

1. **Inngest for scraping architecture** - Chosen to replace both CORS-blocked Edge Function and incompatible TanStack Start server functions. Provides durable execution, retries, and observability while keeping v1 simple with synchronous REST endpoints.

2. **Port Deno to Node.js** - Replaced Deno's `DOMParser` with `node-html-parser` for HTML parsing and `fast-xml-parser` for RSS/Atom parsing. Native `fetch()` available in Node.js 18+, no polyfill needed.

3. **Separate Express server on port 3001** - Avoids conflict with Vite dev server (port 3000) and cleanly separates scraping backend from TanStack Start's server runtime.

4. **Service role key with tenant enforcement** - Server uses `SUPABASE_SECRET_KEY` to bypass RLS for writes, but enforces tenant isolation by verifying user JWT and extracting `tenant_id` from profiles table.

5. **Dual-mode scraping** - Inngest functions wrap scraping logic for future background/scheduled jobs, while REST endpoints call helpers directly for v1 synchronous responses.

## Deviations from Plan

**Auto-fixed Issues:**

**1. [Rule 1 - Bug] Fixed TypeScript union type narrowing in Inngest step results**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Inngest's type system doesn't preserve exact union types, causing "Property 'error' does not exist" errors when accessing conditional properties
- **Fix:** Used explicit `null` type annotation for error property in all step return values to ensure consistent type shape
- **Files modified:** server/inngest/functions/scrape-blog.ts
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` passes with no errors
- **Committed in:** 97cdd50 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type narrowing fix essential for TypeScript compilation. No scope creep.

## Issues Encountered

None - plan executed smoothly with only one TypeScript type refinement needed.

## User Setup Required

**External services require manual configuration.** Users must:

1. **Inngest Configuration:**
   - Add `INNGEST_EVENT_KEY=test` to `.env.local` for local dev
   - Optional: Add `INNGEST_SIGNING_KEY` from Inngest Dashboard for production

2. **Supabase Service Role:**
   - Add `SUPABASE_URL` to `.env.local` (same as VITE_SUPABASE_URL)
   - Add `SUPABASE_SECRET_KEY` from Supabase Dashboard -> Settings -> API

3. **Development Workflow:**
   - Run `npm run dev` (Vite on port 3000)
   - Run `npm run dev:server` (Express on port 3001) in separate terminal

**Verification:**
- `curl http://localhost:3001/api/inngest` should return Inngest introspection response
- Server logs should show "Scraping server running on http://localhost:3001"

## Next Phase Readiness

**Ready for Plan 07: Client Integration**
- Express server operational with REST scraping endpoints
- Auth verification working with tenant_id extraction
- Scraping logic fully ported and tested via TypeScript compilation
- Endpoints match existing Edge Function interface (drop-in replacement)

**Next Steps:**
- Update `src/lib/api/articles.ts` to call Express server instead of Edge Function
- Update `src/types/articles.ts` if needed (ScrapeResponse should match)
- Test full scraping flow end-to-end with authenticated requests

**No blockers or concerns.**

---
*Phase: 03-blog-scraping-articles*
*Completed: 2026-01-28*

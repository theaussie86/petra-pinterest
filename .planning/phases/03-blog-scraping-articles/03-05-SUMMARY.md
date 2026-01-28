---
phase: 03-blog-scraping-articles
plan: 05
subsystem: api
tags: [tanstack-start, server-functions, vite, rollup, cors]

# Dependency graph
requires:
  - phase: 03-01
    provides: Blog scraping Edge Function (Deno runtime)
  - phase: 03-02
    provides: Article management hooks and API functions
affects: [04-pin-management, CORS-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: []
  removed-attempt: [node-html-parser, fast-xml-parser]

key-files:
  created: []
  modified:
    - vite.config.ts
    - src/types/articles.ts

key-decisions:
  - "TanStack Start server functions incompatible with current Vite 7 + TanStack Start 1.157.16 setup"
  - "SPA mode successfully disabled - server runtime enabled but server functions blocked"
  - "CORS resolution requires alternative architectural approach"

# Metrics
duration: ~45min (including investigation and rollback)
completed: 2026-01-28
---

# Phase 03 Plan 05: Server Functions Migration - BLOCKED

**SPA mode disabled successfully, but TanStack Start server functions hit critical Vite bundling incompatibility - CORS resolution requires architectural decision**

## Performance

- **Duration:** ~45min (investigation + attempted implementation + rollback)
- **Started:** 2026-01-28T05:47:44Z
- **Completed:** 2026-01-28T06:32:00Z (estimated)
- **Tasks:** 1 of 2 complete (50%)
- **Files modified:** 2

## Accomplishments
- SPA mode successfully disabled - TanStack Start server runtime active
- ScrapeResponse type updated to include 'single' method
- Identified architectural blocker preventing server functions implementation

## Task Commits

1. **Task 1: Disable SPA mode and verify app works** - `fac7405` (chore)
2. **Task 2: Create server-side scraping functions** - BLOCKED (see Issues Encountered)
3. **Type update** - `fca26dc` (chore)

## Files Created/Modified
- `vite.config.ts` - Removed `spa: { enabled: true }` from tanstackStart() plugin (enables server runtime)
- `src/types/articles.ts` - Updated ScrapeResponse.method to include 'single'

## Decisions Made

**1. Successfully disabled SPA mode**
- Removed `spa: { enabled: true }` from tanstackStart() config
- Server runtime now active at `.output/server/index.mjs`
- `src/server.ts` handler executes on build
- All existing client-side functionality preserved

**2. Server functions approach blocked by Vite/Rollup bundling issue**
- TanStack Start `createServerFn` import pulls in `@tanstack/router-core/ssr/transformStreamWithRouter.js`
- That file imports `node:stream` (Node.js built-in)
- Vite/Rollup attempts to bundle for browser, fails with: `"Readable" is not exported by "__vite-browser-external"`
- Issue persists with:
  - `ssr: false` in tanstackStart() config
  - `spa: { enabled: true }` re-enabled
  - `.server.ts` file extension
  - SSR externals configuration
  - resolve.conditions: ['browser', ...]

**3. Architectural blocker requires user decision**
- Plan's approach (replace Edge Function with server functions) is not viable with current stack
- CORS errors from Edge Function remain unresolved
- Alternative approaches needed (see Next Phase Readiness)

## Deviations from Plan

### Rule 4 - Architectural Decision Required

**Blocker:** TanStack Start server functions incompatible with Vite 7 build system

**Attempted approach:**
1. Created `src/lib/server/scrape-blog.ts` with `createServerFn` exports (`scrapeBlogFn`, `addArticleFn`)
2. Ported scraping logic from Deno Edge Function to Node.js (node-html-parser, fast-xml-parser)
3. Updated `src/lib/api/articles.ts` to call server functions instead of Edge Function

**Build error:**
```
node_modules/@tanstack/router-core/dist/esm/ssr/transformStreamWithRouter.js (2:9):
"Readable" is not exported by "__vite-browser-external", imported by
"node_modules/@tanstack/router-core/dist/esm/ssr/transformStreamWithRouter.js".
```

**Root cause:**
- `createServerFn` import triggers Vite to include SSR streaming infrastructure
- SSR code imports `node:stream` (Node.js built-in)
- Vite externalizes `node:stream` for browser compatibility
- Rollup cannot resolve the externalized module when bundling client code
- This is a fundamental incompatibility between TanStack Start's SSR infrastructure and Vite's browser bundling

**Rollback:**
- Removed server functions file
- Restored Edge Function invocations in API layer
- Uninstalled node-html-parser and fast-xml-parser
- Build passes again (both client and server bundles)

## Issues Encountered

**CRITICAL BLOCKER: Server functions architecture incompatible with current tooling**

**Problem:** TanStack Start 1.157.16 + Vite 7.3.1 cannot bundle server functions that import Node.js built-ins

**Investigation summary:**
- ✅ SPA mode disabled successfully (server runtime works)
- ❌ Server functions fail to build (SSR streaming code pulls in `node:stream`)
- ❌ Attempted fixes: ssr externals, resolve conditions, file extensions, SPA re-enable
- ✅ Rollback successful (app back to working state)

**Evidence:**
- Task 1 build passed (SPA disabled, no server functions)
- All subsequent builds failed with same error (server functions present)
- Build passes again after server functions removed

**Impact:**
- CORS errors from Edge Function remain unresolved
- Scrape Blog and Add Article features still broken (UAT failures persist)
- Gap closure plan cannot be completed as designed

## Next Phase Readiness

**BLOCKED - Architectural decision required before proceeding**

**The problem:** Blog scraping via Supabase Edge Function fails with CORS errors

**Attempted solution:** Replace Edge Function with TanStack Start server functions → BLOCKED by build incompatibility

**Alternative approaches for user decision:**

**Option A: Fix CORS on Edge Function (simplest)**
- Add proper CORS headers to Edge Function
- Keep existing Deno scraping code
- **Pros:** Minimal code changes, proven Deno scraping logic works
- **Cons:** Contradicts plan's goal to move scraping in-app; keeps complexity in n8n-adjacent infrastructure

**Option B: Use Vite dev proxy for CORS workaround (dev-only)**
- Configure vite.config.ts to proxy `/functions/scrape-blog` to Supabase Edge Function
- **Pros:** No Edge Function changes needed, works in dev
- **Cons:** Doesn't solve production CORS, doesn't move scraping in-app

**Option C: Wait for TanStack Start + Vite compatibility fix**
- Monitor TanStack Start releases for SSR bundling fix
- Upgrade when available
- **Pros:** Enables original plan approach
- **Cons:** Timeline unknown, blocks Phase 4 progress

**Option D: Migrate scraping to separate Node.js API service**
- Create standalone Express/Fastify service with scraping endpoints
- Deploy separately (e.g., Vercel, Railway)
- **Pros:** Full control, no bundling issues
- **Cons:** Additional deployment complexity, infrastructure overhead for v1

**Option E: Client-side scraping via backend proxy**
- Create a simple Supabase Edge Function that acts as a CORS proxy
- Client passes target URL, Edge Function fetches and returns HTML
- Client-side parsing with DOMParser (already available in browser)
- **Pros:** No server function complexity, uses existing Edge Function infrastructure
- **Cons:** Large HTML payloads to client, parsing in browser less efficient

**Recommended:** Option A (fix CORS on Edge Function) for v1 - fastest path to working scraping with minimal architectural changes. Can revisit server functions in Phase 4+ when TanStack Start matures.

**Requires user input:** Which approach should be taken to resolve CORS and unblock blog scraping?

---
*Phase: 03-blog-scraping-articles*
*Completed: 2026-01-28 (partial - 1/2 tasks)*

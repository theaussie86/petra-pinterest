---
phase: 08-pinterest-oauth
plan: 02
subsystem: auth
tags: [pinterest, oauth, pkce, vault, tokens, security]

# Dependency graph
requires:
  - phase: 08-01
    provides: Database schema (pinterest_connections, oauth_state_mapping), Vault RPC functions, Pinterest API client helpers
provides:
  - Complete Pinterest OAuth 2.0 flow with PKCE + state parameter security
  - Server functions for OAuth initiation, token exchange, disconnect, and status check
  - OAuth callback route handler for Pinterest redirect
  - Encrypted token storage in Supabase Vault
  - Multi-account connection support with tenant isolation
affects: [08-03-board-sync, 08-04-publishing-integration, project-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - OAuth 2.0 with PKCE flow for third-party API integration
    - Supabase Vault for encrypted token storage via SECURITY DEFINER RPC functions
    - Service role client for Vault operations (bypass RLS)
    - TanStack Start server functions for authenticated API operations
    - OAuth state mapping for CSRF protection and request context preservation

key-files:
  created:
    - src/lib/server/pinterest-oauth.ts
    - src/routes/auth.pinterest.callback.tsx
  modified:
    - src/routeTree.gen.ts

key-decisions:
  - "Use service role client for Vault operations - authenticated client can't access vault.secrets directly"
  - "Store state mapping in database with 10-minute expiration - enables CSRF protection and request context (blog_project_id) preservation"
  - "Support connection reuse across projects - multiple blog projects can share one Pinterest connection, cleanup only when last project disconnects"
  - "Exchange callback returns blog_project_id - enables redirect back to specific project page after OAuth completion"

patterns-established:
  - "OAuth flow pattern: initiate (generate PKCE + state) → Pinterest authorize → callback (exchange code) → redirect with success/error"
  - "Vault token storage pattern: use getSupabaseServiceClient() for RPC calls to store_pinterest_tokens/delete_pinterest_tokens"
  - "Connection cleanup pattern: check if other projects use connection before deleting tokens and connection row"
  - "OAuth callback route pattern: TanStack Router file-based route with validateSearch, beforeLoad for processing, and loading fallback component"

# Metrics
duration: 2.5min
completed: 2026-02-09
---

# Phase 08 Plan 02: Pinterest OAuth Flow Implementation Summary

**Complete OAuth 2.0 flow with PKCE + state parameter security, encrypted Vault token storage, and multi-account connection support**

## Performance

- **Duration:** 2min 28sec
- **Started:** 2026-02-09T13:56:37Z
- **Completed:** 2026-02-09T14:01:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Users can initiate Pinterest OAuth from blog project context with PKCE code challenge
- OAuth callback exchanges authorization code for tokens and stores them encrypted in Vault
- Multi-account support: multiple projects can share one Pinterest connection, cleanup only when unused
- Connection status API enables UI to display current Pinterest account and expiration

## Task Commits

Each task was committed atomically:

1. **Task 1: Pinterest OAuth server functions** - `10de6aa` (feat)
2. **Task 2: Pinterest OAuth callback route** - `c7db470` (feat)

## Files Created/Modified
- `src/lib/server/pinterest-oauth.ts` - Four server functions: initPinterestOAuthFn (generates PKCE params and auth URL), exchangePinterestCallbackFn (exchanges code for tokens, stores in Vault, links to project), disconnectPinterestFn (unlinks connection, cleans up if unused), getPinterestConnectionFn (fetches connection status)
- `src/routes/auth.pinterest.callback.tsx` - TanStack Router file-based route at /auth/pinterest/callback that handles Pinterest OAuth redirect, exchanges code for tokens, and redirects user back to project page with success/error indication
- `src/routeTree.gen.ts` - Auto-generated route tree updated with Pinterest callback route

## Decisions Made

**1. Service role client for Vault operations**
- Rationale: Authenticated client (getSupabaseServerClient) cannot directly access vault.secrets table due to RLS. Vault RPC functions use SECURITY DEFINER to bypass RLS, but must be called via service role client (getSupabaseServiceClient) to work correctly.

**2. State mapping stored in database with expiration**
- Rationale: OAuth state parameter prevents CSRF attacks. Storing in database (with blog_project_id, tenant_id, user_id, code_verifier) enables: (1) CSRF protection, (2) returning user to correct project after OAuth, (3) tenant isolation verification, (4) automatic cleanup after 10 minutes.

**3. Connection reuse across projects**
- Rationale: Multiple blog projects within one tenant can share a single Pinterest connection (1 user = 1 Pinterest account). Disconnect only removes project's FK reference; connection and tokens are only deleted if no other projects reference it. Simplifies multi-project management and avoids unnecessary re-authorization.

**4. Exchange callback returns blog_project_id for redirect**
- Rationale: OAuth flow initiated from project context should return user to that project page after success. State mapping preserves blog_project_id across OAuth redirect, enabling specific redirect target instead of generic dashboard landing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - OAuth flow implementation proceeded smoothly with clear requirements and well-defined database schema from Plan 01.

## User Setup Required

**External services require manual configuration.** Pinterest OAuth credentials (PINTEREST_APP_ID, PINTEREST_APP_SECRET, PINTEREST_REDIRECT_URI) must be added to environment variables. These will be documented in Phase 08 USER-SETUP.md after all OAuth features are complete.

For now, placeholder env vars are expected in server functions but won't be populated until Pinterest Developer app is configured.

## Next Phase Readiness

- OAuth foundation complete and ready for UI integration (Plan 03)
- Board sync (Plan 04) can use getPinterestConnectionFn to check connection status before API calls
- Publishing integration (Plan 05) can retrieve tokens from Vault via get_pinterest_access_token RPC
- Connection status check available for project detail page to show "Connect Pinterest" button

## Self-Check

Verifying all claimed artifacts exist:

- File: src/lib/server/pinterest-oauth.ts
- File: src/routes/auth.pinterest.callback.tsx
- Commit: 10de6aa (Task 1)
- Commit: c7db470 (Task 2)

**Self-Check: PASSED** - All files created, all commits exist, build passes, route tree includes Pinterest callback route.

---
*Phase: 08-pinterest-oauth*
*Completed: 2026-02-09*

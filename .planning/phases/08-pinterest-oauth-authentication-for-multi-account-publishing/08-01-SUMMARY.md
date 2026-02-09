---
phase: 08-pinterest-oauth
plan: 01
subsystem: pinterest-oauth-foundation
tags: [database, api-client, oauth, vault]

dependency_graph:
  requires: []
  provides:
    - pinterest_connections table with RLS
    - oauth_state_mapping table for CSRF/PKCE
    - Supabase Vault integration for encrypted token storage
    - Pinterest API v5 client (exchange, refresh, fetch, create)
    - pinterest_connection_id FK on blog_projects
    - pinterest_pin_url column on pins
    - 'publishing' status in pin workflow
    - Service role bypass policies for Inngest
  affects:
    - blog_projects (new FK column)
    - pins (new column, updated status constraint)
    - boards (new service_role policy)

tech_stack:
  added:
    - Supabase Vault extension (encrypted secret storage)
    - Pinterest API v5 client (OAuth + boards + pins)
  patterns:
    - SECURITY DEFINER RPC functions for Vault access
    - PKCE OAuth flow (code verifier + challenge)
    - Service role bypass policies for background jobs

key_files:
  created:
    - supabase/migrations/00009_pinterest_oauth.sql
    - src/types/pinterest.ts
    - src/lib/server/pinterest-api.ts
  modified:
    - src/types/pins.ts

decisions:
  - key: Supabase Vault for token encryption
    rationale: Pinterest OAuth tokens are sensitive credentials requiring encryption at rest; Vault provides built-in encryption with SECURITY DEFINER RPC functions for secure access
    alternatives: [Client-side encryption, Environment variables]

  - key: Service role bypass policies for Inngest
    rationale: Background publishing jobs run without user session context; service_role policies enable Inngest to perform tenant-isolated writes after token-based auth verification
    alternatives: [Postgres service role, JWT service keys]

  - key: PKCE OAuth flow over implicit grant
    rationale: Pinterest API v5 requires authorization code flow with PKCE for security; implicit grant is deprecated and unavailable
    alternatives: [None - Pinterest API requirement]

  - key: 'publishing' as system-managed status
    rationale: Prevents users from manually setting status during async publish operation; system controls transition from ready_to_schedule → publishing → published/error
    alternatives: [Reuse ready_to_schedule, Add published_pending]

metrics:
  duration: 144s
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_at: 2026-02-09
---

# Phase 08 Plan 01: Pinterest OAuth Foundation Summary

Database schema and API client foundation for Pinterest OAuth multi-account publishing, including encrypted token storage via Vault, OAuth state management, and Pinterest API v5 client with rate-limiting.

## Tasks Completed

| Task | Name                                    | Commit  | Files                                                    |
| ---- | --------------------------------------- | ------- | -------------------------------------------------------- |
| 1    | Database migration for Pinterest OAuth  | adaf376 | supabase/migrations/00009_pinterest_oauth.sql            |
| 2    | Pinterest API v5 client and types       | 921e024 | src/types/pinterest.ts, src/lib/server/pinterest-api.ts, src/types/pins.ts |

## What Was Built

### Database Schema

**pinterest_connections table** - Stores Pinterest account connection metadata for multi-account publishing:
- Unique constraint on `(tenant_id, pinterest_user_id)` prevents duplicate connections
- `token_expires_at` tracks OAuth token expiration (30 days for Pinterest)
- `is_active` flag for connection health (false when token refresh fails)
- `last_error` captures failure details for debugging
- RLS policies enforce tenant isolation with service_role bypass for Inngest

**oauth_state_mapping table** - Short-lived OAuth CSRF and PKCE state storage:
- `state` + `code_verifier` support PKCE authorization code flow
- `blog_project_id` links OAuth callback to project context
- `expires_at` auto-set to NOW() + 10 minutes for security
- RLS policy restricts access to initiating user only

**Vault integration** - Encrypted token storage via Supabase Vault:
- `store_pinterest_tokens()` RPC - Securely stores access + refresh tokens
- `get_pinterest_access_token()` RPC - Retrieves decrypted access token
- `get_pinterest_refresh_token()` RPC - Retrieves decrypted refresh token
- `delete_pinterest_tokens()` RPC - Removes both tokens on disconnect
- All functions are SECURITY DEFINER for secure Vault access

**Schema additions:**
- `blog_projects.pinterest_connection_id` FK - Links project to Pinterest connection
- `pins.pinterest_pin_url` TEXT - Stores published pin URL from Pinterest
- `pins.status` constraint updated - Added 'publishing' status (amber color)
- Service role policies on pins/boards - Enables Inngest background publishing

### API Client

**Pinterest API v5 client** (`src/lib/server/pinterest-api.ts`) - Server-only utility for Pinterest communication:

**OAuth functions:**
- `exchangePinterestCode()` - Exchange authorization code for tokens (OAuth step 2)
- `refreshPinterestToken()` - Refresh access token using refresh token
- HTTP Basic Auth header for token endpoint (`appId:appSecret` base64)
- Content-Type: `application/x-www-form-urlencoded` for token requests

**API functions:**
- `fetchPinterestUser()` - GET `/v5/user_account` for username and account_type
- `fetchPinterestBoards()` - Paginated GET `/v5/boards` with bookmark handling
- `createPinterestPin()` - POST `/v5/pins` with rate limit retry logic (429 handling)
- Rate limiting: 3 retries with exponential backoff (2^attempt * 1000ms) + jitter

**Helper functions:**
- `generateCodeVerifier()` - 64-byte random base64url string for PKCE
- `generateCodeChallenge()` - SHA-256 hash of verifier, base64url encoded
- `generateState()` - 32-byte random base64url CSRF token
- `pinterestFetch()` - Generic wrapper with Bearer auth and error parsing

**TypeScript types** (`src/types/pinterest.ts`):
- `PinterestConnection` - DB row type for connections table
- `OAuthState` - DB row type for state mapping table
- `PinterestTokenResponse` - OAuth token endpoint response
- `PinterestUserResponse`, `PinterestBoardResponse`, `PinterestPinResponse` - API v5 responses
- `PinterestCreatePinPayload` - Pin creation request body

**Pin workflow update** (`src/types/pins.ts`):
- Added `publishing` status with amber color badge
- Added to `SYSTEM_MANAGED_STATUSES` array (not user-selectable)
- Status progression: `ready_to_schedule` → `publishing` → `published`/`error`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Migration file `00009_pinterest_oauth.sql` contains all required DDL
- [x] `src/types/pinterest.ts` exports all Pinterest-related types
- [x] `src/lib/server/pinterest-api.ts` exports all API client functions
- [x] `src/types/pins.ts` includes 'publishing' status with amber color
- [x] `npm run build` passes with no TypeScript errors

## Self-Check

Verifying created files exist:

```bash
[ -f "supabase/migrations/00009_pinterest_oauth.sql" ] && echo "FOUND: supabase/migrations/00009_pinterest_oauth.sql"
[ -f "src/types/pinterest.ts" ] && echo "FOUND: src/types/pinterest.ts"
[ -f "src/lib/server/pinterest-api.ts" ] && echo "FOUND: src/lib/server/pinterest-api.ts"
```

Verifying commits exist:

```bash
git log --oneline --all | grep -q "adaf376" && echo "FOUND: adaf376"
git log --oneline --all | grep -q "921e024" && echo "FOUND: 921e024"
```

## Self-Check: PASSED

All files created and all commits verified successfully.

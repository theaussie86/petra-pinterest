# Phase 8: Pinterest OAuth Authentication for Multi-Account Publishing - Research

**Researched:** 2026-02-09
**Domain:** Pinterest API v5 OAuth 2.0, Token Management, Pin Publishing
**Confidence:** HIGH

## Summary

Phase 8 integrates Pinterest OAuth 2.0 to enable direct pin publishing from the app, replacing the current n8n workflow. The Pinterest API v5 uses standard OAuth 2.0 with access tokens valid for 30 days and refresh tokens valid for 365 days. Pin creation requires board_id and media_source (image URL or base64), with optional metadata including title, description, link, and alt_text for accessibility.

Key architectural decisions: per-project OAuth connections stored in database with encrypted tokens, manual board syncing via "Sync boards" button, dual publishing modes (automatic cron + manual "Publish now"), and graceful error handling with retry capability. The existing Inngest + TanStack Start server function pattern established in Phases 3-4 directly supports the background job requirements.

**Primary recommendation:** Use Supabase Vault for token encryption (built-in, battle-tested), implement OAuth flow with PKCE + state parameter security, store Pinterest connection per blog_project (many-to-one Pinterest account model), and leverage existing Inngest cron pattern for scheduled publishing with exponential backoff retry logic.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Account connection UX:**
- Connect Pinterest from within a blog project's settings — per-project connection, not a global settings page
- After OAuth redirect: success toast + connected account name shown inline in project settings
- Disconnect with confirmation dialog warning about impact on scheduled pins
- OAuth failure or cancellation: inline error in project settings with "Try again" option

**Multi-account model:**
- Multiple blog projects can share the same Pinterest account (many-to-one)
- All boards from the connected Pinterest account are available in pin board dropdown — no per-project board filtering
- When Pinterest connects, replace n8n-synced boards with boards from Pinterest API (single source of truth)
- Board syncing is manual only — user clicks a "Sync boards" button to refresh from Pinterest

**Publishing workflow:**
- Both automatic scheduled publishing AND manual "Publish now" button
- Auto-publish: Inngest cron job runs on interval, checks for pins due for publishing, publishes them
- Manual: user clicks "Publish" on individual pin or bulk selects
- Publish failure: pin goes to 'fehler' status with error message, user can manually retry (no auto-retry)
- After successful publish: store both Pinterest pin ID (for future API operations) and public pin URL on the pin record

**Pin data sent to Pinterest API:**
- Image, title, description, link (blog article URL), board, and alt_text
- Alt text from AI-generated metadata included for Pinterest accessibility

**n8n transition:**
- Keep n8n as fallback — workflows remain but are disabled once OAuth is connected
- Disable n8n board sync once app handles it via OAuth
- n8n pin publishing disabled once app publishes directly

**Credentials management:**
- Pinterest app credentials (app ID, app secret) via environment variables — no admin UI

### Claude's Discretion

- Token storage schema (encrypted columns, separate table, etc.)
- Token refresh implementation details
- Cron job interval for auto-publishing
- OAuth callback route structure
- Error message specifics for different failure modes

### Deferred Ideas (OUT OF SCOPE)

None specified — discussion stayed within phase scope

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pinterest API v5 | Latest | OAuth & pin publishing | Current official API version, replaces deprecated v3 |
| Supabase Vault | Built-in | Encrypted token storage | PostgreSQL extension included with all Supabase projects, handles encryption key management securely |
| Inngest | ^3.x | Scheduled publishing cron | Already established in codebase for blog scraping and metadata generation (Phases 3-4) |
| TanStack Start createServerFn | Latest | OAuth callback handler | Framework's built-in server function pattern, already used for auth.ts and scraping.ts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | Latest | Database operations | All token CRUD operations, RLS enforcement |
| axios or native fetch | Latest | Pinterest API calls | HTTP client for OAuth token exchange and pin publishing endpoints |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Vault | pgcrypto with custom encryption | Vault is simpler (managed keys, automatic encryption), pgcrypto requires manual key rotation and more complex RLS policies |
| Pinterest API v5 | Pinterest API v3 | v3 is deprecated, v5 has longer token lifetimes and better OAuth flow |
| Inngest cron | Vercel Cron or custom scheduler | Inngest already integrated, provides retry logic and observability out-of-box |
| Server-side token refresh | Client-side token refresh | Server-side ensures tokens never exposed to browser, aligns with security best practices |

**Installation:**

```bash
# No new packages required — using existing stack
# Pinterest API v5 uses standard HTTPS endpoints (no SDK needed)
# Supabase Vault is a PostgreSQL extension (enable via migration)
```

**Environment variables to add:**

```bash
PINTEREST_APP_ID=your_app_id
PINTEREST_APP_SECRET=your_app_secret
PINTEREST_REDIRECT_URI=https://yourdomain.com/auth/pinterest/callback
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── api/
│   │   └── pinterest.ts              # Pinterest API client functions
│   ├── server/
│   │   ├── pinterest-oauth.ts        # OAuth flow server functions
│   │   └── pinterest-publishing.ts   # Publishing server functions
│   └── hooks/
│       └── use-pinterest-connection.ts # TanStack Query hooks
├── routes/
│   ├── auth/
│   │   └── pinterest.callback.tsx    # OAuth redirect handler
│   └── _authed/
│       └── projects/$id.tsx          # Enhanced with Pinterest connect UI
server/
└── inngest/
    └── functions/
        ├── publish-scheduled-pins.ts # Auto-publish cron job
        ├── sync-pinterest-boards.ts  # Manual board sync job
        └── refresh-pinterest-tokens.ts # Token refresh job
supabase/
└── migrations/
    └── 000XX_pinterest_oauth_integration.sql
```

### Pattern 1: OAuth Flow with PKCE + State Parameter

**What:** Standard OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange) and state parameter for CSRF protection

**When to use:** All Pinterest OAuth connections

**Example:**

```typescript
// Source: Pinterest API v5 OAuth docs + OAuth 2.1 security best practices
// https://developers.pinterest.com/docs/api/v5/oauth-token/

// 1. Initiate OAuth flow (client-side)
import { createServerFn } from '@tanstack/react-start'

export const initPinterestOAuthFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data }) => {
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateRandomString(128)
    const codeChallenge = await sha256(codeVerifier)

    // Generate state parameter (store in session)
    const state = generateRandomString(32)

    // Store state + codeVerifier in session/database with blog_project_id
    // (Pinterest doesn't support passing custom state, so store mapping server-side)

    const authUrl = new URL('https://www.pinterest.com/oauth/')
    authUrl.searchParams.set('client_id', process.env.PINTEREST_APP_ID!)
    authUrl.searchParams.set('redirect_uri', process.env.PINTEREST_REDIRECT_URI!)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'boards:read,boards:write,pins:read,pins:write')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    return { authUrl: authUrl.toString() }
  })

// 2. Handle OAuth callback (route handler)
// File: src/routes/auth/pinterest.callback.tsx
export const Route = createFileRoute('/auth/pinterest/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || undefined,
    state: (search.state as string) || undefined,
    error: (search.error as string) || undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (search.error) {
      // Handle OAuth error (user cancelled, permission denied, etc.)
      throw redirect({
        to: '/projects/$id',
        params: { id: /* retrieve from state mapping */ },
        search: { pinterest_error: search.error }
      })
    }

    // Verify state parameter (CSRF protection)
    const isValidState = await verifyStateFn({ data: { state: search.state! } })
    if (!isValidState) {
      throw redirect({ to: '/dashboard', search: { error: 'Invalid state' } })
    }

    // Exchange code for tokens
    const result = await exchangePinterestCodeFn({
      data: { code: search.code!, state: search.state! }
    })

    if (result.success) {
      throw redirect({
        to: '/projects/$id',
        params: { id: result.blog_project_id },
        search: { pinterest_connected: 'true' }
      })
    }

    throw redirect({ to: '/dashboard', search: { error: 'Connection failed' } })
  },
})

// 3. Exchange authorization code for tokens (server function)
export const exchangePinterestCodeFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string; state: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    // Retrieve codeVerifier and blog_project_id from state mapping
    const { data: stateData } = await supabase
      .from('oauth_state_mapping')
      .select('code_verifier, blog_project_id, tenant_id')
      .eq('state', data.state)
      .single()

    // Exchange code for tokens with Pinterest
    const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: data.code,
        redirect_uri: process.env.PINTEREST_REDIRECT_URI!,
        code_verifier: stateData.code_verifier
      })
    })

    const tokens = await tokenResponse.json()

    // Store encrypted tokens in Supabase Vault
    await supabase.rpc('store_pinterest_tokens', {
      p_blog_project_id: stateData.blog_project_id,
      p_tenant_id: stateData.tenant_id,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    })

    // Clean up state mapping
    await supabase.from('oauth_state_mapping').delete().eq('state', data.state)

    return { success: true, blog_project_id: stateData.blog_project_id }
  })
```

### Pattern 2: Token Refresh with Automatic Retry

**What:** Background job that checks for expiring tokens and refreshes them proactively

**When to use:** Inngest cron job running daily to ensure tokens stay fresh

**Example:**

```typescript
// Source: Pinterest API v5 OAuth docs + Inngest patterns
// https://developers.pinterest.com/docs/api/v5/oauth-token/

import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'

export const refreshPinterestTokens = inngest.createFunction(
  {
    id: 'refresh-pinterest-tokens',
    retries: 3  // Inngest built-in retry
  },
  { cron: 'TZ=UTC 0 2 * * *' }, // Daily at 2 AM UTC
  async ({ step }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Find tokens expiring in next 7 days
    const expiringThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const { data: connections } = await supabase
      .from('pinterest_connections')
      .select('id, blog_project_id, tenant_id')
      .lt('token_expires_at', expiringThreshold.toISOString())
      .eq('is_active', true)

    if (!connections || connections.length === 0) {
      return { refreshed: 0, message: 'No tokens need refreshing' }
    }

    const results = await Promise.all(
      connections.map(conn =>
        step.run(`refresh-${conn.id}`, async () => {
          try {
            // Get encrypted refresh token from Vault
            const { data: secrets } = await supabase
              .from('vault.decrypted_secrets')
              .select('decrypted_secret')
              .eq('name', `pinterest_refresh_token_${conn.id}`)
              .single()

            // Exchange refresh token for new access token
            const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(
                  `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
                ).toString('base64')}`
              },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: secrets.decrypted_secret
              })
            })

            if (!tokenResponse.ok) {
              // Token refresh failed — mark connection as invalid
              await supabase
                .from('pinterest_connections')
                .update({ is_active: false, last_error: 'Token refresh failed' })
                .eq('id', conn.id)

              return { id: conn.id, success: false, error: 'Refresh failed' }
            }

            const tokens = await tokenResponse.json()

            // Update tokens in Vault
            await supabase.rpc('update_pinterest_tokens', {
              p_connection_id: conn.id,
              p_access_token: tokens.access_token,
              p_refresh_token: tokens.refresh_token,
              p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            })

            return { id: conn.id, success: true }
          } catch (error) {
            return { id: conn.id, success: false, error: String(error) }
          }
        })
      )
    )

    return {
      total: connections.length,
      refreshed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    }
  }
)
```

### Pattern 3: Pin Publishing with Exponential Backoff

**What:** Auto-publish scheduled pins with rate limit handling and exponential backoff retry

**When to use:** Inngest cron job for scheduled publishing + manual publish trigger

**Example:**

```typescript
// Source: Pinterest API v5 pins-create endpoint + error handling best practices
// https://developers.pinterest.com/docs/api/v5/pins-create/

import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'

export const publishScheduledPins = inngest.createFunction(
  {
    id: 'publish-scheduled-pins',
    retries: 0  // Handle retries manually per-pin
  },
  { cron: 'TZ=UTC */15 * * * *' }, // Every 15 minutes
  async ({ step }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Find pins scheduled for publishing (within last 15 min window)
    const now = new Date()
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000)

    const { data: pins } = await supabase
      .from('pins')
      .select(`
        id,
        tenant_id,
        blog_project_id,
        title,
        description,
        image_path,
        board_id,
        alt_text,
        blog_articles!inner(url),
        blog_projects!inner(pinterest_connection_id)
      `)
      .eq('status', 'bereit_zum_planen')
      .gte('scheduled_at', windowStart.toISOString())
      .lte('scheduled_at', now.toISOString())

    if (!pins || pins.length === 0) {
      return { published: 0, failed: 0, message: 'No pins to publish' }
    }

    const results = await Promise.all(
      pins.map(pin =>
        step.run(`publish-${pin.id}`, async () =>
          publishPinWithRetry(supabase, pin, 0)
        )
      )
    )

    return {
      total: pins.length,
      published: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results
    }
  }
)

async function publishPinWithRetry(
  supabase: any,
  pin: any,
  attemptNumber: number,
  maxAttempts: number = 3
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    // Get access token from Vault
    const { data: connection } = await supabase
      .from('pinterest_connections')
      .select('id')
      .eq('id', pin.blog_projects.pinterest_connection_id)
      .single()

    const { data: tokenSecret } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `pinterest_access_token_${connection.id}`)
      .single()

    // Get public URL for pin image
    const { data: imageUrl } = supabase.storage
      .from('pin-images')
      .getPublicUrl(pin.image_path)

    // Create pin via Pinterest API
    const response = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenSecret.decrypted_secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        board_id: pin.board_id,
        title: pin.title,
        description: pin.description,
        alt_text: pin.alt_text,
        link: pin.blog_articles.url,
        media_source: {
          source_type: 'image_url',
          url: imageUrl.publicUrl
        }
      })
    })

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      if (attemptNumber >= maxAttempts) {
        await supabase
          .from('pins')
          .update({
            status: 'fehler',
            error_message: 'Rate limited after max retries'
          })
          .eq('id', pin.id)

        return { id: pin.id, success: false, error: 'Rate limited' }
      }

      const retryAfter = response.headers.get('Retry-After')
      const delayMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.pow(2, attemptNumber) * 1000 + Math.random() * 1000 // Exponential backoff with jitter

      await new Promise(resolve => setTimeout(resolve, delayMs))
      return publishPinWithRetry(supabase, pin, attemptNumber + 1, maxAttempts)
    }

    // Handle auth errors (token expired)
    if (response.status === 401) {
      await supabase
        .from('pins')
        .update({
          status: 'fehler',
          error_message: 'Pinterest authentication failed - reconnect account'
        })
        .eq('id', pin.id)

      return { id: pin.id, success: false, error: 'Auth failed' }
    }

    // Handle other client errors (don't retry)
    if (response.status >= 400 && response.status < 500) {
      const errorData = await response.json()
      await supabase
        .from('pins')
        .update({
          status: 'fehler',
          error_message: errorData.message || `Pinterest API error ${response.status}`
        })
        .eq('id', pin.id)

      return { id: pin.id, success: false, error: errorData.message }
    }

    // Handle server errors (retry)
    if (response.status >= 500) {
      if (attemptNumber >= maxAttempts) {
        await supabase
          .from('pins')
          .update({
            status: 'fehler',
            error_message: 'Pinterest server error after max retries'
          })
          .eq('id', pin.id)

        return { id: pin.id, success: false, error: 'Server error' }
      }

      const delayMs = Math.pow(2, attemptNumber) * 1000 + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, delayMs))
      return publishPinWithRetry(supabase, pin, attemptNumber + 1, maxAttempts)
    }

    // Success — update pin with Pinterest data
    const pinterestPin = await response.json()
    await supabase
      .from('pins')
      .update({
        status: 'veroeffentlicht',
        published_at: new Date().toISOString(),
        pinterest_pin_id: pinterestPin.id,
        pinterest_pin_url: `https://www.pinterest.com/pin/${pinterestPin.id}/`
      })
      .eq('id', pin.id)

    return { id: pin.id, success: true }

  } catch (error) {
    // Network or other unexpected errors
    if (attemptNumber >= maxAttempts) {
      await supabase
        .from('pins')
        .update({
          status: 'fehler',
          error_message: `Publish failed: ${String(error)}`
        })
        .eq('id', pin.id)

      return { id: pin.id, success: false, error: String(error) }
    }

    const delayMs = Math.pow(2, attemptNumber) * 1000 + Math.random() * 1000
    await new Promise(resolve => setTimeout(resolve, delayMs))
    return publishPinWithRetry(supabase, pin, attemptNumber + 1, maxAttempts)
  }
}
```

### Pattern 4: Board Syncing

**What:** Manual "Sync boards" button fetches all boards from Pinterest and replaces existing boards for that project

**When to use:** User clicks "Sync boards" in project settings, or after initial OAuth connection

**Example:**

```typescript
// Source: Pinterest API v5 boards-list endpoint
// https://developers.pinterest.com/docs/api/v5/boards-list/

export const syncPinterestBoardsFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const user = await fetchUser()

    // Get Pinterest connection for project
    const { data: project } = await supabase
      .from('blog_projects')
      .select('pinterest_connection_id, tenant_id')
      .eq('id', data.blog_project_id)
      .eq('tenant_id', user.tenant_id)
      .single()

    // Get access token from Vault
    const { data: tokenSecret } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', `pinterest_access_token_${project.pinterest_connection_id}`)
      .single()

    // Fetch boards from Pinterest (paginated)
    let allBoards: any[] = []
    let bookmark: string | undefined

    do {
      const url = new URL('https://api.pinterest.com/v5/boards')
      url.searchParams.set('page_size', '100')
      if (bookmark) url.searchParams.set('bookmark', bookmark)

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${tokenSecret.decrypted_secret}`
        }
      })

      if (!response.ok) {
        return { success: false, error: `Pinterest API error ${response.status}` }
      }

      const data = await response.json()
      allBoards.push(...data.items)
      bookmark = data.bookmark
    } while (bookmark)

    // Replace boards for this project (transaction-like behavior)
    // 1. Delete existing boards
    await supabase
      .from('boards')
      .delete()
      .eq('blog_project_id', data.blog_project_id)
      .eq('tenant_id', project.tenant_id)

    // 2. Insert new boards from Pinterest
    const boardsToInsert = allBoards.map(board => ({
      tenant_id: project.tenant_id,
      blog_project_id: data.blog_project_id,
      name: board.name,
      pinterest_board_id: board.id,
      cover_image_url: board.media?.image_cover_url
    }))

    await supabase
      .from('boards')
      .insert(boardsToInsert)

    return {
      success: true,
      synced_count: allBoards.length,
      boards: allBoards.map(b => ({ id: b.id, name: b.name }))
    }
  })
```

### Anti-Patterns to Avoid

- **Storing tokens in localStorage or client-side state:** Tokens must stay server-side only (Supabase Vault + service role access)
- **Retrying 4xx errors (except 429):** 400, 401, 403, 404 are client errors that won't succeed on retry — only retry 429 (rate limit) and 5xx (server errors)
- **Using client_credentials grant type for user operations:** Pinterest requires user authorization flow for publishing to user boards
- **Ignoring Retry-After header on 429 responses:** Pinterest provides this header — use it instead of fixed delays
- **Passing client_id/client_secret in request body:** Pinterest token endpoint requires HTTP Basic Authentication header
- **Allowing redirect_uri mismatch:** Must exactly match registered URI including protocol (http vs https) and trailing slashes

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token encryption | Custom AES encryption + key rotation | Supabase Vault | Vault manages encryption keys securely in isolated system, handles key rotation, prevents keys from being stored in database or logs |
| OAuth state management | Session storage with custom expiry | Short-lived database records with cleanup | PKCE code verifier + state must be securely stored server-side, race conditions with session stores, database records ensure atomic operations |
| Rate limit handling | Custom token bucket implementation | Exponential backoff with jitter + Retry-After header | Pinterest provides Retry-After header when rate limited, custom implementations miss this signal and can cascade failures |
| Token refresh logic | Manual checks before each API call | Background cron job + proactive refresh | Checking expiry before every call adds latency, background job ensures tokens refreshed before expiration, avoids publish failures |
| Duplicate pin detection | Custom URL hashing or database checks | Let Pinterest handle it naturally | Pinterest API will return error if duplicate detected, no need for complex client-side deduplication logic |
| Retry queuing | Custom job queue with Redis | Inngest's built-in step retry | Inngest provides durable execution, automatic retries with exponential backoff, and observability out-of-box |

**Key insight:** OAuth 2.0 security is deceptively complex — state parameter prevents CSRF, PKCE prevents authorization code interception, but both require server-side storage with proper cleanup. Token refresh requires handling race conditions when multiple requests trigger refresh simultaneously. Pinterest rate limits are per-user and per-app — custom implementations rarely account for both dimensions. Supabase Vault and Inngest already solve these problems correctly.

---

## Common Pitfalls

### Pitfall 1: Redirect URI Mismatch

**What goes wrong:** OAuth fails with "Invalid redirect URI" or "Redirect URI mismatch" error, even though URI looks correct

**Why it happens:** Pinterest requires exact match including protocol (http vs https), trailing slashes, port numbers (localhost:3000 vs localhost), and query parameters. Development vs production URLs often differ subtly.

**How to avoid:**
- Register separate redirect URIs for development (http://localhost:3000/auth/pinterest/callback) and production (https://yourdomain.com/auth/pinterest/callback)
- Use environment variable for redirect URI to ensure consistency: `process.env.PINTEREST_REDIRECT_URI`
- Test OAuth flow in both environments before launch
- Log the exact redirect_uri sent to Pinterest and compare with dashboard registration

**Warning signs:** OAuth redirect fails with Pinterest error page instead of returning to app, error parameter in callback URL contains "redirect_uri"

### Pitfall 2: Token Refresh Race Conditions

**What goes wrong:** Multiple API calls detect expired token simultaneously, trigger multiple refresh requests, causing one to succeed and others to fail with "invalid refresh token" error

**Why it happens:** Refresh tokens are single-use in OAuth 2.0 — once exchanged for new access token, the refresh token is invalidated. Concurrent requests don't coordinate.

**How to avoid:**
- Use background cron job to refresh tokens proactively (7 days before expiry)
- If refreshing on-demand, implement mutex/lock pattern using database transaction or Redis lock
- Store token expiry time and check before making API calls to avoid refresh attempts during publish
- Return new refresh token from refresh operation and update Vault immediately

**Warning signs:** Intermittent "invalid refresh token" errors, multiple Pinterest connections showing "disconnected" status after working previously, Inngest logs showing parallel token refresh attempts

### Pitfall 3: RLS Policies Block Service Role Operations

**What goes wrong:** Inngest background jobs fail to read/update pins or boards with "insufficient privileges" error, even though queries work in authenticated routes

**Why it happens:** Supabase RLS policies enforce `auth.uid()` checks which return NULL for service role client. Background jobs use service role key to bypass auth, but RLS policies still evaluate and block access.

**How to avoid:**
- Add explicit RLS policies for service role: `TO service_role USING (true)`
- OR use service role client with RLS disabled: `supabase.rpc('disable_rls')`
- OR use Postgres functions that run with `SECURITY DEFINER` to execute with owner privileges
- Test Inngest functions with service role key in local environment before deploying

**Warning signs:** Functions work when called from authenticated routes but fail in Inngest jobs, "permission denied" or "insufficient privileges" errors in Inngest logs, queries work in SQL editor but fail in code

### Pitfall 4: Pinterest Access Token Not Valid for Pins

**What goes wrong:** OAuth completes successfully, boards sync works, but pin publishing fails with 403 Forbidden or insufficient permissions error

**Why it happens:** OAuth scope requested doesn't include `pins:write`. Pinterest has separate scopes for boards (boards:read, boards:write) and pins (pins:read, pins:write). If scope is wrong during initial OAuth, must re-authorize.

**How to avoid:**
- Request all required scopes upfront in authorization URL: `boards:read,boards:write,pins:read,pins:write`
- Store granted scopes in database after OAuth (Pinterest returns scope in token response)
- Check granted scopes before attempting pin operations
- Provide "Reconnect" button if scope insufficient, explaining what changed

**Warning signs:** Board operations work but pin creation fails, Pinterest API returns 403 with message about missing permissions, token response has different scope than requested

### Pitfall 5: Image URL Not Accessible to Pinterest

**What goes wrong:** Pin creation fails with "media source unavailable" or "failed to fetch image" error, even though image URL is valid and accessible from browser

**Why it happens:** Pinterest fetches image from URL server-side. If URL is localhost, behind VPN, requires authentication, or has CORS restrictions, Pinterest can't access it. Supabase Storage public URLs work, but RLS policies might block anonymous access.

**How to avoid:**
- Ensure pin-images Storage bucket is public (`public: true` in bucket config)
- Verify RLS policy allows public SELECT: `TO public USING (bucket_id = 'pin-images')`
- Test image URL in incognito browser to confirm public access
- Use `getPublicUrl()` not `createSignedUrl()` for Pinterest media_source
- For development, use ngrok or similar tunnel if testing with local images

**Warning signs:** Pin creation works in production but fails in local development, Pinterest API returns generic "invalid media source" error, images load in app but Pinterest can't fetch them

### Pitfall 6: Continuous Refresh Flag Not Set (Legacy Apps)

**What goes wrong:** Access tokens expire after 30 days instead of being refreshable indefinitely, forcing users to re-authorize frequently

**Why it happens:** Pinterest changed token behavior on September 25, 2025. Apps created before this date must set `continuous_refresh: true` parameter in token request to get indefinitely refreshable tokens. New apps get this by default.

**How to avoid:**
- Check Pinterest app creation date in developer dashboard
- If app created before Sept 25, 2025, add `continuous_refresh: true` to token exchange request body
- New apps (created after Sept 25, 2025) don't need this parameter
- Document this in code comments for future maintenance

**Warning signs:** Users need to reconnect Pinterest accounts every 30 days, refresh token requests fail with "token expired" after 30-60 days, no new refresh token returned in refresh response

---

## Code Examples

Verified patterns from official sources:

### OAuth Authorization URL

```typescript
// Source: Pinterest API v5 OAuth documentation
// https://developers.pinterest.com/docs/api/v5/oauth-token/

const authUrl = new URL('https://www.pinterest.com/oauth/')
authUrl.searchParams.set('client_id', process.env.PINTEREST_APP_ID!)
authUrl.searchParams.set('redirect_uri', process.env.PINTEREST_REDIRECT_URI!)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', 'boards:read,boards:write,pins:read,pins:write')
authUrl.searchParams.set('state', state) // CSRF protection
authUrl.searchParams.set('code_challenge', codeChallenge) // PKCE
authUrl.searchParams.set('code_challenge_method', 'S256')
```

### Token Exchange with HTTP Basic Auth

```typescript
// Source: Pinterest API v5 OAuth token endpoint
// https://developers.pinterest.com/docs/api/v5/oauth-token/

const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${Buffer.from(
      `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
    ).toString('base64')}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: process.env.PINTEREST_REDIRECT_URI!,
    code_verifier: codeVerifier // PKCE verifier
  })
})

// Response:
// {
//   access_token: "...",
//   token_type: "bearer",
//   expires_in: 2592000, // 30 days in seconds
//   refresh_token: "...",
//   scope: "boards:read,boards:write,pins:read,pins:write"
// }
```

### Supabase Vault Insert and Decrypt

```sql
-- Source: Supabase Vault documentation
-- https://supabase.com/docs/guides/database/vault

-- Insert encrypted secret
INSERT INTO vault.secrets (name, secret)
VALUES (
  'pinterest_access_token_<connection_id>',
  '<access_token_value>'
);

-- Decrypt and read secret
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'pinterest_access_token_<connection_id>';
```

### Create Pin Request Body

```typescript
// Source: Pinterest API v5 pins-create endpoint
// https://developers.pinterest.com/docs/api/v5/pins-create/

const pinPayload = {
  board_id: "549755885175", // Required: Pinterest board ID (string of digits)
  title: "10 Tips for Better Sleep", // Optional: max 100 chars
  description: "Improve your sleep quality with these science-backed tips...", // Optional: max 800 chars
  alt_text: "Infographic showing 10 sleep improvement tips with icons", // Optional: max 500 chars, accessibility
  link: "https://yourblog.com/articles/sleep-tips", // Optional: max 2048 chars, article URL
  media_source: {
    source_type: "image_url",
    url: "https://project.supabase.co/storage/v1/object/public/pin-images/tenant-id/pin-id.jpg"
  }
}

const response = await fetch('https://api.pinterest.com/v5/pins', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(pinPayload)
})

// Response includes:
// {
//   id: "1234567890", // Pinterest pin ID
//   board_id: "549755885175",
//   created_at: "2026-02-09T12:00:00Z",
//   link: "https://www.pinterest.com/pin/1234567890/",
//   media: { /* image URLs in various sizes */ },
//   ...
// }
```

### List Boards with Pagination

```typescript
// Source: Pinterest API v5 boards-list endpoint
// https://developers.pinterest.com/docs/api/v5/boards-list/

async function fetchAllBoards(accessToken: string): Promise<any[]> {
  let allBoards: any[] = []
  let bookmark: string | undefined

  do {
    const url = new URL('https://api.pinterest.com/v5/boards')
    url.searchParams.set('page_size', '100') // Max 250, default 25
    if (bookmark) url.searchParams.set('bookmark', bookmark)

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    const data = await response.json()
    allBoards.push(...data.items)
    bookmark = data.bookmark // undefined when no more pages
  } while (bookmark)

  return allBoards
}

// Board item structure:
// {
//   id: "549755885175",
//   name: "My Board",
//   description: "Board description",
//   privacy: "PUBLIC" | "PROTECTED" | "SECRET",
//   owner: { username: "..." },
//   created_at: "2026-01-15T10:00:00Z",
//   pin_count: 42,
//   follower_count: 128,
//   media: { image_cover_url: "..." }
// }
```

### Inngest Cron Function Registration

```typescript
// Source: Inngest cron documentation + existing codebase pattern
// https://www.inngest.com/docs/guides/scheduled-functions

import { inngest } from '../client'

export const publishScheduledPins = inngest.createFunction(
  {
    id: 'publish-scheduled-pins',
    retries: 3,
    concurrency: { limit: 5 } // Max 5 concurrent executions
  },
  { cron: 'TZ=UTC */15 * * * *' }, // Every 15 minutes
  async ({ event, step }) => {
    // Implementation here
  }
)

// Register in server/inngest/index.ts
import { publishScheduledPins } from './functions/publish-scheduled-pins'
import { refreshPinterestTokens } from './functions/refresh-pinterest-tokens'
import { syncPinterestBoards } from './functions/sync-pinterest-boards'

export const functions = [
  scrapeBlog,
  scrapeSingle,
  generateMetadataBulk,
  publishScheduledPins,
  refreshPinterestTokens,
  syncPinterestBoards
]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pinterest API v3 | Pinterest API v5 | v3 deprecated 2023 | v5 has longer token lifetimes (30/365 days vs 1 hour), better OAuth flow with PKCE support, cleaner REST endpoints |
| 1-hour access tokens | 30-day access tokens with 365-day refresh | Sept 2023 (v5 launch) | Reduced re-authorization frequency from daily to annual |
| Legacy 365-day tokens | Continuous refresh tokens (60-day expiry, indefinite refresh) | Sept 25, 2025 | Apps created after this date get indefinite refresh by default; older apps must set `continuous_refresh: true` |
| OAuth without PKCE | OAuth 2.1 with mandatory PKCE | OAuth 2.1 spec 2023 | PKCE prevents authorization code interception attacks, now required for all client types |
| Plain text token storage | Encrypted token storage (Vault, KMS) | Industry best practice 2023+ | Protects tokens if database compromised, prevents token theft from backups or logs |
| Retry all errors | Selective retry (429, 5xx only) | API error handling evolution | Avoids wasting resources retrying client errors (4xx), focuses on transient failures |
| Fixed delay retry | Exponential backoff with jitter | Distributed systems best practice | Prevents thundering herd, respects rate limits, improves recovery time |

**Deprecated/outdated:**
- **Pinterest API v3:** Deprecated, use v5 (all endpoints migrated, different base URL: `/v5/` instead of `/v1/`)
- **Client credentials grant for user operations:** Pinterest removed this, requires user authorization flow for publishing
- **State parameter without server-side storage:** Modern OAuth requires state stored and validated server-side to prevent CSRF
- **Refresh tokens valid for 1 year (old model):** New continuous refresh model means tokens can be refreshed indefinitely if refreshed before expiration
- **Passing credentials in request body:** Token endpoint now requires HTTP Basic Authentication header

---

## Open Questions

### 1. Pinterest Rate Limits (Per-User vs Per-App)

**What we know:** Pinterest API v5 has rate limit categories (org_read, org_write), pins-create is categorized as org_write, but specific numeric limits not documented publicly

**What's unclear:** Exact requests-per-minute or requests-per-day limits, whether limits are per-access-token (user) or per-app-credentials, how limits behave when one app publishes for multiple Pinterest accounts

**Recommendation:**
- Implement conservative rate limiting client-side (e.g., 1 pin per 10 seconds per user)
- Monitor 429 responses in production and adjust based on actual limits
- Use Retry-After header when provided, implement exponential backoff when not
- Consider adding rate limit tracking to database (pins_published_last_hour counter)

**Confidence:** LOW — official docs don't specify numeric limits, must rely on runtime observation

### 2. Supabase Vault Performance with High Secret Volume

**What we know:** Vault uses PostgreSQL extension, decryption happens at query time via view, encryption key managed by Supabase backend

**What's unclear:** Query performance impact when decrypting 100+ tokens in background job, whether decrypted_secrets view can be indexed, whether parallel decryption calls cause lock contention

**Recommendation:**
- Test Vault performance with 100+ secrets in staging before production
- If performance issues arise, consider batching token refresh operations
- Monitor query execution time for Vault decryption in production
- Alternative: If Vault proves slow, fall back to pgcrypto with explicit decryption function calls

**Confidence:** MEDIUM — Vault is production-ready but performance at scale depends on Supabase infrastructure and number of concurrent connections

### 3. Pinterest Image Fetching Timeout

**What we know:** Pinterest fetches image from media_source.url server-side when creating pin, Supabase Storage provides public URLs

**What's unclear:** Pinterest's timeout for fetching images, whether large images (2-5MB) cause failures, retry behavior if image temporarily unavailable

**Recommendation:**
- Optimize pin images to reasonable size (< 1MB) before upload
- Test pin creation with various image sizes in development
- Monitor for "media source unavailable" errors in production
- Consider pre-warming: test fetch image URL from Pinterest's IP range before creating pin (if feasible)

**Confidence:** MEDIUM — Pinterest docs don't specify image fetch timeout or size limits beyond thumbnail requirements

---

## Sources

### Primary (HIGH confidence)

**Pinterest API Official Documentation:**
- [Pinterest API v5 OAuth Token](https://developers.pinterest.com/docs/api/v5/oauth-token/) - OAuth flow, token exchange, scopes
- [Pinterest API v5 Create Pin](https://developers.pinterest.com/docs/api/v5/pins-create/) - Pin creation endpoint, request/response format
- [Pinterest API v5 List Boards](https://developers.pinterest.com/docs/api/v5/boards-list/) - Board listing, pagination
- [Pinterest API v5 Documentation](https://developers.pinterest.com/docs/api/v5/) - Base reference
- [Pinterest API Quickstart GitHub](https://github.com/pinterest/api-quickstart) - Official code examples

**Supabase Official Documentation:**
- [Supabase Vault Documentation](https://supabase.com/docs/guides/database/vault) - Encrypted secret storage
- [Supabase Vault GitHub](https://github.com/supabase/vault) - Implementation details
- [Supabase Vault Blog](https://supabase.com/blog/supabase-vault) - Use cases and patterns

**Inngest Official Documentation:**
- [Inngest Cron Scheduled Functions](https://www.inngest.com/docs/guides/scheduled-functions) - Cron pattern syntax, timezone support
- [Inngest Patterns: Scheduled Jobs](https://www.inngest.com/patterns/running-code-on-a-schedule) - Best practices

**TanStack Start Official Documentation:**
- [Server Functions Guide](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) - createServerFn pattern
- [Authentication Guide](https://tanstack.com/start/latest/docs/framework/react/guide/authentication) - Cookie-based auth with server functions

### Secondary (MEDIUM confidence)

**OAuth Security Best Practices:**
- [OAuth 2.0 Security Best Practices](https://medium.com/@basakerdogan/oauth-2-0-security-best-practices-from-authorization-code-to-pkce-beccdbe7ec35) - PKCE implementation
- [OWASP OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) - Security patterns
- [OAuth 2.1 Features 2026](https://rgutierrez2004.medium.com/oauth-2-1-features-you-cant-ignore-in-2026-a15f852cb723) - Current standards
- [Demystifying OAuth Security: State vs Nonce vs PKCE](https://auth0.com/blog/demystifying-oauth-security-state-vs-nonce-vs-pkce/) - Security parameter comparison

**Token Storage Best Practices:**
- [OAuth 2.0 Refresh Token Best Practices](https://stateful.com/blog/oauth-refresh-token-best-practices) - Storage and rotation
- [Google OAuth Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices) - Enterprise patterns
- [Access Token vs Refresh Token 2026](https://thelinuxcode.com/access-token-vs-refresh-token-a-practical-breakdown-for-modern-oauth-2026/) - Token lifecycle

**Multi-Tenant Architecture:**
- [Building Multi-Tenant Application with Token-Based Auth](https://medium.com/@v4sooraj/building-a-multi-tenant-application-with-single-database-and-token-based-authentication-e86cf1f08dfc) - Database patterns
- [Supabase Multi-Tenancy CRM Integration](https://www.stacksync.com/blog/supabase-multi-tenancy-crm-integration) - OAuth per tenant

**Error Handling & Retry Logic:**
- [API Error Codes Cheat Sheet 2026](https://apistatuscheck.com/blog/api-error-codes-cheat-sheet) - HTTP status codes
- [Best Practices for Handling API Rate Limits](https://help.docebo.com/hc/en-us/articles/31803763436946-Best-practices-for-handling-API-rate-limits-and-429-errors) - 429 retry logic
- [Queue-Based Exponential Backoff](https://dev.to/andreparis/queue-based-exponential-backoff-a-resilient-retry-pattern-for-distributed-systems-37f3) - Distributed retry patterns
- [Node.js Retry with Exponential Backoff](https://oneuptime.com/blog/post/2026-01-06-nodejs-retry-exponential-backoff/view) - Implementation guide

**Pinterest-Specific Issues:**
- [Pinterest API Auth Issues Community](https://community.pinterest.biz/t/pinterest-api-auth-issues/1267) - Common problems
- [How to Fix Invalid Redirect URI OAuth2 Errors](https://oneuptime.com/blog/post/2026-01-24-fix-invalid-redirect-uri-oauth2/view) - Redirect troubleshooting

### Tertiary (LOW confidence - marked for validation)

- Pinterest rate limits (numeric values not found in official docs, requires production observation)
- Supabase Vault performance benchmarks at scale (no published metrics found)
- Pinterest image fetching timeout and retry behavior (not documented officially)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pinterest API v5, Supabase Vault, Inngest, TanStack Start all verified from official docs
- Architecture: HIGH - OAuth flow, token refresh, pin publishing patterns verified from official Pinterest API docs and OAuth 2.1 spec
- Pitfalls: MEDIUM-HIGH - Redirect URI issues, token refresh race conditions verified from community sources and best practices; RLS + service role pattern verified from existing codebase

**Research date:** 2026-02-09
**Valid until:** Approximately 60 days (Pinterest API v5 stable, OAuth 2.1 spec stable, but implementation details may evolve)

**Key uncertainties requiring production validation:**
- Pinterest rate limit numeric values (requests per minute/hour)
- Supabase Vault query performance with 100+ concurrent decryptions
- Pinterest image fetch timeout behavior with large images or slow networks

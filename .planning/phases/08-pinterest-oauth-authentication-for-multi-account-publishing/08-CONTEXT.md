# Phase 8: Pinterest OAuth Authentication for Multi-Account Publishing - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect Pinterest accounts via OAuth 2.0 so the app can publish pins on behalf of authorized users. Replace n8n's pin creation and board syncing with direct Pinterest API integration. n8n stays as a fallback but active workflows (board sync, pin publishing) are disabled once OAuth is connected.

</domain>

<decisions>
## Implementation Decisions

### Account connection UX
- Connect Pinterest from within a blog project's settings — per-project connection, not a global settings page
- After OAuth redirect: success toast + connected account name shown inline in project settings
- Disconnect with confirmation dialog warning about impact on scheduled pins
- OAuth failure or cancellation: inline error in project settings with "Try again" option

### Multi-account model
- Multiple blog projects can share the same Pinterest account (many-to-one)
- All boards from the connected Pinterest account are available in pin board dropdown — no per-project board filtering
- When Pinterest connects, replace n8n-synced boards with boards from Pinterest API (single source of truth)
- Board syncing is manual only — user clicks a "Sync boards" button to refresh from Pinterest

### Publishing workflow
- Both automatic scheduled publishing AND manual "Publish now" button
- Auto-publish: Inngest cron job runs on interval, checks for pins due for publishing, publishes them
- Manual: user clicks "Publish" on individual pin or bulk selects
- Publish failure: pin goes to 'fehler' status with error message, user can manually retry (no auto-retry)
- After successful publish: store both Pinterest pin ID (for future API operations) and public pin URL on the pin record

### Pin data sent to Pinterest API
- Image, title, description, link (blog article URL), board, and alt_text
- Alt text from AI-generated metadata included for Pinterest accessibility

### n8n transition
- Keep n8n as fallback — workflows remain but are disabled once OAuth is connected
- Disable n8n board sync once app handles it via OAuth
- n8n pin publishing disabled once app publishes directly

### Credentials management
- Pinterest app credentials (app ID, app secret) via environment variables — no admin UI

### Claude's Discretion
- Token storage schema (encrypted columns, separate table, etc.)
- Token refresh implementation details
- Cron job interval for auto-publishing
- OAuth callback route structure
- Error message specifics for different failure modes

</decisions>

<specifics>
## Specific Ideas

- Pin creation should send all available metadata including alt_text for accessibility
- Board replacement (not merge) when switching from n8n to OAuth — clean slate approach
- Inngest cron pattern already established in codebase for background jobs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-pinterest-oauth-authentication-for-multi-account-publishing*
*Context gathered: 2026-02-09*

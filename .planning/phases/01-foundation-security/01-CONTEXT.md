# Phase 1: Foundation & Security - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-tenant authentication infrastructure with Google OAuth and Row Level Security. Users can sign in, access isolated data, and view an empty dashboard. This phase establishes the security foundation — no business features yet.

</domain>

<decisions>
## Implementation Decisions

### Sign-in Flow
- Minimal centered layout — logo + single Google sign-in button, nothing else
- Branding: Logo + app name (no tagline)
- After successful sign-in, redirect directly to dashboard
- No email domain restriction — any Google account can sign in

### Auth Error Handling
- OAuth failures (user cancels, network error) show as toast notification
- Session expiry: silent redirect to sign-in, return to current page after re-auth
- RLS access denial: show 404 Not Found (pretend resource doesn't exist)
- Error details: user-friendly messages in production, technical details in development only

### Session Behavior
- 30-day session duration before requiring re-authentication
- Sessions persist across browser close (stay signed in)
- Multiple devices allowed, user can view/manage active sessions
- Sign-out option in user menu dropdown (avatar in header)

### Empty Dashboard State
- "Welcome + CTA" pattern — clear call-to-action to create first blog project
- Just the CTA, no additional onboarding hints or explanations
- User avatar and name visible in top navigation header
- Friendly casual tone: "Hey! Let's get you set up with your first blog."

### Claude's Discretion
- Exact toast notification styling and positioning
- Session management UI design (for viewing active sessions)
- Loading states during authentication
- Specific error message wording

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-security*
*Context gathered: 2026-01-26*

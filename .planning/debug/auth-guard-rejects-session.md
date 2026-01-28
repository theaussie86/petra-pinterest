---
status: diagnosed
trigger: "After successful Google OAuth sign-in, navigating to /dashboard redirects back to /login"
created: 2026-01-27T00:00:00Z
updated: 2026-01-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - auth.callback.tsx navigates to /dashboard before Supabase PKCE code exchange completes; the onAuthStateChange listener fires on INITIAL_SESSION (not SIGNED_IN) and the navigate races against session persistence
test: Traced full OAuth flow through source code
expecting: Race condition between navigation and session establishment
next_action: Return diagnosis

## Symptoms

expected: After Google OAuth completes and toast shows "Signed in successfully", /dashboard should load with authenticated user context
actual: /dashboard immediately redirects to /login despite successful OAuth
errors: No error messages - auth guard silently redirects
reproduction: Sign in with Google -> callback processes -> toast success -> /dashboard -> redirected to /login
started: Appears to be a design-time bug (never worked correctly)

## Eliminated

- hypothesis: Supabase client misconfigured (missing env vars, wrong keys)
  evidence: supabase.ts properly reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY with validation; createClient call is standard
  timestamp: 2026-01-27

- hypothesis: Route tree incorrectly wired (dashboard not under _authed)
  evidence: routeTree.gen.ts line 40 confirms AuthedDashboardRoute has getParentRoute => AuthedRoute; route hierarchy is correct
  timestamp: 2026-01-27

- hypothesis: getUser() implementation is fundamentally broken
  evidence: getUser() in auth.ts correctly calls supabase.auth.getUser() which is the server-verified method; the function itself is correct IF a valid session exists in storage
  timestamp: 2026-01-27

## Evidence

- timestamp: 2026-01-27
  checked: src/lib/supabase.ts - Supabase client initialization
  found: Default createClient with no auth config overrides. Supabase JS v2.49+ defaults to PKCE flow for OAuth, which uses authorization code + code_verifier exchange rather than implicit token-in-URL-hash flow.
  implication: OAuth callback will receive a `code` query parameter that must be exchanged server-side (via Supabase's built-in detection) before a session exists.

- timestamp: 2026-01-27
  checked: src/routes/auth.callback.tsx - OAuth callback handler (lines 14-51)
  found: The callback component sets up an onAuthStateChange listener and then waits for a SIGNED_IN event. However, with PKCE flow, Supabase client auto-detects the `code` URL parameter and calls exchangeCodeForSession internally when the client initializes or detects the URL. The onAuthStateChange listener fires AFTER the exchange completes. The critical issue is the event check on line 19: `event === 'SIGNED_IN'`.
  implication: In Supabase JS v2, when a page loads with an auth code, the client exchanges it and fires `INITIAL_SESSION` as the first event (not `SIGNED_IN`). The SIGNED_IN event may or may not fire depending on version and whether this is considered a new sign-in vs session restoration. This is one potential failure mode.

- timestamp: 2026-01-27
  checked: src/routes/auth.callback.tsx - Navigation timing (line 23)
  found: navigate({ to: '/dashboard' }) is called inside onAuthStateChange callback. This is a client-side navigation via TanStack Router. When this navigation triggers, TanStack Router will invoke the _authed.tsx beforeLoad guard SYNCHRONOUSLY before rendering the dashboard route.
  implication: The key question is whether the Supabase session is fully persisted to storage at the moment beforeLoad fires.

- timestamp: 2026-01-27
  checked: src/routes/_authed.tsx - Auth guard (lines 10-17)
  found: beforeLoad calls `await getUser()` which calls `supabase.auth.getUser()`. getUser() makes a network request to Supabase's /auth/v1/user endpoint, passing the access token from the local session. If no session is in local storage yet, this will fail.
  implication: The guard is correct in principle, but it depends entirely on the session being available in the Supabase client's memory/storage when it runs.

- timestamp: 2026-01-27
  checked: Core timing analysis of the PKCE OAuth flow
  found: |
    The sequence of events is:
    1. Browser redirects to /auth/callback?code=XXX
    2. AuthCallback component mounts, registers onAuthStateChange listener
    3. Supabase client detects `code` in URL and begins PKCE exchange (async HTTP request to Supabase)
    4. Exchange completes -> session stored in localStorage -> onAuthStateChange fires
    5. Callback handler checks event === 'SIGNED_IN' (line 19)
    6. If event matches, navigate({ to: '/dashboard' }) is called
    7. TanStack Router runs _authed.tsx beforeLoad -> calls getUser() -> calls supabase.auth.getUser()

    PRIMARY ISSUE: Step 5 - the event fired after PKCE exchange on page load is `INITIAL_SESSION`, not `SIGNED_IN`. The callback is listening for the wrong event name.

    But wait - if the event doesn't match 'SIGNED_IN', the else-if on line 24 checks `event === 'SIGNED_OUT' || !session`. Since the event would be 'INITIAL_SESSION' (not 'SIGNED_OUT') and session IS present, this branch also doesn't fire. So the component stays in 'processing' state forever.

    HOWEVER - the user reports the toast DOES fire and they DO reach /dashboard. This means SIGNED_IN IS firing in their version. So the event check is not the primary issue in their case.

    RE-EVALUATING: In some Supabase v2 versions, both INITIAL_SESSION and SIGNED_IN fire. If SIGNED_IN fires, navigate() is called. The real question becomes: does beforeLoad's getUser() work at that point?

    The answer reveals the ACTUAL root cause: supabase.auth.getUser() makes a NETWORK call to Supabase's API endpoint to verify the JWT. This should work if the session is in memory. But there's a subtler issue...
  implication: Need to look more carefully at what getUser returns when session just established.

- timestamp: 2026-01-27
  checked: src/lib/auth.ts getUser() lines 44-68 - the FULL function, not just the auth check
  found: |
    getUser() does TWO things:
    1. Lines 46-50: Calls supabase.auth.getUser() to verify auth - this SUCCEEDS (session just established)
    2. Lines 53-57: Queries the `profiles` table for tenant_id and display_name
    3. Lines 59-61: If profileError OR !profile, returns NULL

    THIS IS THE ROOT CAUSE. After a FIRST-TIME OAuth sign-in, the user's profile row in the `profiles` table may not exist yet, or the RLS policies may prevent reading it. The profile query fails, and getUser() returns null, which the auth guard interprets as "not authenticated."

    Even if a database trigger creates the profile row on user creation, there is a race condition: the navigate to /dashboard happens immediately after SIGNED_IN fires, but the database trigger creating the profile row may not have completed yet. The profile query at line 53-57 hits the database before the row exists.
  implication: The auth guard conflates "authenticated" with "has a complete profile." A user who is genuinely authenticated by Supabase but whose profile row doesn't exist (or hasn't been created yet by a trigger) is treated as unauthenticated and redirected to /login.

## Resolution

root_cause: |
  The `getUser()` function in `/Users/cweissteiner/NextJS/petra-pinterest/src/lib/auth.ts` (lines 44-68) conflates authentication status with profile existence. After OAuth sign-in, it:
  1. Successfully verifies the user is authenticated via `supabase.auth.getUser()` (line 46)
  2. Then queries the `profiles` table for `tenant_id` and `display_name` (lines 53-57)
  3. If the profile query fails for ANY reason (row doesn't exist yet, RLS policy blocks it, race condition with trigger), it returns `null` (lines 59-61)
  4. The auth guard in `_authed.tsx` receives `null` and redirects to `/login` (lines 13-16)

  This means a genuinely authenticated user with no profile row (or a profile row that hasn't been created yet by a database trigger) is treated as unauthenticated. The auth check and the profile data fetch are coupled into a single function that returns null for EITHER failure, making it impossible for the caller to distinguish "not authenticated" from "authenticated but no profile yet."

fix:
verification:
files_changed: []

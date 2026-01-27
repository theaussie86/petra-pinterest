---
status: diagnosed
phase: 01-foundation-security
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md
started: 2026-01-27T12:00:00Z
updated: 2026-01-27T12:08:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Landing Page Display
expected: Visit http://localhost:3000. You should see a landing page with "Petra" branding and a "Sign in with Google" button.
result: pass

### 2. Google OAuth Sign-In
expected: Click "Sign in with Google". You should be redirected to Google's OAuth consent screen. After signing in with your Google account, you should be redirected back to the app at /dashboard.
result: pass

### 3. Protected Dashboard View
expected: After signing in, you should see a dashboard page with a header showing your name and avatar (or initials). The main area should show a welcome/empty state message.
result: issue
reported: "it tries to redirect to dashboard, but then I land on /login again. I do see a toast message that I successfully logged in though."
severity: major

### 4. Auth Guard Redirect
expected: Open a new incognito/private window and navigate directly to http://localhost:3000/dashboard. You should be automatically redirected to /login since you're not authenticated.
result: pass

### 5. Sign Out
expected: While signed in on the dashboard, click your avatar/name in the header. A dropdown should appear with a sign-out option. Clicking sign out should end your session and redirect you to the login page.
result: skipped
reason: Blocked by Test 3 — can't reach dashboard

### 6. Session Persistence
expected: While signed in on the dashboard, refresh the browser (Cmd+R or F5). You should remain on the dashboard with your session intact — no re-login required.
result: skipped
reason: Blocked by Test 3 — can't reach dashboard

## Summary

total: 6
passed: 3
issues: 1
pending: 0
skipped: 2

## Gaps

- truth: "After signing in, user sees dashboard with header and welcome message"
  status: failed
  reason: "User reported: it tries to redirect to dashboard, but then I land on /login again. I do see a toast message that I successfully logged in though."
  severity: major
  test: 3
  root_cause: "getUser() in src/lib/auth.ts conflates auth check with profile fetch — returns null when profile row doesn't exist yet (new signup or trigger timing), causing _authed.tsx beforeLoad guard to redirect authenticated users back to /login"
  artifacts:
    - path: "src/lib/auth.ts"
      issue: "Lines 53-61: profile query failure returns null, same as auth failure"
    - path: "src/routes/_authed.tsx"
      issue: "Lines 10-17: auth guard treats any null from getUser() as unauthenticated"
    - path: "src/routes/auth.callback.tsx"
      issue: "Line 23: navigates to /dashboard immediately after SIGNED_IN, no time for profile trigger"
  missing:
    - "Separate auth check from profile fetch in getUser()"
    - "Auth guard should check authentication only (supabase.auth.getUser()), not profile existence"
    - "Profile data enrichment should be handled separately"
  debug_session: ".planning/debug/auth-guard-rejects-session.md"

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 2 - Blog Project Management

## Current Position

Phase: 2 of 7 (Blog Project Management)
Plan: 1 of 4 in current phase
Status: In progress
Last activity: 2026-01-27 — Completed 02-01-PLAN.md

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: ~7min
- Total execution time: ~0.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 1 | ~3.5min | ~3.5min |

**Recent Trend:**
- Last 5 plans: 02-01 (3.5min), 01-05 (1min), 01-04 (10min), 01-03 (20min), 01-02 (2min)
- Trend: Very high velocity on foundation setup plans

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- TanStack Router SPA over TanStack Start — Start had Vite 7 dependency conflicts; Router SPA via create-tsrouter-app works with same file-based routing
- Path alias @/ instead of ~/ — Matches official template convention
- Keep n8n for Pinterest API — Pinterest OAuth complexity, don't block v1
- Keep granular pin statuses — Preserve existing workflow
- Blog scraping in-app — Less n8n complexity, better user control
- AI metadata in-app — Direct integration, faster iteration

**From 01-02 (Database Schema):**
- Enabled RLS immediately on profiles table before any production data — Critical security requirement
- Used gen_random_uuid() for tenant_id generation — Automatic tenant assignment
- Applied performance index on tenant_id — Multi-tenant query optimization
- Created auto-profile trigger with SECURITY DEFINER — System-level profile creation bypasses RLS

**From 01-03 (Google OAuth):**
- Client-side authentication using Supabase JS client — Matches TanStack Router SPA architecture (not SSR)
- Navigate to / instead of /dashboard after OAuth — Dashboard route created in 01-04
- Auto-generated route tree with TanStack Router CLI — Required for type-safe navigation

**From 01-04 (Protected Dashboard):**
- Use TanStack Router beforeLoad for auth guard — Pattern matches SPA architecture
- Pass user context via route context — beforeLoad returns user data, child routes access via useRouteContext
- _authed layout pattern — All protected routes go under /_authed/* with automatic redirect
- Simple dropdown with state toggle — Avoided headless UI library for simple menu

**From 01-05 (Auth Guard Redirect Fix):**
- Use getAuthUser() for auth guard gate — No profile table dependency
- getUser() returns fallback values (not null) when profile missing — Handles race condition with profile trigger
- Auth guard makes 2 calls (auth check + profile query) — Correctness over optimization
- Graceful fallback pattern for race conditions with database triggers — display_name derived from email when profile doesn't exist yet

**From 02-01 (Database & Foundation Setup):**
- Remove foreign key from blog_projects.tenant_id to profiles(tenant_id) — profiles.tenant_id lacks unique constraint; RLS policies enforce tenant relationship
- Install Supabase CLI for migrations instead of MCP/JS client — Standard tool for migration management
- Use 30-second staleTime for TanStack Query default — Balance between fresh data and reducing redundant requests

### Pending Todos

1 pending todo(s):
- **Cleanup AIRTABLE_PAT from ~/.zshrc** (tooling) — Remove after Airtable MCP no longer needed

### Blockers/Concerns

**From Research:**
- ✅ Phase 1: Multi-tenant RLS is CRITICAL — ADDRESSED in 01-02 (RLS enabled on profiles table)
- Phase 6: Calendar performance with 1000+ pins needs testing (virtualization may be required)
- Phase 7: Airtable migration is high complexity — budget 2-3x expected time for formula/linked record conversion

**From 01-02:**
- Run test_rls.sql verification queries after Supabase connection established
- Complete security checklist before production launch

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 02-01-PLAN.md
Resume file: None
Next: Execute 02-02-PLAN.md (TypeScript types & API layer)

Config:
{
  "mode": "yolo",
  "depth": "standard",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  }
}

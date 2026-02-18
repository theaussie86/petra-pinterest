# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Petra Pinterest is a multi-tenant Pinterest scheduling dashboard for managing pins across multiple blog projects. It replaces an existing Airtable + n8n workflow. Pinterest API publishing and board syncing remain in n8n for v1; this app handles data management, blog scraping, AI metadata, and the calendar UI.

**Status:** Phase 3 of 7 complete. See `.planning/STATE.md` for current position and `.planning/ROADMAP.md` for the full plan.

## Commands

```bash
npm run dev        # Start dev server on port 3000
npm run build      # Production build (vite build)
npm run start      # Run production server (node .output/server/index.mjs)
npm run preview    # Preview production build
npm test           # Run tests (vitest)
```

## Tech Stack

- **Framework:** TanStack Start + TanStack Router (file-based routing) + Vite 7
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn/ui ("new-york" style)
- **Server state:** TanStack Query v5 (30s default staleTime)
- **Forms:** React Hook Form + Zod v4
- **Backend:** Supabase (Postgres, Auth, Storage)
- **Auth:** Google OAuth via Supabase Auth (client-side only)
- **Path alias:** `@/` maps to `./src/` (resolved by `vite-tsconfig-paths`)

## Architecture

### Data Flow

Components → TanStack Query hooks (`src/lib/hooks/`) → API functions (`src/lib/api/`) → Supabase client

- Hooks wrap TanStack Query for caching/mutations
- Optimistic updates on create mutations only
- Errors displayed via Sonner toasts

### Entry Points (TanStack Start)

- `src/router.tsx` — Router factory (`getRouter()`), exports router config and type registration
- `src/client.tsx` — Client entry, hydrates the document with `StartClient`
- `src/server.ts` — Server entry, creates the Start handler with stream support
- `src/routes/__root.tsx` — Full HTML document shell (`<html>`, `<head>`, `<body>`), hosts `QueryClientProvider`, `HeadContent`, and `Scripts`

SPA mode is disabled. The app runs with a full Node.js server runtime, enabling SSR and server functions (`createServerFn`).

### Routing

TanStack Router with file-based routes in `src/routes/`. The route tree is auto-generated in `src/routeTree.gen.ts` — never edit it manually.

- `__root.tsx` — HTML document shell + root layout (QueryClientProvider, Toaster, devtools)
- `_authed.tsx` — Auth guard layout, all protected routes live under `_authed/`
- `_authed/dashboard.tsx`, `_authed/projects/$id.tsx` — Protected pages
- `auth.callback.tsx` — OAuth redirect handler

### Auth Pattern

Two-step auth check in `_authed.tsx` `beforeLoad`:
1. `getAuthUser()` — Fast auth check (no DB query)
2. `getUser()` — Full profile with fallback for race condition when profile trigger hasn't fired yet

User context is passed to child routes via TanStack Router route context, accessed with `useRouteContext()`.

### Multi-Tenancy

Every data table has a `tenant_id` column with RLS policies enforcing isolation. The pattern:
```sql
tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
```
RLS is enabled on all tables. Application-level checks provide defense-in-depth.

### Component Organization

- `src/components/ui/` — shadcn/ui primitives
- `src/components/dashboard/` — Dashboard page components
- `src/components/projects/` — Project dialogs (create/edit share one component, mode detected via `project` prop)
- `src/components/layout/` — Header, navigation

### Server Functions (Scraping)

Scraping operations use `createServerFn` from TanStack Start (`src/lib/server/scraping.ts`). These run server-side with cookie-based auth — no Bearer tokens or manual `fetch()` needed. The client calls them like regular async functions:
- `scrapeBlogFn` — dispatches to Supabase Edge Functions for async background processing
- `scrapeSingleFn` — synchronous single-URL scrape with immediate DB upsert

Shared scraping logic (RSS/HTML parsing) lives in `server/lib/scraping.ts`.

### Database Migrations

Migrations live in `supabase/migrations/` and are applied via Supabase CLI or MCP. Use `apply_migration` for DDL changes, `execute_sql` for data queries.

## Key Patterns

- **New tables** must include `tenant_id` and RLS policies before any data access
- **Form validation:** React Hook Form + Zod schemas. For complex optional fields (like RSS URL), use manual validation in `onSubmit` rather than fighting Zod's `.optional()` inference with react-hook-form
- **Create vs edit dialogs:** Single component, mode detected by presence of existing data prop
- **Route generation:** TanStack Start's built-in router plugin auto-generates `routeTree.gen.ts` on file changes during dev
- **No foreign keys to profiles.tenant_id** — it lacks a unique constraint; RLS enforces the relationship instead

## Environment Variables

Copy `.env.example` to `.env.local`:
```
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

## MCP Servers

Configured in `.mcp.json`: Airtable (for data migration reference) and shadcn (for component registry). Supabase MCP is available as a built-in plugin.

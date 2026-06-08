# Coding Standards

<!-- The reviewer agent loads this via @.sandcastle/CODING_STANDARDS.md during review. -->

## Stack

- TanStack Start + TanStack Router (file-based routing), Vite 7, TypeScript strict mode.
- Tailwind CSS v4 + shadcn/ui ("new-york"). TanStack Query v5 for server state.
- React Hook Form + Zod v4 for forms. Supabase (Postgres, Auth, Storage) backend.
- Path alias `@/` maps to `./src/`.

## Style

- TypeScript strict — no `any` escape hatches, no `@ts-ignore` without a reason comment.
- Prefer named exports.
- German user-facing text uses real umlauts (ä, ö, ü, ß), never ae/oe/ue/ss. File names use ascii substitutes.
- Match surrounding code: naming, comment density, idiom.

## Data flow

- Components → TanStack Query hooks (`src/lib/hooks/`) → API functions (`src/lib/api/`) → Supabase client. Do not skip layers.
- Errors surface via Sonner toasts.
- Optimistic updates on create mutations only.
- Scraping runs server-side via `createServerFn` (`src/lib/server/`) with cookie auth — no Bearer tokens or manual fetch.

## Multi-tenancy (non-negotiable)

- Every data table has `tenant_id` with RLS policies. New tables MUST include `tenant_id` and RLS before any data access.
- RLS pattern: `tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())`.
- Application-level tenant checks too (defense in depth).
- No foreign keys to `profiles.tenant_id` — it has no unique constraint; RLS enforces the relationship.

## Routing

- Never edit `src/routeTree.gen.ts` — auto-generated.
- Protected pages live under `src/routes/_authed/`.

## Testing

- Tests are vitest (`npm test`). Cover new logic; keep existing tests green.
- A change is not done until `npm run build` and `npm test` pass.

## Architecture

- Single component for create/edit dialogs; mode detected by presence of an existing-data prop.
- Keep modules single-responsibility; prefer composition.

---
phase: "02"
plan: "01"
subsystem: "foundation"
completed: "2026-01-27"
duration: "3.5min"

requires:
  - "01-02: Database schema with multi-tenant RLS"
  - "01-04: Protected dashboard with user context"

provides:
  - "blog_projects table with tenant isolation"
  - "Form validation libraries (react-hook-form, zod)"
  - "shadcn/ui Dialog, Input, Label, Card components"
  - "QueryClientProvider context for TanStack Query"
  - "Toast notification system via Toaster"

affects:
  - "02-02: TypeScript types and API layer will use blog_projects schema"
  - "02-03: Dashboard UI will use shadcn/ui components and TanStack Query"
  - "All future forms will use react-hook-form + zod validation"

tech-stack:
  added:
    - "react-hook-form@7.71.1 (form state management)"
    - "zod@4.3.6 (schema validation)"
    - "@hookform/resolvers@5.2.2 (zod integration for react-hook-form)"
    - "class-variance-authority (shadcn/ui dependency)"
    - "supabase CLI (migration tooling)"
  patterns:
    - "shadcn/ui component architecture with Tailwind v4"
    - "TanStack Query with 30s stale time default"
    - "Multi-tenant RLS without foreign keys (tenant_id enforced via policies)"

key-files:
  created:
    - "supabase/migrations/00002_blog_projects.sql (blog projects schema)"
    - "src/components/ui/dialog.tsx (shadcn Dialog)"
    - "src/components/ui/input.tsx (shadcn Input)"
    - "src/components/ui/label.tsx (shadcn Label)"
    - "src/components/ui/card.tsx (shadcn Card)"
    - "components.json (shadcn configuration)"
  modified:
    - "src/main.tsx (added QueryClientProvider)"
    - "src/routes/__root.tsx (added richColors to Toaster)"
    - "package.json (form libraries + class-variance-authority)"

decisions:
  - id: "02-01-001"
    decision: "Remove foreign key from blog_projects.tenant_id to profiles(tenant_id)"
    rationale: "profiles.tenant_id lacks unique constraint; RLS policies enforce tenant relationship"
    impact: "Simpler schema, no CASCADE delete from profiles, but RLS still enforces isolation"
    alternatives: "Add UNIQUE constraint to profiles.tenant_id or use profiles.id FK"
  - id: "02-01-002"
    decision: "Install Supabase CLI for migrations instead of using MCP or JS client"
    rationale: "Supabase MCP not configured, anon key can't execute raw SQL, CLI is standard tool"
    impact: "Added Supabase CLI to local environment via Homebrew"
    alternatives: "Configure Supabase MCP server, use service role key with JS client"
  - id: "02-01-003"
    decision: "Use 30-second staleTime for TanStack Query default"
    rationale: "Balance between fresh data and reducing redundant requests"
    impact: "Queries refetch automatically after 30s, improving UX"
    alternatives: "0ms (always refetch), 60s+ (longer caching)"

tags: ["database", "forms", "ui-components", "react-query", "shadcn", "migrations", "foundation"]
---

# Phase 2 Plan 1: Database & Foundation Setup Summary

**One-liner:** Created blog_projects table with RLS, installed form validation (react-hook-form + zod), added shadcn/ui primitives (Dialog/Input/Label/Card), and wired QueryClientProvider + Toaster at app root.

## What Was Built

### Database Schema
- **blog_projects table** with columns: id, tenant_id, name, blog_url, rss_url, scraping_frequency, description, timestamps
- **RLS policies** enforcing tenant isolation (SELECT, INSERT, UPDATE, DELETE)
- **Performance index** on tenant_id
- **Auto-update trigger** for updated_at timestamp

### Form Libraries
- **react-hook-form** v7.71.1 for form state management
- **zod** v4.3.6 for schema validation
- **@hookform/resolvers** v5.2.2 for zod integration

### UI Components
- **Dialog** component from shadcn/ui (modals, create/edit forms)
- **Input** component (text fields)
- **Label** component (form labels)
- **Card** component (project grid, stats display)

### App Infrastructure
- **QueryClientProvider** wraps RouterProvider in main.tsx (30s staleTime default)
- **Toaster** component updated with richColors prop in root route
- **components.json** created for shadcn/ui configuration

## Tasks Completed

| Task | Status | Commit | Duration |
|------|--------|--------|----------|
| 1. Create blog_projects migration and install form libraries | ✅ | 7bdedb1 | ~2min |
| 2. Add shadcn/ui components and wire QueryClientProvider + Toaster | ✅ | 373e068 | ~1.5min |

**Total:** 2/2 tasks, 3.5 minutes execution time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed foreign key constraint from blog_projects.tenant_id**
- **Found during:** Task 1, migration application
- **Issue:** `tenant_id UUID NOT NULL REFERENCES public.profiles(tenant_id) ON DELETE CASCADE` failed because profiles.tenant_id lacks a unique constraint
- **Fix:** Changed to `tenant_id UUID NOT NULL` (no FK), RLS policies still enforce tenant relationship
- **Files modified:** supabase/migrations/00002_blog_projects.sql
- **Commit:** 7bdedb1

**2. [Rule 3 - Blocking] Installed Supabase CLI for migration application**
- **Found during:** Task 1
- **Issue:** Plan specified "using the Supabase MCP tool" but no MCP server configured, anon key can't execute raw SQL
- **Fix:** Installed Supabase CLI via Homebrew (`brew install supabase/tap/supabase`), linked project, applied migration with `supabase db push`
- **Impact:** Added Supabase CLI to local environment
- **Commit:** 7bdedb1

**3. [Rule 3 - Blocking] Installed class-variance-authority dependency**
- **Found during:** Task 2, build verification
- **Issue:** shadcn/ui label.tsx imports 'class-variance-authority' but dependency not installed
- **Fix:** `npm install class-variance-authority`
- **Files modified:** package.json, package-lock.json
- **Commit:** 373e068

## Key Technical Details

### Database Design

**blog_projects table structure:**
```sql
CREATE TABLE public.blog_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,  -- Enforced by RLS, not FK
  name TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  rss_url TEXT,  -- Optional RSS feed URL
  scraping_frequency TEXT DEFAULT 'weekly' CHECK (IN ('daily', 'weekly', 'manual')),
  description TEXT,  -- Optional project description
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**RLS pattern (matches Phase 1 profiles table):**
```sql
-- All policies use same tenant isolation check
tenant_id IN (
  SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
)
```

**Why no foreign key:** profiles.tenant_id is not unique (though in practice each user has unique tenant_id), so FK constraint would require adding UNIQUE constraint. Removed FK for simplicity; RLS enforces relationship.

### Component Architecture

**shadcn/ui components added:**
- **Dialog:** Modal system with overlay, content, header, footer, title, description primitives
- **Input:** Text input with Tailwind v4 styling, forwards ref for react-hook-form integration
- **Label:** Form label with htmlFor association, class-variance-authority for variants
- **Card:** Container with header, title, description, content, footer sections

All components use:
- Tailwind v4 CSS variables (no JIT mode)
- `cn()` utility from @/lib/utils for className merging
- Radix UI primitives for accessibility (Dialog uses @radix-ui/react-dialog)

### TanStack Query Setup

**Configuration:**
```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
    },
  },
})
```

**Why 30s staleTime:**
- Prevents redundant refetches when navigating back to cached data
- Blog projects change infrequently (user-initiated CRUD only)
- Balance between fresh data and performance

**QueryClientProvider wraps RouterProvider:**
```tsx
<QueryClientProvider client={queryClient}>
  <RouterProvider router={router} />
</QueryClientProvider>
```

This enables TanStack Query hooks (useQuery, useMutation) anywhere in the route tree.

## Verification Results

✅ All verifications passed:

- [x] File `supabase/migrations/00002_blog_projects.sql` exists with CREATE TABLE, RLS, policies, trigger
- [x] `npm ls react-hook-form zod @hookform/resolvers` shows all three installed
- [x] Migration applied successfully to Supabase
- [x] Files exist: dialog.tsx, input.tsx, label.tsx, card.tsx in src/components/ui/
- [x] `src/main.tsx` contains QueryClientProvider wrapping RouterProvider
- [x] `src/routes/__root.tsx` contains `<Toaster richColors position="top-right" />`
- [x] `npm run build` completes without TypeScript errors

## Dependencies for Next Plans

**02-02 (TypeScript types & API layer) needs:**
- ✅ blog_projects table schema (provides column types)
- ✅ TanStack Query context (for useQuery/useMutation hooks)

**02-03 (Dashboard UI) needs:**
- ✅ shadcn/ui Dialog (create/edit forms)
- ✅ shadcn/ui Input, Label (form fields)
- ✅ shadcn/ui Card (project grid display)
- ✅ react-hook-form + zod (form validation)
- ✅ Toaster (success/error notifications)

**02-04 (Project detail page) needs:**
- ✅ blog_projects table (data to display)
- ✅ shadcn/ui components (layout and actions)

## Next Phase Readiness

**Blockers:** None

**Concerns:** None

**Ready to proceed:** Yes - all foundations in place for Phase 2 plans 02-02, 02-03, 02-04.

## Performance Notes

- Migration applied in <1s
- Build time: ~1.1s
- No bundle size concerns (Dialog adds ~3KB gzipped)
- QueryClient instance created once, reused across app

## Git History

```
373e068 feat(02-01): add shadcn/ui components and wire QueryClientProvider + Toaster
7bdedb1 feat(02-01): create blog_projects table and install form libraries
```

**Files changed:** 12 created, 4 modified
**Lines changed:** +4,805 insertions

---
**Completed:** 2026-01-27
**Execution time:** 3.5 minutes
**Plan status:** ✅ Complete

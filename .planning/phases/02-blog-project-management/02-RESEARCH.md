# Phase 2: Blog Project Management - Research

**Researched:** 2026-01-27
**Domain:** CRUD operations with TanStack Query, form handling, and multi-tenant database design
**Confidence:** HIGH

## Summary

Phase 2 implements a complete CRUD interface for blog project management with dashboard statistics. The standard approach uses TanStack Query (already installed v5.64.0) for data fetching and mutations, shadcn/ui components (Dialog, Form, Input) with React Hook Form + Zod for validation, and Sonner (already installed v2.0.0) for toast notifications. The database extends the existing multi-tenant RLS foundation with a `blog_projects` table containing both core fields (name, URL) and extensive AI context fields mapped from the Airtable data model.

The architecture follows a query/mutation pattern with optimistic updates and cache invalidation. Forms live in controlled Dialog components with inline validation. The dashboard displays project cards in a CSS Grid layout with statistics rolled up from related tables (articles, pins). Delete operations must check for cascade constraints before allowing deletion.

**Primary recommendation:** Use TanStack Query's useMutation with onMutate for optimistic updates, invalidateQueries for cache management, and controlled Dialog state for create/edit modals with React Hook Form validation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | v5.64.0 (installed) | Server state management, data fetching, mutations | Industry standard for React data fetching with caching, automatic refetching, and optimistic updates |
| @supabase/supabase-js | v2.49.0 (installed) | Database client for Supabase PostgreSQL | Official Supabase client with TypeScript support and real-time capabilities |
| sonner | v2.0.0 (installed) | Toast notifications | Most popular opinionated toast library for React with smooth animations |
| lucide-react | v0.545.0 (installed) | Icon library | Modern icon library with consistent design and tree-shaking support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hook-form | Latest | Form state management | All forms with validation - minimal re-renders, excellent DX |
| zod | Latest | Schema validation | Type-safe validation for all form inputs |
| @hookform/resolvers | Latest | RHF + Zod integration | Bridge between React Hook Form and Zod schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | SWR | SWR is simpler but lacks optimistic updates and advanced cache management |
| React Hook Form | Formik | Formik is older, more re-renders, slower performance |
| Zod | Yup | Zod has better TypeScript inference and smaller bundle size |
| CSS Grid (Tailwind) | react-grid-layout | react-grid-layout adds drag-and-drop but unnecessary complexity for static card grid |

**Installation:**
```bash
npm install react-hook-form zod @hookform/resolvers
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── routes/
│   └── _authed/
│       ├── dashboard.tsx          # Main dashboard with project cards
│       └── projects/
│           └── $id.tsx            # Project detail page
├── components/
│   ├── dashboard/
│   │   ├── empty-state.tsx        # (exists) Empty state
│   │   ├── stats-bar.tsx          # Global stats summary
│   │   └── project-card.tsx       # Individual project card
│   ├── projects/
│   │   ├── project-dialog.tsx     # Create/Edit modal
│   │   └── delete-dialog.tsx      # Delete confirmation
│   └── ui/                         # shadcn/ui components
│       ├── dialog.tsx              # (add)
│       ├── input.tsx               # (add)
│       ├── label.tsx               # (add)
│       ├── form.tsx                # (add)
│       └── card.tsx                # (add)
├── lib/
│   ├── api/
│   │   └── blog-projects.ts       # API functions
│   └── hooks/
│       └── use-blog-projects.ts   # React Query hooks
└── types/
    └── blog-projects.ts            # TypeScript types
```

### Pattern 1: TanStack Query CRUD with Optimistic Updates

**What:** Wrapping Supabase CRUD operations in TanStack Query hooks with optimistic updates and automatic cache invalidation

**When to use:** All database operations that modify data

**Example:**
```typescript
// Source: TanStack Query v5 docs - Optimistic Updates
// lib/hooks/use-blog-projects.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBlogProject, updateBlogProject, deleteBlogProject, getBlogProjects } from '@/lib/api/blog-projects'
import { toast } from 'sonner'

// Query hook for fetching all projects
export function useBlogProjects() {
  return useQuery({
    queryKey: ['blog-projects'],
    queryFn: getBlogProjects,
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
}

// Mutation hook for creating a project
export function useCreateBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBlogProject,
    onMutate: async (newProject) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['blog-projects'] })

      // Snapshot previous value
      const previousProjects = queryClient.getQueryData(['blog-projects'])

      // Optimistically update cache
      queryClient.setQueryData(['blog-projects'], (old) => [...old, { ...newProject, id: 'temp-id' }])

      return { previousProjects }
    },
    onError: (err, newProject, context) => {
      // Rollback on error
      queryClient.setQueryData(['blog-projects'], context.previousProjects)
      toast.error('Failed to create project')
    },
    onSuccess: () => {
      toast.success('Project created successfully')
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    },
  })
}

// Mutation hook for updating a project
export function useUpdateBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateBlogProject,
    onSuccess: () => {
      toast.success('Project updated successfully')
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    },
    onError: () => {
      toast.error('Failed to update project')
    },
  })
}

// Mutation hook for deleting a project
export function useDeleteBlogProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBlogProject,
    onSuccess: () => {
      toast.success('Project deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['blog-projects'] })
    },
    onError: () => {
      toast.error('Failed to delete project')
    },
  })
}
```

### Pattern 2: Controlled Dialog with React Hook Form + Zod

**What:** Modal dialog for create/edit forms with controlled state, validation, and error handling

**When to use:** All form dialogs (create, edit)

**Example:**
```typescript
// Source: shadcn/ui Dialog + React Hook Form docs
// components/projects/project-dialog.tsx

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBlogProject, useUpdateBlogProject } from '@/lib/hooks/use-blog-projects'

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  blog_url: z.string().url('Must be a valid URL'),
  rss_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  scraping_frequency: z.enum(['daily', 'weekly', 'manual']).optional(),
})

type ProjectFormData = z.infer<typeof projectSchema>

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: { id: string; name: string; blog_url: string } // For edit mode
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const isEdit = !!project
  const createMutation = useCreateBlogProject()
  const updateMutation = useUpdateBlogProject()

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name || '',
      blog_url: project?.blog_url || '',
      rss_url: '',
      scraping_frequency: 'weekly',
    },
  })

  const onSubmit = async (data: ProjectFormData) => {
    if (isEdit) {
      await updateMutation.mutateAsync({ id: project.id, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
    onOpenChange(false)
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Project' : 'Create Project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="My Blog"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blog_url">Blog URL</Label>
              <Input
                id="blog_url"
                {...form.register('blog_url')}
                placeholder="https://myblog.com"
              />
              {form.formState.errors.blog_url && (
                <p className="text-sm text-red-600">{form.formState.errors.blog_url.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Pattern 3: Dashboard Statistics with Aggregated Queries

**What:** Display global and per-project statistics using SQL aggregations and COUNT queries

**When to use:** Dashboard stats bar and project cards

**Example:**
```typescript
// Source: Supabase Postgres aggregation patterns
// lib/api/blog-projects.ts

export async function getDashboardStats() {
  // Get global pin counts by status across all projects
  const { data, error } = await supabase
    .from('pins')
    .select('status')

  if (error) throw error

  // Aggregate in JavaScript (or use Postgres functions)
  const scheduled = data.filter(p => p.status === 'ready_to_publish').length
  const published = data.filter(p => p.status === 'published').length
  const pending = data.filter(p => ['draft', 'generating_metadata', 'metadata_created'].includes(p.status)).length

  return { scheduled, published, pending }
}

export async function getBlogProjectsWithStats() {
  // Get projects with related counts using LEFT JOIN
  const { data, error } = await supabase
    .from('blog_projects')
    .select(`
      *,
      articles:blog_articles(count),
      pins:pins(count, status)
    `)

  if (error) throw error

  // Transform to include per-project stats
  return data.map(project => ({
    ...project,
    article_count: project.articles[0]?.count || 0,
    pins_scheduled: project.pins.filter(p => p.status === 'ready_to_publish').length,
    pins_published: project.pins.filter(p => p.status === 'published').length,
  }))
}
```

### Pattern 4: Responsive CSS Grid for Project Cards

**What:** Use Tailwind CSS Grid with responsive breakpoints for card layout (no library needed)

**When to use:** Dashboard project card grid

**Example:**
```typescript
// Source: Tailwind CSS Grid documentation
// routes/_authed/dashboard.tsx

function Dashboard() {
  const { data: projects, isLoading } = useBlogProjects()

  if (isLoading) return <div>Loading...</div>

  if (!projects?.length) return <EmptyDashboardState />

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <StatsBar />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {projects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </main>
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Don't fetch user/tenant on every query**: The auth guard in `_authed.tsx` already provides user context. Use `Route.useRouteContext()` to access it.
- **Don't use React state for server data**: Always use TanStack Query for data that lives in Supabase. React state is only for UI state (dialog open/closed, form inputs).
- **Don't ignore optimistic updates for mutations**: Users expect instant feedback. Always implement onMutate for create/update operations.
- **Don't skip cache invalidation**: After mutations, always invalidate related queries or the UI will show stale data.
- **Don't validate on submit only**: Use inline validation (`form.formState.errors`) to show errors as users type.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | Zod schemas with React Hook Form | Type-safe, declarative, handles edge cases (URLs, emails, min/max) |
| Toast notifications | Custom notification system | Sonner (already installed) | Handles stacking, auto-dismiss, positioning, animations |
| Data caching | Manual cache with useEffect | TanStack Query | Handles cache invalidation, refetch on focus, stale-while-revalidate automatically |
| Modal dialogs | Custom modal with useState | shadcn/ui Dialog | Handles focus trapping, ESC key, overlay clicks, accessibility |
| Optimistic updates | Manual state updates | TanStack Query onMutate | Built-in rollback on error, automatic cache management |

**Key insight:** CRUD operations have dozens of edge cases (race conditions, rollback, cache invalidation, loading states, error handling). TanStack Query solves 90% of these problems out of the box. Custom solutions almost always miss critical edge cases.

## Common Pitfalls

### Pitfall 1: Forgetting RLS Policies for New Tables
**What goes wrong:** New `blog_projects` table is created but RLS policies are not added. Users see each other's data or get permission denied errors.

**Why it happens:** Easy to focus on schema and forget RLS. Supabase blocks all queries by default when RLS is enabled without policies.

**How to avoid:**
1. Always enable RLS when creating table: `ALTER TABLE blog_projects ENABLE ROW LEVEL SECURITY;`
2. Add policies immediately after table creation
3. Test with multiple users to verify isolation

**Warning signs:**
- "permission denied for table" errors in console
- Queries return empty arrays unexpectedly
- Users report seeing other users' data

### Pitfall 2: Cascade Delete Without User Warning
**What goes wrong:** User deletes blog project. Cascade constraint deletes 100+ related articles and pins without warning. User loses all data.

**Why it happens:** Database CASCADE constraint is efficient but silent. User doesn't understand consequences.

**How to avoid:**
1. Query related counts before showing delete dialog
2. Show clear warning: "This will delete 45 articles and 120 pins"
3. Require explicit confirmation if related data exists
4. Consider blocking deletion if data exists (force manual cleanup)

**Warning signs:**
- Users complaining about lost data
- No "undo" mechanism for destructive actions

### Pitfall 3: Missing Tenant ID on Inserts
**What goes wrong:** Blog project is created but `tenant_id` is null or wrong. RLS policies block access. Project disappears.

**Why it happens:** Forgot to include `tenant_id` in INSERT statement. Supabase doesn't auto-populate it.

**How to avoid:**
1. Always get `tenant_id` from authenticated user context
2. Include in every INSERT: `await supabase.from('blog_projects').insert({ ...data, tenant_id: user.tenant_id })`
3. Add NOT NULL constraint on tenant_id column to fail fast

**Warning signs:**
- "Created successfully" toast but project doesn't appear in list
- RLS policy violations in Supabase logs

### Pitfall 4: Form State Persists After Dialog Close
**What goes wrong:** User opens create dialog, types data, closes without saving. Opens again, old data is still there.

**Why it happens:** React Hook Form state persists in memory. Dialog close doesn't reset form.

**How to avoid:**
1. Call `form.reset()` in dialog's `onOpenChange` handler when `open` becomes false
2. Or use `key` prop on form to force remount: `<form key={open ? 'open' : 'closed'}>`

**Warning signs:**
- User reports stale data in forms
- Create dialog shows data from previous edit

### Pitfall 5: Optimistic Update Without Rollback
**What goes wrong:** UI shows "Project created" instantly (optimistic update). Server returns error. UI still shows project even though it wasn't created.

**Why it happens:** Implemented `onMutate` for optimistic update but forgot `onError` rollback.

**How to avoid:**
1. Always implement both `onMutate` AND `onError` together
2. In `onMutate`, return previous state: `return { previousProjects }`
3. In `onError`, restore it: `queryClient.setQueryData(['blog-projects'], context.previousProjects)`

**Warning signs:**
- Ghost entries that disappear on page refresh
- Actions appear successful but data isn't saved

## Code Examples

Verified patterns from official sources:

### Complete Supabase CRUD API Layer
```typescript
// Source: Supabase JS client documentation
// lib/api/blog-projects.ts

import { supabase } from '@/lib/supabase'
import type { BlogProject, BlogProjectInsert, BlogProjectUpdate } from '@/types/blog-projects'

export async function getBlogProjects(): Promise<BlogProject[]> {
  const { data, error } = await supabase
    .from('blog_projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getBlogProject(id: string): Promise<BlogProject> {
  const { data, error } = await supabase
    .from('blog_projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createBlogProject(project: BlogProjectInsert): Promise<BlogProject> {
  // Get current user's tenant_id from auth context
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')

  const { data, error } = await supabase
    .from('blog_projects')
    .insert({ ...project, tenant_id: profile.tenant_id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBlogProject({ id, ...updates }: BlogProjectUpdate): Promise<BlogProject> {
  const { data, error } = await supabase
    .from('blog_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBlogProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Check if project has related data before deletion
export async function checkProjectRelatedData(id: string): Promise<{ articles: number; pins: number }> {
  const [articlesResult, pinsResult] = await Promise.all([
    supabase.from('blog_articles').select('id', { count: 'exact', head: true }).eq('blog_project_id', id),
    supabase.from('pins').select('id', { count: 'exact', head: true }).eq('blog_project_id', id),
  ])

  return {
    articles: articlesResult.count || 0,
    pins: pinsResult.count || 0,
  }
}
```

### Sonner Toast Notifications
```typescript
// Source: Sonner documentation
import { toast } from 'sonner'

// Success notification
toast.success('Project created successfully')

// Error notification
toast.error('Failed to create project')

// Promise notification (auto updates based on promise result)
toast.promise(
  createBlogProject(data),
  {
    loading: 'Creating project...',
    success: 'Project created!',
    error: 'Failed to create project',
  }
)
```

### Complete Database Schema for blog_projects
```sql
-- Source: Multi-tenant RLS patterns + Airtable data model
-- supabase/migrations/00002_blog_projects.sql

CREATE TABLE IF NOT EXISTS public.blog_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES profiles(tenant_id) ON DELETE CASCADE,

  -- Core fields
  name TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  rss_url TEXT,
  scraping_frequency TEXT DEFAULT 'weekly' CHECK (scraping_frequency IN ('daily', 'weekly', 'manual')),

  -- Optional description
  description TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.blog_projects ENABLE ROW LEVEL SECURITY;

-- Create index for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_blog_projects_tenant_id ON public.blog_projects(tenant_id);

-- RLS Policies
CREATE POLICY "Users can view own blog projects"
  ON public.blog_projects
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create own blog projects"
  ON public.blog_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own blog projects"
  ON public.blog_projects
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can delete own blog projects"
  ON public.blog_projects
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Auto-update updated_at timestamp
CREATE TRIGGER set_blog_projects_updated_at
  BEFORE UPDATE ON public.blog_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux for all state | TanStack Query for server state, minimal local state | 2021-2022 | Less boilerplate, automatic caching, better performance |
| Formik + Yup | React Hook Form + Zod | 2022-2023 | Better TypeScript inference, fewer re-renders, smaller bundle |
| Custom toast systems | Sonner | 2023-2024 | Consistent UX, less code, better animations |
| getServerSideProps (Next.js) | TanStack Router loaders | 2024-2025 | Better client-side navigation, less full-page reloads |
| CSS-in-JS (styled-components) | Tailwind CSS | 2022-2023 | Faster builds, smaller runtime, better performance |

**Deprecated/outdated:**
- **Redux Toolkit for server state**: TanStack Query is purpose-built for server state and handles caching better
- **Formik**: Still works but React Hook Form is faster and has better TypeScript support
- **Material-UI v4**: Replaced by MUI v5 with better Tailwind integration, but shadcn/ui is lighter weight
- **Next.js Pages Router for new projects**: App Router is now stable (but we're using TanStack Router SPA)

## Open Questions

1. **AI Context Fields Storage Strategy**
   - What we know: Airtable has 16+ text fields for AI context (target audience, brand voice, visual style, etc.)
   - What's unclear: Should these be individual columns (type-safe, queryable) or JSONB blob (flexible, easier to extend)?
   - Recommendation: Start with individual columns for Phase 2 (name, blog_url, rss_url, scraping_frequency only). Add AI context fields in later phase when AI metadata generation is implemented. This keeps Phase 2 focused on core CRUD.

2. **RSS URL Validation**
   - What we know: User can provide RSS URL for scraping, but not all blogs have RSS feeds
   - What's unclear: Should we validate that RSS URL is accessible during form submission?
   - Recommendation: Allow empty RSS URL (make it optional). Validate URL format with Zod but don't ping the URL during creation. Scraping phase will handle validation when actually scraping.

3. **Project Detail Page Scope**
   - What we know: Clicking project card should navigate to project detail page
   - What's unclear: What should project detail page show in Phase 2 (articles/pins don't exist yet)?
   - Recommendation: Create detail page route but show "Coming soon" sections for Articles and Pins. Display project metadata (name, URL, created date) and edit/delete buttons.

## Sources

### Primary (HIGH confidence)
- TanStack Query v5 Documentation - `/websites/tanstack_query_v5` - Queries, mutations, optimistic updates, cache invalidation
- shadcn/ui Documentation - `/websites/ui_shadcn` - Dialog, Form, Input components with React Hook Form integration
- Sonner Documentation - `/websites/sonner_emilkowal_ski` - Toast notifications API
- Supabase JS Client Documentation - Official docs via codebase patterns - RLS policies, CRUD operations, auth integration

### Secondary (MEDIUM confidence)
- [Supabase + TanStack Query Integration Best Practices](https://supabase.com/docs/guides/getting-started/quickstarts/tanstack) - Server-side prefetching, cache helpers, stale time configuration
- [Next.js + TanStack Query + Supabase Guide](https://silvestri.co/blog/nextjs-tanstack-query-supabase-guide) - Query invalidation patterns
- [Multi-tenant RLS Patterns](https://www.permit.io/blog/postgres-rls-implementation-guide) - Postgres RLS implementation guide
- [Multi-tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - AWS best practices
- [shadcn/ui Dialog Controlled State](https://medium.com/@tobias.hallmayer/effective-way-to-maintain-shadcn-ui-dialog-component-and-pass-data-to-it-875b426f6045) - Dialog state management patterns
- [Tremor Dashboard Components](https://www.tremor.so/) - Dashboard statistics card patterns
- [Material UI Dashboard Templates](https://mui.com/store/collections/free-react-dashboard/) - Card grid layout examples

### Tertiary (LOW confidence)
- WebSearch results for React dashboard patterns 2026 - General best practices, not version-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are already installed and official documentation is current
- Architecture: HIGH - TanStack Query + Supabase patterns are well-documented and proven
- Pitfalls: MEDIUM - Based on common issues in multi-tenant SaaS but specific to this tech stack
- Database schema: HIGH - Directly mapped from Airtable data model analysis

**Research date:** 2026-01-27
**Valid until:** ~30 days (February 2026) - Stack is stable, no major version changes expected

# Phase 9: Consistent UI & Dashboard Layout - Research

**Researched:** 2026-02-09
**Domain:** UI consistency, layout patterns, design systems
**Confidence:** HIGH

## Summary

Phase 9 addresses UI consistency and dashboard layout improvements after 8 rapid development phases. The current codebase exhibits common patterns built organically: inconsistent container widths (max-w-4xl, max-w-5xl, max-w-7xl, none), duplicate page wrapper code (every route has `<div className="min-h-screen bg-slate-50"><Header user={user} /><main>...</main></div>`), mixed padding values (py-6, py-8), and header navigation in top bar rather than modern sidebar pattern. Analysis reveals 11 instances of identical page wrapper code across routes, with container max-widths varying per page without clear reasoning.

The phase should focus on three areas: (1) extracting a reusable PageLayout component to eliminate duplication and enforce consistency, (2) migrating from top header navigation to shadcn/ui's new official Sidebar component (released Feb 2026), and (3) standardizing spacing, container widths, and common UI states (loading, error, empty).

**Primary recommendation:** Use shadcn/ui's official Sidebar component as the foundation for consistent layout, extract shared page wrappers to eliminate duplication, and create design tokens for consistent spacing.

## Current State Analysis

### Identified Inconsistencies

**Container Widths (11 pages analyzed):**
- Dashboard: no max-width constraint
- Calendar: `max-w-7xl`
- Projects detail: `max-w-5xl`
- Article detail: `max-w-4xl`
- Pin detail: `max-w-5xl`

**Vertical Padding:**
- Most pages use `py-8` for main content
- Calendar uses `py-6`
- Inconsistent component padding: mix of `py-1`, `py-2`, `py-0.5`

**Page Wrapper Duplication:**
```tsx
// Repeated 11 times across routes with slight variations
<div className="min-h-screen bg-slate-50">
  <Header user={user} />
  <main className="container mx-auto px-4 py-8">
    {/* Loading state - different implementation per page */}
    {/* Error state - different implementation per page */}
    {/* Content */}
  </main>
</div>
```

**Loading States:**
- Dashboard: Custom spinner div
- Projects: Custom spinner div
- Articles: Custom spinner div
- Pins: Custom spinner div
All implement identical spinner markup separately.

**Navigation:**
- Current: Top header with inline nav links (Dashboard, Calendar)
- Limited to 2 main routes
- No room for growth as features expand

### What Works Well

- Tailwind CSS v4 with design tokens in `src/styles.css`
- shadcn/ui "new-york" style components (16 UI components installed)
- TanStack Router file-based routing with nested layouts via `_authed.tsx`
- Consistent color scheme (slate grays, Pinterest red primary)
- Header component with user dropdown

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui | Latest (2026) | UI component library | Official Sidebar released Feb 2026, battle-tested patterns, 1729+ code snippets in Context7 |
| Tailwind CSS | v4 | Utility-first styling | Design tokens, consistent spacing scales, official @tailwindcss/typography plugin |
| TanStack Router | v1 (in use) | File-based routing | Nested layouts, type-safe routing, route context for user data |
| lucide-react | Latest | Icon system | Consistent icon style, tree-shakeable, used throughout shadcn/ui |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority (CVA) | Latest | Component variants | Creating container variants (narrow, medium, wide) |
| clsx / cn utility | Current | Conditional classes | Dynamic className composition |

### Installation

```bash
# shadcn/ui Sidebar component (new in Feb 2026)
npx shadcn add sidebar

# Breadcrumb component for page headers
npx shadcn add breadcrumb

# No additional packages needed - all infrastructure exists
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx           # NEW: Main sidebar navigation
│   │   ├── page-layout.tsx           # NEW: Reusable page wrapper
│   │   ├── page-header.tsx           # NEW: Consistent page header with breadcrumbs
│   │   ├── loading-spinner.tsx       # NEW: Shared loading state
│   │   ├── error-state.tsx           # NEW: Shared error state
│   │   └── header.tsx                # MODIFY or REMOVE: Current top header
│   └── ui/                           # Existing shadcn/ui components
├── routes/
│   ├── __root.tsx                    # MODIFY: Add SidebarProvider
│   ├── _authed.tsx                   # MODIFY: Add AppSidebar + SidebarInset
│   └── _authed/                      # MODIFY: Use PageLayout, remove duplication
```

### Pattern 1: Sidebar-Based Application Layout

**What:** Modern dashboard layout with collapsible sidebar, consistent page structure, and responsive behavior.

**When to use:** Multi-section applications with 3+ main routes (current app: Dashboard, Calendar, future: Settings, Analytics, etc.)

**Example:**

```typescript
// Source: https://ui.shadcn.com/docs/components/base/sidebar
// _authed.tsx layout
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw redirect({ to: '/login' })
    }
    return { user: context.user }
  },
  component: () => {
    const { user } = Route.useRouteContext()

    return (
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    )
  },
})
```

```typescript
// Source: https://ui.shadcn.com/docs/components/base/sidebar
// components/layout/app-sidebar.tsx
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail
} from "@/components/ui/sidebar"
import { Link } from "@tanstack/react-router"
import { LayoutDashboard, Calendar, Settings } from "lucide-react"

export function AppSidebar({ user }: { user: AuthUser }) {
  const navItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Calendar", url: "/calendar", icon: Calendar },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-4">
          <h1 className="text-xl font-bold">Petra</h1>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link
                  to={item.url}
                  activeProps={{ className: "bg-sidebar-accent" }}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        {/* User menu - move from current Header */}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
```

### Pattern 2: Reusable PageLayout Component

**What:** Eliminates duplicate page wrapper code, enforces consistent container widths, provides consistent loading/error states.

**When to use:** Every page in the application.

**Example:**

```typescript
// Source: Derived from Container Pattern - https://www.emreturan.dev/articles/container-component
// components/layout/page-layout.tsx
import { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

const containerVariants = cva(
  "mx-auto px-4 py-8",
  {
    variants: {
      maxWidth: {
        narrow: "max-w-3xl",    // Articles, forms
        medium: "max-w-5xl",    // Detail pages (projects, pins)
        wide: "max-w-7xl",      // Dashboards, calendars
        full: "",               // Full width
      },
    },
    defaultVariants: {
      maxWidth: "wide",
    },
  }
)

interface PageLayoutProps extends VariantProps<typeof containerVariants> {
  children: ReactNode
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
}

export function PageLayout({
  children,
  maxWidth,
  isLoading,
  error,
  onRetry
}: PageLayoutProps) {
  if (isLoading) {
    return (
      <div className={containerVariants({ maxWidth })}>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className={containerVariants({ maxWidth })}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  }

  return (
    <div className={containerVariants({ maxWidth })}>
      {children}
    </div>
  )
}
```

**Usage in routes:**

```typescript
// Before (duplicated):
<div className="min-h-screen bg-slate-50">
  <Header user={user} />
  <main className="container mx-auto px-4 py-8 max-w-5xl">
    {isLoading && <div>Loading...</div>}
    {error && <div>Error</div>}
    {!isLoading && !error && <ProjectContent />}
  </main>
</div>

// After (consistent):
<PageLayout
  maxWidth="medium"
  isLoading={isLoading}
  error={error}
  onRetry={refetch}
>
  <ProjectContent />
</PageLayout>
```

### Pattern 3: Consistent Page Headers with Breadcrumbs

**What:** Standardized page header with optional breadcrumb navigation, title, and actions.

**When to use:** Detail pages (project, article, pin) to show hierarchy and provide back navigation.

**Example:**

```typescript
// Source: https://ui.shadcn.com/docs/components/radix/breadcrumb
// components/layout/page-header.tsx
import { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage
} from "@/components/ui/breadcrumb"
import { SidebarTrigger } from "@/components/ui/sidebar"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[]
  title: string
  actions?: ReactNode
}

export function PageHeader({ breadcrumbs, title, actions }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b px-6 py-4">
      <div className="flex items-center gap-2 mb-2">
        <SidebarTrigger />
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => (
                <>
                  <BreadcrumbItem key={item.label}>
                    {item.href ? (
                      <BreadcrumbLink asChild>
                        <Link to={item.href}>{item.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                </>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </header>
  )
}
```

**Usage:**

```typescript
// projects/$id.tsx
<PageLayout maxWidth="medium">
  <PageHeader
    breadcrumbs={[
      { label: "Dashboard", href: "/dashboard" },
      { label: project.name }
    ]}
    title={project.name}
    actions={
      <>
        <Button onClick={handleEdit}>Edit</Button>
        <Button variant="outline">Delete</Button>
      </>
    }
  />
  <ProjectContent />
</PageLayout>
```

### Pattern 4: Discriminated Unions for UI States

**What:** Type-safe loading/error/success state management pattern.

**When to use:** Pages fetching data with TanStack Query.

**Example:**

```typescript
// Source: https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/
// Discriminated union pattern for type safety
type PageState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T }

// Component implementation
function ProjectDetailPage() {
  const { data, isLoading, error } = useBlogProject(id)

  const state: PageState<BlogProject> =
    isLoading ? { status: 'loading' } :
    error ? { status: 'error', error } :
    data ? { status: 'success', data } :
    { status: 'loading' }

  return (
    <PageLayout
      isLoading={state.status === 'loading'}
      error={state.status === 'error' ? state.error : null}
    >
      {state.status === 'success' && (
        <ProjectContent project={state.data} />
      )}
    </PageLayout>
  )
}
```

### Anti-Patterns to Avoid

- **Inline page wrappers:** Never inline `<div className="min-h-screen bg-slate-50">` markup; always use `PageLayout`
- **Inconsistent container widths:** Don't choose widths arbitrarily; use defined variants (narrow/medium/wide/full)
- **Duplicate loading spinners:** Extract to shared `LoadingSpinner` component
- **Mixed spacing scales:** Stick to Tailwind's spacing scale (4, 6, 8, 12, 16); avoid arbitrary values
- **Back button + breadcrumbs:** Use breadcrumbs OR back button, not both (breadcrumbs are superior for multi-level navigation)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar navigation | Custom sidebar with state management | shadcn/ui Sidebar component | Handles collapsed state, mobile responsive, keyboard nav, ARIA labels, smooth transitions |
| Breadcrumb navigation | Custom breadcrumb with manual separator logic | shadcn/ui Breadcrumb | Proper ARIA landmarks, semantic HTML, screen reader support |
| Container widths | Scattered max-w-* classes | CVA-based container variants | Type-safe, consistent, self-documenting |
| Loading states | Per-page spinner implementations | Shared LoadingSpinner + PageLayout | Eliminates duplication, consistent UX |
| Page layouts | Copy-paste page wrappers | PageLayout component | Single source of truth, easier refactoring |

**Key insight:** shadcn/ui components handle complex accessibility, responsive behavior, and edge cases that custom solutions miss. The Sidebar component alone handles collapsible state, mobile sheet, keyboard navigation, focus management, and ARIA labels—recreating this is 500+ lines of code and weeks of testing.

## Common Pitfalls

### Pitfall 1: Fighting TanStack Router Layouts

**What goes wrong:** Trying to wrap routes in layout components outside the router system leads to lost route context, missing auth guards, and hydration mismatches.

**Why it happens:** Developers treat TanStack Router like React Router and wrap components in HOCs instead of using nested route files.

**How to avoid:** Use TanStack Router's file-based nested layouts. Place shared layout in parent route (`_authed.tsx`), render `<Outlet />` for children. The router handles everything.

**Warning signs:**
- `useRouteContext()` returns undefined in child routes
- Auth redirects don't work on nested pages
- Hydration errors in browser console

### Pitfall 2: Premature Container Width Decisions

**What goes wrong:** Developers set different max-widths per page without testing content, leading to jarring width changes when navigating.

**Why it happens:** Each page is built in isolation without considering navigation flow.

**How to avoid:** Start with one width (wide), then create variants only when content truly benefits (narrow for forms/articles, wide for data-heavy views). Test navigation flow between pages.

**Warning signs:**
- Width jumps when navigating between related pages (project → article → pin)
- Content feels cramped or too wide
- Users mention disorienting navigation experience

### Pitfall 3: Inconsistent Loading State Placement

**What goes wrong:** Some pages show loading state in PageLayout, others inline, creating inconsistent loading UX.

**Why it happens:** PageLayout adopted gradually; old pages keep inline patterns.

**How to avoid:** Enforce pattern via TypeScript: make `PageLayout` the only way to render page content. All loading/error states go through PageLayout props.

**Warning signs:**
- Mix of spinner positions (center, top, left)
- Different spinner styles across pages
- Flashing content as loading states mount

### Pitfall 4: Over-Engineering Spacing System

**What goes wrong:** Creating custom spacing tokens (--spacing-page-top: 2rem) when Tailwind's scale works fine.

**Why it happens:** Desire for "perfect" consistency leads to premature abstraction.

**How to avoid:** Use Tailwind's spacing scale (py-8, py-6, gap-4). Only create custom tokens when Tailwind's scale truly doesn't fit (rare).

**Warning signs:**
- More time configuring spacing than building features
- CSS variables for spacing that map 1:1 to Tailwind values
- Team confusion about which spacing system to use

### Pitfall 5: Sidebar Replaces Everything

**What goes wrong:** Moving ALL navigation to sidebar, including contextual actions (edit project button).

**Why it happens:** "Sidebar for navigation" interpreted too broadly.

**How to avoid:** Sidebar = global/section navigation (Dashboard, Calendar). PageHeader = page-specific actions (Edit Project). Keep them separate.

**Warning signs:**
- Sidebar growing beyond 10 items
- Sidebar items change per page
- Actions that should be contextual live in sidebar

## Code Examples

Verified patterns from official sources:

### Sidebar Installation and Setup

```bash
# Source: https://ui.shadcn.com/docs/components/base/sidebar
npx shadcn add sidebar

# Installs these sub-components:
# - Sidebar, SidebarProvider, SidebarTrigger
# - SidebarContent, SidebarHeader, SidebarFooter
# - SidebarMenu, SidebarMenuItem, SidebarMenuButton
# - SidebarInset, SidebarRail
```

### Tailwind Container Pattern with CVA

```typescript
// Source: https://www.emreturan.dev/articles/container-component
import { cva } from "class-variance-authority"

const container = cva("mx-auto px-4 sm:px-6 lg:px-8", {
  variants: {
    maxWidth: {
      narrow: "max-w-3xl",
      medium: "max-w-5xl",
      wide: "max-w-7xl",
      full: "",
    },
  },
  defaultVariants: {
    maxWidth: "wide",
  },
})

// Usage:
<div className={container({ maxWidth: "medium" })}>
  {children}
</div>
```

### Consistent Loading State Component

```typescript
// Source: Best practices from https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900"
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  )
}
```

### Error State with Retry

```typescript
// Source: Best practices from https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  error: Error
  onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <AlertCircle className="h-12 w-12 text-red-500" />
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          {error.message || "An unexpected error occurred"}
        </p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          Try again
        </Button>
      )}
    </div>
  )
}
```

### Empty State Component

```typescript
// Source: https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
      <FileQuestion className="h-12 w-12 text-slate-400" />
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {description && (
          <p className="text-sm text-slate-600 mt-1">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top header nav | Sidebar navigation | 2024-2025 | More scalable for 5+ routes, better mobile UX, collapsible for content focus |
| Custom sidebar implementations | shadcn/ui Sidebar component | Feb 2026 | Official component with full a11y, responsive, maintained |
| Container/Presentational pattern | Custom Hooks + composition | React 18+ (2022) | Hooks replace class-based containers, simpler code |
| Copy-paste page layouts | Layout components with variants | 2023+ | CVA enables type-safe variants, self-documenting APIs |
| Arbitrary container widths | Systematic max-width scale | 2024+ | Consistent reading widths, less decision fatigue |

**Deprecated/outdated:**
- **Top-only navigation:** Dashboard apps with 5+ routes need sidebar for scannability and grouping
- **Class-based Container components:** Replaced by custom hooks and composition
- **Manual responsive breakpoints:** Tailwind's container plugin handles responsive widths automatically

## Open Questions

1. **Should Dashboard stats (scheduled/published/pending counts) be in sidebar or page content?**
   - What we know: Stats currently live in Dashboard page content as cards
   - What's unclear: Whether global stats should persist in sidebar across all views
   - Recommendation: Keep in Dashboard page. Sidebar is for navigation, not data. Add badge count to "Calendar" nav item if needed.

2. **Keep current Header component or move user menu to Sidebar footer?**
   - What we know: Current Header has user dropdown in top-right; Sidebar pattern moves this to footer
   - What's unclear: Whether top app bar is needed at all with Sidebar
   - Recommendation: Remove Header entirely. Move user menu to SidebarFooter. Use SidebarTrigger in PageHeader for mobile.

3. **Should PageLayout handle breadcrumbs or keep separate PageHeader?**
   - What we know: Breadcrumbs are page-specific, not layout-wide
   - What's unclear: Whether PageLayout should compose PageHeader automatically
   - Recommendation: Keep separate. PageLayout = container/loading/error. PageHeader = breadcrumbs/title/actions. Compose manually for flexibility.

4. **Migrate calendar sidebar (pin detail) to use PageLayout pattern?**
   - What we know: Calendar has custom right sidebar for pin details that slides over content
   - What's unclear: Whether this conflicts with Sidebar navigation or PageLayout
   - Recommendation: No conflict. App sidebar (left) is navigation. Pin sidebar (right) is content detail. Keep as-is, but extract to shared component if pattern repeats.

## Sources

### Primary (HIGH confidence)

- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/base/sidebar) - Official sidebar implementation, Feb 2026
- [shadcn/ui Breadcrumb Component](https://ui.shadcn.com/docs/components/radix/breadcrumb) - Official breadcrumb navigation
- [Context7 shadcn/ui Documentation](https://ui.shadcn.com) - 1729 code snippets, official patterns
- [TanStack Start Code Execution Patterns](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns) - Layout route patterns
- [Container Component Pattern](https://www.emreturan.dev/articles/container-component) - CVA-based container variants

### Secondary (MEDIUM confidence)

- [Tailwind CSS Best Practices 2025-2026](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns) - Design tokens, spacing consistency
- [UI Design Best Practices: Loading, Error, Empty States](https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/) - State management patterns
- [Breadcrumbs UX: The Ultimate Design Guide](https://www.pencilandpaper.io/articles/breadcrumbs-ux) - When to use breadcrumbs vs back buttons
- [React Layout Components Concept](https://blog.openreplay.com/reacts-layout-components-concept/) - Wrapper component patterns
- [Building Reusable React Layouts](https://www.dhiwise.com/post/building-better-uis-with-reusable-react-layouts) - Composition patterns

### Tertiary (LOW confidence)

- Various dashboard template galleries - General patterns, not project-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official shadcn/ui components, proven Tailwind patterns
- Architecture: HIGH - Context7-verified patterns, official TanStack Router docs
- Pitfalls: MEDIUM - Based on common issues in React dashboards, not project-specific testing

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable ecosystem)

**Codebase findings:**
- 11 instances of duplicate page wrapper code
- 5 different container max-widths in use (none, max-w-4xl, max-w-5xl, max-w-7xl)
- 16 shadcn/ui components already installed
- Tailwind CSS v4 with design tokens configured
- TanStack Router with nested `_authed.tsx` layout ready for enhancement

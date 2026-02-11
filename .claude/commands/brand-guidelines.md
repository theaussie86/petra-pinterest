---
name: brand-guidelines
description: Applies Petra Pinterest's brand colors, typography, layout, navigation, and UX patterns to any UI work. Use when building new components, pages, or visual elements that should match the project's design system.
---

# Petra Pinterest Design System

## Overview

Use this skill to apply Petra Pinterest's design system when creating or modifying UI components, pages, or visual elements. This covers colors, typography, layout, navigation, component patterns, and UX guidelines.

**Keywords**: branding, visual identity, styling, brand colors, typography, design system, UI components, layout, navigation, user flows

---

## Color Palette

### Primary & Brand Colors

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--color-primary` | `#e60023` | `primary` | CTAs, active navigation, brand accents |
| `--color-primary-foreground` | `#ffffff` | `primary-foreground` | Text on primary backgrounds |
| `--color-secondary` | `#0d9488` | `secondary` | Links, info states, secondary actions, hover accents |
| `--color-secondary-foreground` | `#ffffff` | `secondary-foreground` | Text on secondary backgrounds |
| `--color-ring` | `#e60023` | `ring` | Focus rings (primary red) |

### Neutral Palette (Slate)

Target palette uses slate for cool blue undertone:

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--color-background` | `#ffffff` | `background` | Page background |
| `--color-foreground` | `#0f172a` | `foreground` | Primary text (slate-900) |
| `--color-muted` | `#f1f5f9` | `muted` | Muted backgrounds (slate-100) |
| `--color-muted-foreground` | `#64748b` | `muted-foreground` | Secondary text (slate-500) |
| `--color-border` | `#e2e8f0` | `border` | Borders, dividers (slate-200) |
| `--color-input` | `#e2e8f0` | `input` | Input borders (slate-200) |
| `--color-accent` | `#f1f5f9` | `accent` | Hover/subtle backgrounds (slate-100) |
| `--color-accent-foreground` | `#0f172a` | `accent-foreground` | Text on accent (slate-900) |

### Surface Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-card` | `#ffffff` | Card backgrounds |
| `--color-card-foreground` | `#0f172a` | Card text (slate-900) |
| `--color-popover` | `#ffffff` | Popover/dropdown backgrounds |
| `--color-popover-foreground` | `#0f172a` | Popover text (slate-900) |

### Sidebar Colors (Dark Theme)

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--color-sidebar` | `#0f172a` | `sidebar` | Sidebar background (slate-900) |
| `--color-sidebar-foreground` | `#e2e8f0` | `sidebar-foreground` | Sidebar text (slate-200) |
| `--color-sidebar-accent` | `#1e293b` | `sidebar-accent` | Hover/active items (slate-800) |
| `--color-sidebar-accent-foreground` | `#f8fafc` | `sidebar-accent-foreground` | Active item text (slate-50) |
| `--color-sidebar-border` | `#334155` | `sidebar-border` | Dividers within sidebar (slate-700) |
| `--color-sidebar-ring` | `#e60023` | `sidebar-ring` | Focus rings in sidebar (primary red) |
| `--color-sidebar-primary` | `#e60023` | `sidebar-primary` | Active nav indicator in sidebar |
| `--color-sidebar-primary-foreground` | `#ffffff` | `sidebar-primary-foreground` | Active nav text |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-success` | `#059669` | Published state, success feedback (emerald-600) |
| `--color-warning` | `#d97706` | Publishing in progress, pending (amber-600) |
| `--color-destructive` | `#dc2626` | Error states, delete actions (red-600) |

### Pin Status Colors

Use Tailwind utility classes (not theme tokens) for semantic badge coloring:

| Status | Badge Classes |
|--------|---------------|
| Draft (Entwurf) | `bg-slate-100 text-slate-700` |
| Ready for Generation | `bg-blue-100 text-blue-700` |
| Generating Metadata | `bg-violet-100 text-violet-700` |
| Metadata Created | `bg-teal-100 text-teal-700` |
| Ready to Schedule | `bg-green-100 text-green-700` |
| Publishing | `bg-amber-100 text-amber-700` |
| Published | `bg-emerald-100 text-emerald-700` |
| Error | `bg-red-100 text-red-700` |
| Deleted | `bg-gray-100 text-gray-500` |

---

## Typography

### Font Family

**Inter** — Clean, modern sans-serif. shadcn/ui default.

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Load via Google Fonts or `@fontsource/inter` package.

### Type Scale

| Element | Tailwind |
|---------|----------|
| Page title | `text-2xl font-semibold` |
| Section heading | `text-xl font-semibold` |
| Card title | `text-lg font-medium` |
| Body | `text-base` |
| Secondary text | `text-sm text-muted-foreground` |
| Caption/meta | `text-xs font-medium text-muted-foreground` |

### Spacing & Radius

- Default border radius: `0.5rem` (8px) via `--radius-default`
- Follow Tailwind spacing scale for padding/margins

---

## Layout

### Sidebar (Desktop)

- **Component:** shadcn `<Sidebar>` with `collapsible="icon"`
- **Width expanded:** 256px (16rem)
- **Width collapsed:** 48px (3rem) — icons only with tooltips
- **Background:** Dark slate (`--color-sidebar`)
- **Active item:** Primary red left border indicator + lighter background
- **Collapse trigger:** Toggle button in sidebar header

### Sidebar (Mobile)

- **Trigger:** Hamburger icon in top header
- **Behavior:** Sheet/drawer from left (shadcn sidebar built-in)
- **Always expanded** when open on mobile (no icon-only mode)

### Main Content Area

- **Uses `<SidebarInset>`** — Shifts content based on sidebar state
- **Max width:** None (fluid), content-specific constraints as needed
- **Padding:** `p-6` standard, `p-4` on mobile

### Header

- **Lives inside `<SidebarInset>`** — Part of main content, not global
- **Contains:** Breadcrumbs/page title, SidebarTrigger (mobile), page actions
- **Sticky:** `sticky top-0 z-30` with background blur

---

## Navigation Structure

```
Sidebar
├── [Logo] Petra                    ← Brand mark + collapse trigger
├── Dashboard                       ← /dashboard (LayoutDashboard icon)
├── Calendar                        ← /calendar (Calendar icon)
├── Projects [popover trigger]      ← Popover with project list + "View all"
│     ├── Blog A → /projects/id-a
│     ├── Blog B → /projects/id-b
│     └── + New Project / View All
├── ─────────── (separator)
├── Settings                        ← /settings (Settings icon)
└── [Footer]
    └── User avatar + name          ← Dropdown: profile, sign out
```

### Page-Level Navigation (Sidebar)

| Item | Route | Icon | Description |
|------|-------|------|-------------|
| Dashboard | `/dashboard` | LayoutDashboard | Project overview, stats, quick actions |
| Calendar | `/calendar` | CalendarDays | Pin scheduling, visual timeline |
| Projects | Popover | FolderOpen | Quick-access to any project |
| Settings | `/settings` | Settings | Account, connections, preferences |

### In-Page Navigation (Tabs)

**Project Detail Page** (`/projects/$id`):
- Overview tab: Project stats, recent activity
- Articles tab: Scraped articles list, scrape controls
- Pins tab: Pin list with status filters, bulk actions
- Settings tab: Pinterest connection, scraping config

**Pin Detail Page** (`/pins/$pinId`):
- Single page (no tabs) — metadata, scheduling, publishing all visible

### Breadcrumbs

Every page below Dashboard shows a breadcrumb trail:
```
Dashboard / Project Name / Articles / Article Title
Dashboard / Project Name / Pins / Pin #123
Calendar (no breadcrumb — top-level)
Settings (no breadcrumb — top-level)
```

---

## Component Patterns

### Buttons

| Variant | Appearance | Usage |
|---------|------------|-------|
| `default` (primary) | Red bg, white text | Primary CTAs: Create, Save, Publish |
| `secondary` | Slate-100 bg, slate-900 text | Secondary actions: Cancel, Filter |
| `outline` | Border, transparent bg | Tertiary actions, toggles |
| `ghost` | No border/bg, hover shows bg | Inline actions, icon buttons |
| `destructive` | Red-600 bg, white text | Delete, disconnect |
| `link` | Teal text, underline on hover | Navigation links, inline actions |

### Cards

- White background, `border border-slate-200`
- `rounded-lg` (8px radius)
- Hover: subtle shadow (`hover:shadow-sm`) for interactive cards
- Padding: `p-4` to `p-6`

### Tables

- Clean style (no zebra stripes)
- Header: `text-xs font-medium text-muted-foreground uppercase tracking-wider`
- Rows: `border-b border-slate-100`
- Hover: `hover:bg-slate-50`

### Dialogs

- Centered overlay with backdrop blur
- Max width: `sm` (28rem) for forms, `lg` (32rem) for complex content
- Header: title + description, no close X in header (close via Cancel or clicking outside)

### Forms

- Labels: `text-sm font-medium` above inputs
- Inputs: `border-slate-200`, focus ring in primary red
- Error: `text-destructive text-sm` below field
- Spacing: `space-y-4` between fields

---

## User Flows

### Primary Persona

**Content Manager:** Manages multiple blog projects, creates and schedules pins daily, publishes to Pinterest. Primary workflow is the content pipeline.

### Flow 1: First-Time Setup

```
Sign In (Google OAuth)
  → Empty Dashboard (guided empty state with clear CTA)
    → Create Project (name + blog URL)
      → Project Detail → Connect Pinterest (OAuth) → Scrape Articles → Ready
```

### Flow 2: Content Pipeline (Daily Workflow)

```
Dashboard → Select Project → Articles tab
  → Select article → Create Pin(s) → Generate AI Metadata
    → Review/refine → Schedule pin → "Ready to Schedule" status
```

- Minimize navigation depth: project → article → pin should feel fluid
- Bulk operations for power users (bulk upload, bulk generate, bulk schedule)
- Status progression visible at every level

### Flow 3: Calendar Management

```
Calendar → Filter by project/status → Month view
  → Click pin → Sidebar detail panel → Edit schedule/metadata
  → "Unscheduled" tab → Bulk select → Bulk schedule
```

### Flow 4: Publishing

```
Calendar or Project Detail → View "Ready to Publish" pins
  → Publish individual or bulk → Status: "Publishing" → "Published"
  → View on Pinterest link appears
```

Also automated: Inngest cron every 15 min auto-publishes scheduled pins past their publish time.

### Flow 5: Error Recovery

```
Dashboard (error count badge) or Calendar (red-bordered pins)
  → Click failed pin → View error → Reset status → Fix → Retry
```

- Errors visible from dashboard level, not hidden in detail pages
- Recovery in 1-2 clicks max

---

## Cross-Cutting UX Concerns

### Loading States
- Skeleton screens for initial page loads (not spinners)
- Inline loading for actions (button disabled + spinner text)
- Optimistic updates where safe (create operations)

### Empty States
- Every list has a meaningful empty state with CTA
- Contextual guidance ("No pins yet? Create your first pin from an article.")

### Error States
- Inline errors near the triggering action
- Toast notifications for background operation results (Sonner)
- Error count badges on navigation items

### Responsive Behavior
- **Desktop (1024px+):** Sidebar + main content, full tables and grids
- **Tablet (768-1023px):** Collapsed sidebar (icon mode), simplified tables
- **Mobile (<768px):** Hamburger drawer, stacked layouts, bottom sheet for actions

---

## Design Principles

1. **Professional & polished** — Client-facing quality, consistent spacing, thoughtful hierarchy
2. **Pinterest-adjacent** — Red as accent (sparingly), not overwhelming; the tool serves Pinterest, it's not Pinterest
3. **Dark anchor, light canvas** — Dark sidebar grounds the layout; white content area keeps focus on data
4. **Information density** — Show useful data, minimize clicks. Power users work here daily
5. **Status clarity** — Pin workflow statuses are the visual language; consistent colors across all surfaces

---

## Technical Details

### CSS Variables

All colors defined as CSS custom properties in `src/styles.css` under `@theme`. Reference via Tailwind utilities:
- `bg-primary`, `text-primary`, `border-primary`
- `bg-muted`, `text-muted-foreground`
- `bg-destructive`, `text-destructive`
- `bg-sidebar`, `text-sidebar-foreground`, etc.

Sidebar variables use `@theme inline` with CSS custom properties in `:root` / `.dark`.

### Component Library

Uses shadcn/ui ("new-york" style) primitives in `src/components/ui/`. Always use existing shadcn components rather than building custom equivalents.

### Tailwind CSS v4

Styling uses Tailwind CSS v4 with the `@theme` directive for design tokens. No `tailwind.config.js` — configuration lives in `src/styles.css`.

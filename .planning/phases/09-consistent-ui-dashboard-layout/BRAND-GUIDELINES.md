# Brand Guidelines — Petra Pinterest

## Color Palette

### Primary Colors

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--color-primary` | `#e60023` | `primary` | CTAs, active navigation, brand accents |
| `--color-primary-foreground` | `#ffffff` | `primary-foreground` | Text on primary backgrounds |
| `--color-secondary` | `#0d9488` | `secondary` | Links, info states, secondary actions, hover accents |
| `--color-secondary-foreground` | `#ffffff` | `secondary-foreground` | Text on secondary backgrounds |

### Sidebar Colors (Dark)

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

### Neutral Palette (Slate)

Replacing pure grays with slate for cool blue undertone:

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `--color-background` | `#ffffff` | `background` | Page background |
| `--color-foreground` | `#0f172a` | `foreground` | Primary text (slate-900) |
| `--color-muted` | `#f1f5f9` | `muted` | Muted backgrounds (slate-100) |
| `--color-muted-foreground` | `#64748b` | `muted-foreground` | Secondary text (slate-500) |
| `--color-border` | `#e2e8f0` | `border` | Borders, dividers (slate-200) |
| `--color-input` | `#e2e8f0` | `input` | Input borders (slate-200) |
| `--color-ring` | `#e60023` | `ring` | Focus rings (primary) |
| `--color-accent` | `#f1f5f9` | `accent` | Hover/subtle backgrounds (slate-100) |
| `--color-accent-foreground` | `#0f172a` | `accent-foreground` | Text on accent (slate-900) |

### Surface Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-card` | `#ffffff` | Card backgrounds |
| `--color-card-foreground` | `#0f172a` | Card text (slate-900) |
| `--color-popover` | `#ffffff` | Popover/dropdown backgrounds |
| `--color-popover-foreground` | `#0f172a` | Popover text (slate-900) |

### Pin Status Colors (Unchanged)

These remain as Tailwind utility classes (not theme tokens) for semantic badge coloring:

| Status | Color | Badge Classes |
|--------|-------|---------------|
| Draft (Entwurf) | Slate | `bg-slate-100 text-slate-700` |
| Ready for Generation | Blue | `bg-blue-100 text-blue-700` |
| Generating Metadata | Violet | `bg-violet-100 text-violet-700` |
| Metadata Created | Teal | `bg-teal-100 text-teal-700` |
| Ready to Schedule | Green | `bg-green-100 text-green-700` |
| Publishing | Amber | `bg-amber-100 text-amber-700` |
| Published | Emerald | `bg-emerald-100 text-emerald-700` |
| Error | Red | `bg-red-100 text-red-700` |
| Deleted | Gray | `bg-gray-100 text-gray-500` |

---

## Typography

### Font Family

**Inter** — Clean, modern sans-serif. shadcn/ui default.

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Load via Google Fonts or `@fontsource/inter` package.

### Type Scale

| Element | Size | Weight | Color | Tailwind |
|---------|------|--------|-------|----------|
| Page title | 2xl (1.5rem) | Semibold (600) | foreground | `text-2xl font-semibold` |
| Section heading | xl (1.25rem) | Semibold (600) | foreground | `text-xl font-semibold` |
| Card title | lg (1.125rem) | Medium (500) | foreground | `text-lg font-medium` |
| Body | base (1rem) | Regular (400) | foreground | `text-base` |
| Secondary text | sm (0.875rem) | Regular (400) | muted-foreground | `text-sm text-muted-foreground` |
| Caption/meta | xs (0.75rem) | Medium (500) | muted-foreground | `text-xs font-medium text-muted-foreground` |

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

- **Moves into `<SidebarInset>`** — Part of main content, not global
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

## Design Principles

1. **Professional & polished** — Client-facing quality, consistent spacing, thoughtful hierarchy
2. **Pinterest-adjacent** — Red as accent (sparingly), not overwhelming; the tool serves Pinterest, it's not Pinterest
3. **Dark anchor, light canvas** — Dark sidebar grounds the layout; white content area keeps focus on data
4. **Information density** — Show useful data, minimize clicks. Power users work here daily
5. **Status clarity** — Pin workflow statuses are the visual language; consistent colors across all surfaces

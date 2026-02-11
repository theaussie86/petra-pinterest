# User Flows — Petra Pinterest

## Primary Personas

**Content Manager (Client-facing):** Manages multiple blog projects, creates and schedules pins daily, publishes to Pinterest. Primary workflow is the content pipeline.

---

## Flow 1: First-Time Setup

**Trigger:** New user signs in for the first time
**Goal:** Functional project with connected Pinterest and scraped articles

```
Sign In (Google OAuth)
  → Empty Dashboard (guided empty state)
    → Create Project (name + blog URL)
      → Project Detail page
        → Connect Pinterest (OAuth flow in Settings tab)
          → Scrape Articles (auto or manual trigger)
            → Ready to create pins
```

**Key UX needs:**
- Empty state should guide, not overwhelm — clear CTA
- Pinterest connection should be discoverable from project context
- First scrape should feel fast and show progress

---

## Flow 2: Content Pipeline (Daily Workflow)

**Trigger:** New articles scraped or user wants to create pins
**Goal:** Pins scheduled and ready for publishing

```
Dashboard
  → Select Project (sidebar popover or project card)
    → Project Detail → Articles tab
      → Browse articles → Select one
        → Create Pin(s) from article (upload images)
          → Pin Detail page
            → Generate AI Metadata (title, description, alt text)
              → Review/refine metadata (feedback loop)
                → Schedule pin (date + time picker)
                  → Pin moves to "Ready to Schedule" status
```

**Key UX needs:**
- Minimize navigation depth: project → article → pin should feel fluid
- Bulk operations for power users (bulk upload, bulk generate, bulk schedule)
- Status progression should be visible at every level

---

## Flow 3: Calendar Management

**Trigger:** User wants to review/adjust the publishing schedule
**Goal:** Balanced schedule with no gaps or conflicts

```
Calendar (sidebar nav)
  → Filter by project / status
    → Month view: see scheduled pin density
      → Click pin thumbnail → Sidebar detail panel
        → Edit schedule, metadata, or board
    → Switch to "Unscheduled" tab
      → Bulk select unscheduled pins
        → Bulk schedule (date picker)
          → Pins appear on calendar
```

**Key UX needs:**
- Calendar must load fast even with many pins
- Drag-and-drop rescheduling (already implemented)
- Sidebar editing without leaving calendar context
- Filter persistence across navigation

---

## Flow 4: Publishing

**Trigger:** Pins are scheduled and ready
**Goal:** Pins published to Pinterest successfully

```
Calendar or Project Detail
  → View pins with "Ready to Publish" status
    → Publish individual pin (button)
    → OR Bulk publish selected pins
      → Status changes to "Publishing" → "Published"
        → View on Pinterest link appears
```

**Also (automated):**
```
Inngest cron (every 15 min)
  → Find scheduled pins past their publish time
    → Auto-publish to Pinterest
      → Status updates automatically
```

**Key UX needs:**
- Clear publish button state (disabled if no connection or board)
- Tooltips explain why actions are disabled
- Published pins show Pinterest URL for verification

---

## Flow 5: Project Settings & Pinterest Connection

**Trigger:** User needs to connect/manage Pinterest or configure project
**Goal:** Project properly configured with active Pinterest connection

```
Project Detail → Settings tab (or sidebar Settings link)
  → Connect Pinterest Account (OAuth)
    → Select boards for project
      → Configure scraping (frequency, sitemap URL)
        → View connection status (token expiry, board sync)
```

**Key UX needs:**
- Connection status always visible (connected/disconnected indicator)
- Token refresh should be invisible to user (auto-handled)
- Disconnect confirmation with impact warning

---

## Flow 6: Error Recovery

**Trigger:** Pin fails to publish or metadata generation fails
**Goal:** Recover and retry without data loss

```
Dashboard (error count badge) or Calendar (red-bordered pins)
  → Click failed pin
    → View error message
      → Reset status (returns to previous state)
        → Fix issue (reconnect Pinterest, edit metadata)
          → Retry action
```

**Key UX needs:**
- Errors should be visible from dashboard-level (not hidden in detail pages)
- Error recovery should be 1-2 clicks max
- Previous state preserved for undo

---

## Navigation Patterns

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
- Single page (no tabs needed) — metadata, scheduling, publishing all visible

### Breadcrumbs

Every page below Dashboard should show breadcrumb trail:
```
Dashboard / Project Name / Articles / Article Title
Dashboard / Project Name / Pins / Pin #123
Calendar (no breadcrumb — top-level)
Settings (no breadcrumb — top-level)
```

---

## Cross-Cutting Concerns

### Loading States
- Skeleton screens for initial page loads (not spinners)
- Inline loading for actions (button disabled + spinner text)
- Optimistic updates where safe (create operations)

### Empty States
- Every list should have a meaningful empty state with CTA
- Contextual guidance ("No pins yet? Create your first pin from an article.")

### Error States
- Inline errors near the triggering action
- Toast notifications for background operation results
- Error count badges on navigation items

### Responsive Behavior
- **Desktop (1024px+):** Sidebar + main content, full tables and grids
- **Tablet (768-1023px):** Collapsed sidebar (icon mode), simplified tables
- **Mobile (<768px):** Hamburger drawer, stacked layouts, bottom sheet for actions

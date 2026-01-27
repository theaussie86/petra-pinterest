# Phase 2: Blog Project Management - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create and manage multiple blog projects with a dashboard overview. CRUD operations for blog projects (name, URL, RSS URL, scraping frequency). Dashboard displays overview statistics (scheduled, published, pending pin counts). Project detail pages for deeper views. Articles, pins, scraping, and calendar are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Blog project form
- Minimal creation: only name + blog URL required upfront (RSS URL, scraping frequency added later via edit)
- Modal dialog for both create and edit (same modal, pre-filled for edit)
- Inline validation errors shown under each field (red text below invalid fields)

### Project list & navigation
- Cards in a grid layout showing project name, blog URL, and per-project stats (articles, pins scheduled, pins published)
- Dashboard IS the project list — no separate projects page; main authenticated view shows project cards directly
- Clicking a project card navigates to a dedicated project detail page (/projects/:id)

### Dashboard statistics
- Global summary bar at top of dashboard with pin counts by status (scheduled, published, pending) across all projects
- Per-project stats also shown on each card — full picture at both levels
- Stats displayed as zeros in Phase 2 since articles/pins don't exist yet; structure visible, data fills in later
- Stat cards are clickable — clicking filters the view or navigates to a filtered list

### Delete & empty states
- Deletion blocked when project has linked articles/pins (must remove linked data first)
- Simple confirm dialog ("Are you sure?") for projects with no linked data — Cancel/Delete buttons
- Empty state: illustration/icon + "No blog projects yet" message + prominent "Create your first project" CTA button
- Toast notifications for all CRUD feedback (success: "Project created", error: "Failed to save", auto-dismiss)

### Claude's Discretion
- Card grid responsive breakpoints and spacing
- Loading skeleton design
- Toast notification library/implementation
- Project detail page layout and sections
- Exact stat card visual design
- Error state handling for failed data fetches

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches. Key patterns:
- Dashboard-first navigation (project list is the main view)
- Modal-based creation/editing keeps user in context
- Progressive disclosure (minimal create, full edit later)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-blog-project-management*
*Context gathered: 2026-01-27*

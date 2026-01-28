# Phase 4: Pin Management - Context

**Gathered:** 2026-01-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete pin CRUD with image upload and status workflow. Users can create, edit, delete, and bulk-upload pins linked to blog articles. Pins follow a multi-step status workflow. AI metadata generation, date scheduling, calendar display, and publishing are separate phases (5, 6, 7).

</domain>

<decisions>
## Implementation Decisions

### Pin creation flow
- Two entry points: from an article page (article pre-linked) and standalone (user picks article)
- Required at creation: image + article link. Title, description, and board are filled in later.
- Bulk creation: select multiple images at once, all linked to the same article. Each image becomes one pin.
- Creation UX: dialog/modal overlay — consistent with existing project create/edit pattern

### Image handling
- Upload methods: drag-drop zone, clipboard paste, and file picker — all three supported
- Image format: accept any image, show a warning if aspect ratio is not 2:3 (Pinterest recommended 1000x1500px). Do not enforce or crop.
- Bulk upload preview: thumbnail grid showing all uploaded images with option to remove individual ones before confirming
- Upload limits: no client-side limits — rely on Supabase Storage limits

### Status workflow
- Full status list in database from day one: Entwurf → Bereit fur Generierung → Pin generieren → Pin wird generiert → Pin generiert → Metadaten generieren → Metadaten werden generiert → Metadaten erstellt → Bereit zum Planen/Veroffentlichen → Veroffentlicht (plus Fehler, Loschen)
- Phase 4 active statuses: Entwurf, Bereit fur Generierung. Later statuses shown in UI but greyed out / disabled
- Status display: colored badge/chip on pin cards and rows (e.g., green = Bereit, grey = Entwurf, red = Fehler)
- Status transitions: both automatic (e.g., conditions met advances status) and manual (user can explicitly change via dropdown/button)
- Error recovery: show error message, let user reset pin back to the last good state to try again

### Pin list & organization
- Display: toggle between image card grid and table/list view
- Default view: table (more information density, consistent with articles list)
- Filtering: status filter tabs at the top (All / Entwurf / Bereit / Fehler, etc.) — same pattern as articles Active/Archived tabs
- Bulk actions: checkbox selection with bulk delete and bulk status change
- Sorting: client-side sorting (pins are per-project, small datasets)

### Claude's Discretion
- Pin detail page layout and information architecture
- Exact status badge colors
- Table column selection and ordering
- Grid card design and spacing
- Image upload progress indication
- Empty state design for pins list

</decisions>

<specifics>
## Specific Ideas

- Dialog/modal for create matches existing project create/edit pattern in codebase
- Table default view is consistent with articles list — grid view provides the visual Pinterest context when needed
- Status tabs follow the same pattern as articles Active/Archived tabs

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-pin-management*
*Context gathered: 2026-01-28*

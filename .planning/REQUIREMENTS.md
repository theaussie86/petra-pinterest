# Requirements: Petra Pinterest Calendar

**Defined:** 2026-01-26
**Core Value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can sign in with Google OAuth
- [x] **AUTH-02**: User session persists across browser refresh
- [x] **AUTH-03**: Each user's data is isolated via multi-tenant RLS policies

### Blog Projects

- [x] **BLOG-01**: User can create blog projects with name and URL
- [x] **BLOG-02**: User can view list of their blog projects
- [x] **BLOG-03**: User can edit blog project details
- [x] **BLOG-04**: User can delete blog projects
- [x] **BLOG-05**: User can configure blog scraping settings (frequency, RSS URL)

### Blog Articles

- [x] **ARTC-01**: User can view list of scraped articles per blog project
- [x] **ARTC-02**: User can filter articles by blog project
- [x] **ARTC-03**: User can trigger manual blog scrape from the UI
- [x] **ARTC-04**: User can view article detail page with full scraped content
- [x] **ARTC-05**: Articles display title, URL, modification date, and scrape status

### Pins

- [x] **PIN-01**: User can upload pin images linked to a blog article and board
- [x] **PIN-02**: User can set pin title and description manually
- [ ] **PIN-03**: User can trigger AI metadata generation (title/description from article content)
- [x] **PIN-04**: User can bulk upload multiple pins at once
- [x] **PIN-05**: Pins follow status workflow: Entwurf → Bereit für Generierung → Pin generieren → Pin wird generiert → Pin generiert → Metadaten generieren → Metadaten werden generiert → Metadaten erstellt → Bereit zum Planen/Veröffentlichen → Veröffentlicht (+ Fehler, Löschen)
- [ ] **PIN-06**: User can schedule pins to specific date and time
- [x] **PIN-07**: User can edit pin details (image, metadata, schedule, board)
- [x] **PIN-08**: User can delete pins

### Calendar

- [ ] **CAL-01**: User can view scheduled pins on a visual calendar with thumbnails
- [ ] **CAL-02**: User can filter calendar by blog project
- [ ] **CAL-03**: User can filter calendar by pin status (unscheduled, unpublished, etc.)
- [ ] **CAL-04**: User can click a pin to view/edit details in a sidebar panel

### Boards

- [ ] **BRD-01**: User can view Pinterest boards synced via n8n
- [ ] **BRD-02**: Boards are displayed grouped by blog project

### Dashboard

- [x] **DASH-01**: User sees overview stats on dashboard (scheduled count, published count, pending count)

### Migration

- [ ] **MIG-01**: Existing Airtable data (blog projects, articles, pins, boards) migrated to Supabase
- [ ] **MIG-02**: Existing pin images migrated to Supabase Storage

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Calendar Enhancements

- **CAL-10**: User can drag-and-drop pins to reschedule
- **CAL-11**: SmartSchedule suggests optimal posting times based on analytics

### Analytics

- **ANLY-01**: User sees per-pin performance metrics (impressions, clicks, saves)
- **ANLY-02**: User sees board-level analytics
- **ANLY-03**: Analytics data pulled from Pinterest Analytics API

### Pinterest Integration

- **PINT-01**: User can connect Pinterest accounts directly in the app (OAuth)
- **PINT-02**: User can create new Pinterest boards from the app
- **PINT-03**: Pin publishing moves from n8n to in-app

### Content Intelligence

- **CONT-01**: User can generate multiple pin variations from one article
- **CONT-02**: Content recycling for evergreen pins

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Edit scraped article content | Scraping is source of truth; edits would be overwritten |
| Real-time chat/notifications | Not core to scheduling workflow |
| Team collaboration / workspaces | Multi-tenant = separate accounts, not shared workspaces |
| Mobile native app | Web-first; mobile can come later |
| Cross-platform posting (Instagram, etc.) | Pinterest-focused tool |
| Video pin support | Images first; video adds complexity |
| Browser extension | Dashboard workflow is primary |
| Following/unfollowing automation | Against Pinterest TOS |
| Auto-posting without review | Pinterest penalizes as spam |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| BLOG-01 | Phase 2 | Complete |
| BLOG-02 | Phase 2 | Complete |
| BLOG-03 | Phase 2 | Complete |
| BLOG-04 | Phase 2 | Complete |
| BLOG-05 | Phase 2 | Complete |
| DASH-01 | Phase 2 | Complete |
| ARTC-01 | Phase 3 | Complete |
| ARTC-02 | Phase 3 | Complete |
| ARTC-03 | Phase 3 | Complete |
| ARTC-04 | Phase 3 | Complete |
| ARTC-05 | Phase 3 | Complete |
| BRD-01 | Phase 3 | Pending |
| BRD-02 | Phase 3 | Pending |
| PIN-01 | Phase 4 | Complete |
| PIN-02 | Phase 4 | Complete |
| PIN-04 | Phase 4 | Complete |
| PIN-05 | Phase 4 | Complete |
| PIN-07 | Phase 4 | Complete |
| PIN-08 | Phase 4 | Complete |
| PIN-03 | Phase 5 | Pending |
| PIN-06 | Phase 5 | Pending |
| CAL-01 | Phase 6 | Pending |
| CAL-02 | Phase 6 | Pending |
| CAL-03 | Phase 6 | Pending |
| CAL-04 | Phase 6 | Pending |
| MIG-01 | Phase 7 | Pending |
| MIG-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-28 after Phase 4 completion*

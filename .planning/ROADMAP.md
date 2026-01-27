# Roadmap: Petra Pinterest Calendar

## Overview

This roadmap delivers a multi-tenant Pinterest scheduling dashboard that replaces an existing Airtable workflow. The journey begins with secure multi-tenant infrastructure (RLS policies), builds blog project and article management, implements pin creation and AI metadata generation, adds visual calendar scheduling, and concludes with data migration from Airtable. Each phase delivers verifiable user value while building toward feature parity with the existing system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Security** - Multi-tenant auth and database setup with RLS
- [ ] **Phase 2: Blog Project Management** - CRUD for blog projects and dashboard
- [ ] **Phase 3: Blog Scraping & Articles** - Automated blog scraping and article management
- [ ] **Phase 4: Pin Management** - Complete pin CRUD with image upload and status workflow
- [ ] **Phase 5: AI Metadata & Publishing** - AI-powered metadata and scheduling integration
- [ ] **Phase 6: Visual Calendar** - Calendar view with filtering and sidebar editing
- [ ] **Phase 7: Data Migration** - Airtable data migration to Supabase

## Phase Details

### Phase 1: Foundation & Security
**Goal**: Users can securely sign in and access isolated data with proper multi-tenant infrastructure
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can sign in with Google OAuth and session persists across browser refresh
  2. Each user sees only their own data (no data leakage between tenants)
  3. Database has RLS policies enabled on all tables before any production data
  4. User can view empty dashboard after successful authentication
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Initialize TanStack Router project with dependencies
- [x] 01-02-PLAN.md — Create database schema with multi-tenant RLS
- [x] 01-03-PLAN.md — Implement Google OAuth authentication
- [x] 01-04-PLAN.md — Create protected dashboard with empty state
- [ ] 01-05-PLAN.md — Fix auth guard redirect loop (gap closure: separate auth check from profile fetch)

### Phase 2: Blog Project Management
**Goal**: Users can create and manage multiple blog projects with dashboard overview
**Depends on**: Phase 1
**Requirements**: BLOG-01, BLOG-02, BLOG-03, BLOG-04, BLOG-05, DASH-01
**Success Criteria** (what must be TRUE):
  1. User can create blog project with name, URL, and scraping settings
  2. User can view list of all their blog projects
  3. User can edit blog project details (name, URL, RSS URL, scraping frequency)
  4. User can delete blog projects
  5. Dashboard displays overview statistics (scheduled count, published count, pending count)
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 3: Blog Scraping & Articles
**Goal**: Users can automatically scrape blog articles and view synchronized Pinterest boards
**Depends on**: Phase 2
**Requirements**: ARTC-01, ARTC-02, ARTC-03, ARTC-04, ARTC-05, BRD-01, BRD-02
**Success Criteria** (what must be TRUE):
  1. User can view list of scraped articles per blog project with title, URL, date, and status
  2. User can filter articles by blog project
  3. User can trigger manual blog scrape from the UI and see scrape progress
  4. User can view article detail page with full scraped content
  5. User can view Pinterest boards synced via n8n, grouped by blog project
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 4: Pin Management
**Goal**: Users can create, edit, and manage pins with image upload and status workflow
**Depends on**: Phase 3
**Requirements**: PIN-01, PIN-02, PIN-04, PIN-05, PIN-07, PIN-08
**Success Criteria** (what must be TRUE):
  1. User can upload pin images linked to blog article and board
  2. User can set pin title and description manually
  3. User can bulk upload multiple pins at once
  4. Pins follow status workflow: Entwurf → Bereit für Generierung → Pin generieren → Pin wird generiert → Pin generiert → Metadaten generieren → Metadaten werden generiert → Metadaten erstellt → Bereit zum Planen/Veröffentlichen → Veröffentlicht (plus Fehler, Löschen states)
  5. User can edit pin details (image, metadata, schedule, board)
  6. User can delete pins
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 5: AI Metadata & Publishing
**Goal**: Users can generate AI metadata and schedule pins to specific dates/times
**Depends on**: Phase 4
**Requirements**: PIN-03, PIN-06
**Success Criteria** (what must be TRUE):
  1. User can trigger AI metadata generation for pins (title and description from article content)
  2. AI-generated metadata is optimized for Pinterest SEO
  3. User can schedule pins to specific date and time
  4. Pin status automatically progresses through workflow states (Metadaten erstellt → Bereit zum Planen/Veröffentlichen → Veröffentlicht)
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 6: Visual Calendar
**Goal**: Users can view and interact with scheduled pins on a visual calendar interface
**Depends on**: Phase 5
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04
**Success Criteria** (what must be TRUE):
  1. User can view scheduled pins on visual calendar with thumbnails
  2. User can filter calendar by blog project
  3. User can filter calendar by pin status (unscheduled, unpublished, etc.)
  4. User can click a pin to view/edit details in sidebar panel
  5. Calendar performs smoothly with 1000+ scheduled pins
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 7: Data Migration
**Goal**: Existing Airtable data is successfully migrated to Supabase
**Depends on**: Phase 6
**Requirements**: MIG-01, MIG-02
**Success Criteria** (what must be TRUE):
  1. All existing blog projects, articles, pins, and boards migrated from Airtable to Supabase
  2. All existing pin images migrated to Supabase Storage
  3. Airtable formulas converted to equivalent Postgres logic or application logic
  4. Airtable linked records converted to proper foreign key relationships
  5. Data validation confirms 100% migration accuracy (no data loss)
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Security | 4/5 | Gap closure needed | - |
| 2. Blog Project Management | 0/? | Not started | - |
| 3. Blog Scraping & Articles | 0/? | Not started | - |
| 4. Pin Management | 0/? | Not started | - |
| 5. AI Metadata & Publishing | 0/? | Not started | - |
| 6. Visual Calendar | 0/? | Not started | - |
| 7. Data Migration | 0/? | Not started | - |

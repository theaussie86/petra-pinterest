# Roadmap: Petra Pinterest Calendar

## Overview

This roadmap delivers a multi-tenant Pinterest scheduling dashboard that replaces an existing Airtable workflow. The journey begins with secure multi-tenant infrastructure (RLS policies), builds blog project and article management, implements pin creation and AI metadata generation, adds visual calendar scheduling, and concludes with data migration from Airtable. Each phase delivers verifiable user value while building toward feature parity with the existing system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Security** - Multi-tenant auth and database setup with RLS
- [x] **Phase 2: Blog Project Management** - CRUD for blog projects and dashboard
- [x] **Phase 3: Blog Scraping & Articles** - Automated blog scraping and article management (sitemap-first)
- [x] **Phase 4: Pin Management** - Complete pin CRUD with image upload and status workflow
- [x] **Phase 5: AI Metadata & Publishing** - AI-powered metadata and scheduling integration
- [x] **Phase 6: Visual Calendar** - Calendar view with filtering and sidebar editing
- [ ] **Phase 7: Data Migration** - Airtable data migration to Supabase
- [ ] **Phase 9: Consistent UI & Dashboard Layout** - Sidebar navigation, PageLayout standardization, breadcrumbs
- [x] **Phase 8: Pinterest OAuth** - Pinterest OAuth authentication for multi-account publishing

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
- [x] 01-05-PLAN.md — Fix auth guard redirect loop (gap closure: separate auth check from profile fetch)

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
**Plans**: 6 plans

Plans:
- [x] 02-01-PLAN.md — Database migration, form libraries, shadcn/ui components, QueryClient + Toaster setup
- [x] 02-02-PLAN.md — TypeScript types, Supabase API layer, TanStack Query hooks with optimistic updates
- [x] 02-03-PLAN.md — Dashboard UI with project grid, stats bar, create/edit/delete dialogs
- [x] 02-04-PLAN.md — Project detail page with metadata, actions, and future-phase placeholders
- [x] 02-05-PLAN.md — Fix project creation failure: on-demand profile creation for pre-migration users (gap closure)
- [x] 02-06-PLAN.md — Fix post-delete navigation: redirect to dashboard after project deletion from detail page (gap closure)

### Phase 3: Blog Scraping & Articles
**Goal**: Users can automatically scrape blog articles and manage them per blog project
**Depends on**: Phase 2
**Requirements**: ARTC-01, ARTC-02, ARTC-03, ARTC-04, ARTC-05
**Success Criteria** (what must be TRUE):
  1. User can view list of scraped articles per blog project with title, URL, date, and status
  2. User can filter articles by blog project (articles shown per project on detail page)
  3. User can trigger manual blog scrape from the UI and see scrape progress
  4. User can view article detail page with full scraped content
  5. User can manually add an article by URL
  6. User can archive and restore articles (soft delete)
**Plans**: 8 plans

Plans:
- [x] 03-01-PLAN.md — Database schema (blog_articles table + RLS) and scrape Edge Function
- [x] 03-02-PLAN.md — Articles data layer (types, API functions, TanStack Query hooks)
- [x] 03-03-PLAN.md — Articles list UI (sortable table, scrape button, manual add dialog)
- [x] 03-04-PLAN.md — Article detail page with content rendering
- [x] 03-05-PLAN.md — Replace Edge Function with TanStack Start server functions (gap closure: CORS fix — BLOCKED)
- [x] 03-06-PLAN.md — Inngest + Express server for blog scraping (gap closure: replaces Edge Function)
- [x] 03-07-PLAN.md — Wire client API to Express scraping endpoints (superseded by server functions migration)
- [x] 03-08-PLAN.md — Use sitemap.xml instead of RSS for blog article discovery

### Phase 4: Pin Management
**Goal**: Users can create, edit, and manage pins with image upload and status workflow
**Depends on**: Phase 3
**Requirements**: PIN-01, PIN-02, PIN-04, PIN-05, PIN-07, PIN-08
**Success Criteria** (what must be TRUE):
  1. User can upload pin images linked to blog article and board
  2. User can set pin title and description manually
  3. User can bulk upload multiple pins at once
  4. Pins follow status workflow: Entwurf -> Bereit fur Generierung -> Pin generieren -> Pin wird generiert -> Pin generiert -> Metadaten generieren -> Metadaten werden generiert -> Metadaten erstellt -> Bereit zum Planen/Veroffentlichen -> Veroffentlicht (plus Fehler, Loschen states)
  5. User can edit pin details (image, metadata, schedule, board)
  6. User can delete pins
**Plans**: 6 plans

Plans:
- [x] 04-01-PLAN.md — Database schema (pins table, boards table, Supabase Storage bucket, RLS policies)
- [x] 04-02-PLAN.md — TypeScript types, pin status constants, API layer, TanStack Query hooks
- [x] 04-03-PLAN.md — Pin creation dialog with image upload (drag-drop, paste, file picker, bulk)
- [x] 04-04-PLAN.md — Pins list UI (table/grid toggle, status filter tabs, bulk actions)
- [x] 04-05-PLAN.md — Pin detail page, edit dialog, delete dialog, project page integration
- [x] 04-06-PLAN.md — Replace window.confirm() with Dialog confirmations, fix popover backgrounds (gap closure)

### Phase 5: AI Metadata & Publishing
**Goal**: Users can generate AI metadata and schedule pins to specific dates/times
**Depends on**: Phase 4
**Requirements**: PIN-03, PIN-06
**Success Criteria** (what must be TRUE):
  1. User can trigger AI metadata generation for pins (title and description from article content)
  2. AI-generated metadata is optimized for Pinterest SEO
  3. User can schedule pins to specific date and time
  4. Pin status automatically progresses through workflow states (Metadaten erstellt -> Bereit zum Planen/Veroffentlichen -> Veroffentlicht)
**Plans**: 5 plans

Plans:
- [x] 05-01-PLAN.md — Database migration (alt_text, previous_status, pin_metadata_generations) + OpenAI client + prompts
- [x] 05-02-PLAN.md — Server functions (single/feedback/bulk metadata generation) + Inngest pipeline + client hooks
- [x] 05-03-PLAN.md — Metadata generation UI (generate button, history dialog, feedback dialog on pin detail page)
- [x] 05-04-PLAN.md — Scheduling UI (date/time picker with presets, bulk schedule dialog)
- [x] 05-05-PLAN.md — Integration (wire scheduling into detail page, bulk actions in pins list, status updates)

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
**Plans**: 5 plans

Plans:
- [x] 06-01-PLAN.md — Data layer (cross-project pin fetch), calendar route with filters (project dropdown, status chips, URL params), tab toggle, header nav
- [x] 06-02-PLAN.md — Calendar grid component (month/week views, pin thumbnails with status borders, navigation, overflow popovers)
- [x] 06-03-PLAN.md — Pin sidebar (right panel with full editing, scheduling, metadata controls)
- [x] 06-04-PLAN.md — Drag-and-drop rescheduling, unscheduled pins table with bulk scheduling
- [x] 06-05-PLAN.md — Fix board select value mismatch causing sidebar edit failures (gap closure)

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
**Plans**: 5 plans

Plans:
- [ ] 07-01-PLAN.md -- Schema migration (branding fields, storage buckets) + shared migration utilities
- [ ] 07-02-PLAN.md -- Migrate blog projects and articles from Airtable
- [ ] 07-03-PLAN.md -- Migrate boards from Airtable
- [ ] 07-04-PLAN.md -- Migrate pins with image upload to Supabase Storage
- [ ] 07-05-PLAN.md -- Migrate board covers and brand kit files + validation report

### Phase 8: Pinterest OAuth Authentication for Multi-Account Publishing
**Goal**: Users can connect any Pinterest account via OAuth and the app can publish pins on their behalf
**Depends on**: Phase 7
**Requirements**: PINT-01, PINT-02, PINT-03
**Success Criteria** (what must be TRUE):
  1. Any Pinterest user can authorize the app via OAuth 2.0 flow
  2. Access tokens are securely stored per-user in Supabase
  3. Token refresh mechanism handles expired tokens automatically
  4. App can create pins on behalf of any authorized user
  5. Multi-account support verified with at least 2 different Pinterest accounts
**Plans**: 5 plans

Plans:
- [x] 08-01-PLAN.md — Database schema (pinterest_connections, oauth_state_mapping, Vault, pins columns) + Pinterest API v5 client
- [x] 08-02-PLAN.md — OAuth server functions (initiate, exchange, disconnect) + callback route
- [x] 08-03-PLAN.md — Connection UX in project settings (connect/disconnect/status) + board syncing from Pinterest API
- [x] 08-04-PLAN.md — Pin publishing server functions + Inngest crons (auto-publish every 15min, token refresh daily)
- [x] 08-05-PLAN.md — Publishing UI integration (publish button on detail/sidebar/list, bulk publish) + end-to-end verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Security | 5/5 | Complete | 2026-01-27 |
| 2. Blog Project Management | 6/6 | Complete | 2026-01-27 |
| 3. Blog Scraping & Articles | 8/8 | Complete | 2026-01-28 |
| 4. Pin Management | 6/6 | Complete | 2026-01-28 |
| 5. AI Metadata & Publishing | 5/5 | Complete | 2026-01-29 |
| 6. Visual Calendar | 5/5 | Complete | 2026-02-09 |
| 7. Data Migration | 0/5 | Not started | - |
| 8. Pinterest OAuth | 5/5 | Complete | 2026-02-09 |
| 9. Consistent UI & Dashboard Layout | 7/8 | In progress | - |

### Phase 9: Consistent UI & Dashboard Layout

**Goal:** Migrate from top header navigation to sidebar layout, standardize page wrappers with PageLayout + PageHeader components, and eliminate duplicate loading/error state code across all routes
**Depends on:** Phase 8
**Plans:** 8 plans

Plans:
- [x] 09-01-PLAN.md -- Install shadcn/ui Sidebar + Breadcrumb, create shared layout components (LoadingSpinner, ErrorState, PageLayout, PageHeader, AppSidebar)
- [x] 09-02-PLAN.md -- Wire SidebarProvider into _authed.tsx, migrate Dashboard and Calendar to PageLayout
- [x] 09-03-PLAN.md -- Migrate Projects, Pins, Articles detail pages to PageLayout with breadcrumbs, delete Header
- [x] 09-04-PLAN.md -- Visual verification of complete layout migration
- [x] 09-05-PLAN.md -- Fix sidebar layout gaps (content overlap, collapse, trigger visibility, header padding)
- [x] 09-06-PLAN.md -- Fix sidebar overlay, brand name "PinMa", menu alignment (UAT gap closure)
- [x] 09-07-PLAN.md -- Nest article/pin routes under projects with updated breadcrumbs (UAT gap closure)
- [ ] 09-08-PLAN.md -- Fix sidebar header collapse and menu SidebarGroup alignment (UAT gap closure round 2)

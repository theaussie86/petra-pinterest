# Petra Pinterest Calendar

## What This Is

A Pinterest management dashboard for planning and scheduling pins across multiple blog projects. Each blog project connects to its own Pinterest account. Users create pins by uploading images and generating AI metadata, then schedule them on a visual calendar. Replaces an existing Airtable + n8n workflow with a proper web application.

## Core Value

Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can sign up and log in (multi-tenant, separate data per user)
- [ ] User can create, view, edit, and delete blog projects
- [ ] Each blog project links to a blog URL and Pinterest account
- [ ] Blog articles are scraped from each blog project automatically
- [ ] User can view blog articles with title, URL, date, and status
- [ ] User can upload pin images linked to a blog article and board
- [ ] User can trigger AI metadata generation for pins (title, description)
- [ ] Pins have a status workflow: Entwurf → Bereit für Generierung → Pin generieren → Pin wird generiert → Pin generiert → Metadaten generieren → Metadaten werden generiert → Metadaten erstellt → Bereit zum Planen/Veröffentlichen → Veröffentlicht (+ Fehler, Löschen)
- [ ] User can schedule pins to specific dates and times
- [ ] User can view scheduled pins on a calendar with thumbnails
- [ ] Calendar can be filtered by blog project and pin status
- [ ] User can click a pin to view/edit details in a sidebar
- [ ] User can view unscheduled and unpublished pins via filters
- [ ] User can view Pinterest boards (synced via n8n)
- [ ] Pin images are stored in Supabase Storage
- [ ] Existing Airtable data is migrated to Supabase

### Out of Scope

- Pinterest API integration for publishing — stays in n8n for v1
- Pinterest board syncing — stays in n8n for v1
- Drag-and-drop calendar rescheduling — not requested
- Team workspaces / collaboration — separate accounts only
- Mobile app — web only

## Context

**Current system:** Airtable base with n8n workflows handles blog scraping, AI metadata generation, board syncing, and pin publishing. Works but is not customizable, hard to extend, and limited to single user access.

**Migration path:** Dashboard manages all data and handles blog scraping + AI metadata. n8n continues to handle Pinterest publishing and board syncing (communicates with Supabase).

**Data model:**
- Blog Projects: name, URL (1:1 with Pinterest account)
- Blog Articles: title, URL, content, dates, status (belongs to Blog Project)
- Pins: image(s), title, description, schedule datetime, status (links to Blog Article + Board)
- Boards: name, Pinterest ID, cover image (belongs to Blog Project, synced from Pinterest)

**User:** Petra (primary), potentially other bloggers in future (separate accounts, multi-tenant).

## Constraints

- **Tech stack**: TanStack Start with Nitro, Supabase (auth/DB/storage), Tailwind + shadcn/ui, deployed on Vercel
- **n8n dependency**: Pin publishing and board syncing stay in n8n for v1 — app must work with this integration
- **Multi-tenant**: Each user's data is isolated; architecture must support this from day one
- **Feature parity**: Must replicate all current Airtable functionality before Petra can switch

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TanStack Start over Next.js | User preference, modern stack | — Pending |
| Keep n8n for Pinterest API | Pinterest OAuth complexity, don't block v1 | — Pending |
| Keep granular pin statuses | Preserve existing workflow, simplify later if needed | — Pending |
| Blog scraping in-app | Less n8n complexity, better user control | — Pending |
| AI metadata in-app | Direct integration, faster iteration | — Pending |

---
*Last updated: 2026-01-26 after initialization*

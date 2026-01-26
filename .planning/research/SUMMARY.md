# Project Research Summary

**Project:** Petra Pinterest Scheduler
**Domain:** Pinterest scheduling and multi-blog content management
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

This Pinterest scheduling dashboard is a multi-tenant SaaS application requiring coordination between client UI, serverless functions, PostgreSQL with row-level security, external n8n workflows for Pinterest API operations, and background processing for blog scraping and AI content generation. The market is dominated by tools like Tailwind and Later, with table stakes now including bulk scheduling (100+ pins), visual calendar interfaces, and basic analytics. The key differentiator for this project is blog-first workflow with multi-project status tracking.

The recommended approach uses TanStack Start for type-safe full-stack development, Supabase for database/auth/storage with strict row-level security, n8n for Pinterest API integration via webhooks, and TanStack Query for client-side state management. This stack provides end-to-end type safety, serverless deployment compatibility (Vercel), and proven patterns for multi-tenant applications. Schedule-X provides the calendar UI with native shadcn/ui theming, while date-fns handles date manipulation with optimal tree-shaking.

The most critical risks are multi-tenant data leakage through missing RLS policies and Airtable migration complexity with formula/linked record conversion. Prevention requires enabling RLS from day one, denormalizing tenant_id onto every table, implementing defense-in-depth with application-level checks, and budgeting 2-3x expected time for migration work. Additional risks include calendar performance with 1000+ posts (mitigated with virtualization), n8n webhook reliability (improved in January 2026 release), and Pinterest API rate limiting (managed through queue-based processing).

## Key Findings

### Recommended Stack

The modern approach for this type of application uses TanStack Start as a type-safe full-stack framework with Nitro for adapter-less deployment, Supabase for backend-as-a-service with Postgres, and n8n for Pinterest API orchestration. This combination provides end-to-end type safety, proven scalability patterns, and serverless compatibility while avoiding the complexity of building custom backend infrastructure.

**Core technologies:**

- **TanStack Start v1.149.4+**: Full-stack React framework — type-safe server functions, file-based routing, SSR with streaming, client-first philosophy with server capabilities
- **Supabase v2.90.1+**: Backend-as-a-service — Postgres database with RLS, authentication, real-time subscriptions, storage with CDN (285 cities), official TanStack Start integration
- **TanStack Query v5.90.19+**: Server state management — automatic caching, background updates, Suspense support, perfect integration with TanStack Start server functions
- **React Hook Form v7.71.1 + Zod v4.3.5**: Form handling — type-safe validation, no re-renders per keystroke, WCAG accessible, official shadcn/ui pattern
- **Schedule-X (latest)**: Calendar UI — native shadcn/ui theme integration, multiple view modes (day/week/month), event management built-in
- **date-fns v4.1.0**: Date manipulation — tree-shakable (3.63KB for multiple methods vs dayjs 6.64KB), functional approach matches React patterns
- **Sonner (latest)**: Toast notifications — official shadcn/ui recommendation, promise-based toasts for async operations
- **n8n (self-hosted or cloud)**: Pinterest API integration — webhook-based workflow orchestration, handles OAuth and rate limiting, official Pinterest node
- **Supabase Storage**: Image hosting — integrated with auth, RLS policies, global CDN, built-in image transformations (resize, WebP conversion)

**Node.js requirement:** v20+ LTS (Supabase v2.79.0+ dropped Node 18 support)

### Expected Features

Pinterest scheduling tools in 2026 are distinguished by capability tiers: basic schedulers (single-pin, limited queues), professional schedulers (bulk operations, analytics, multi-account), and enterprise schedulers (team workflows, approvals). The market leader Tailwind sets the feature bar with AI-powered posting times, content recycling, and Pinterest-specific optimizations. Users now expect bulk operations, visual calendars, and analytics as baseline.

**Must have (table stakes):**

- Schedule pins up to 30 days ahead — Pinterest native does this, anything less is unacceptable
- Visual calendar interface — users plan visually, calendar view is non-negotiable
- Multiple board selection — users want one pin on 5-10 boards, manual is tedious
- Bulk scheduling (50-100+ pins) — content creators batch-create, one-by-one is dealbreaker
- Edit scheduled pins — inability to edit means delete/recreate hell
- Queue preview — users need to see what's scheduled when
- Image upload — must support local files, not just URLs
- Basic analytics — users need proof of value (impressions, clicks, saves)
- Multi-account support — agencies/bloggers manage 3-10 accounts
- Pinterest API compliance — non-approved tools get accounts banned

**Should have (competitive):**

- AI description generation — save 5-10 min per pin, SEO optimization (Tailwind, Circleboom, BlogToPin all offer)
- SmartSchedule (best time posting) — 7% better performance per Tailwind study
- Bulk CSV upload (500+ pins) — upload months of content in minutes
- Browser extension — create pins while browsing, no context switching
- Multi-pin from URL — one blog post = 5 pins with variations (huge time saver)
- Pin design templates — non-designers create on-brand pins
- Video support — video pins get higher engagement in 2026
- Board analytics — see which boards drive traffic

**Defer (v2+):**

- Content recycling / SmartLoop — evergreen content keeps working (Tailwind proprietary, high complexity)
- Team collaboration + approvals — agencies need client approval (Planable/Gain excel here, 4-level workflows)
- Cross-platform scheduling — one tool for Pinterest + Instagram + Facebook (Later/Buffer position here)
- Pin performance predictions — pre-publish engagement forecasting (AI-driven, high complexity)
- Trend analysis — create content around trending searches (Pinterest Media Planner launched Jan 2026)
- Competitor benchmarking — compare performance against similar accounts

**Unique differentiator for this project:**

- Blog-first workflow — scraping, multi-project tracking, status management (no competitor offers this depth)

### Architecture Approach

This Pinterest scheduling dashboard requires careful coordination between client UI, serverless functions, multi-tenant database architecture, external n8n workflows, and background processing—all within Vercel's serverless constraints. The architecture balances immediate user feedback with deferred background work, maintains strict data isolation per tenant, and handles Pinterest API operations through n8n webhooks.

**Major components:**

1. **Multi-tenant database (Supabase Postgres)** — Shared tables with tenant_id column, RLS policies enforce isolation, denormalized for performance, supports profiles, posts, scraping_jobs, ai_generation_queue, pinterest_boards tables
2. **TanStack Start application layer** — Server functions for type-safe RPC, API routes for webhooks, file-based routing, SSR with streaming, integration with TanStack Query for caching
3. **n8n workflow orchestration** — Bidirectional webhooks (app triggers n8n, n8n callbacks with status), handles Pinterest OAuth and API calls, queue-based processing for rate limiting, error handling and retries
4. **Background processing** — Vercel Cron jobs for AI queue processing (every 5 minutes), blog scraping broken into sub-60s steps, waitUntil for short tasks (< 1 min), monitoring for stuck publishing jobs
5. **Real-time updates (Supabase Broadcast)** — Status changes broadcast to connected clients, tenant-scoped channels with RLS, optimistic UI for user-initiated actions
6. **File storage (Supabase Storage)** — S3-compatible with RLS policies, global CDN with 285 cities, built-in image transformations, client-side compression before upload

**Key architectural patterns:**

- Server functions first: All data operations use createServerFn() for type safety
- RLS always on: Enable row-level security from day one, defense-in-depth with app-level checks
- Vertical organization: Each feature/page contains everything it needs
- Break jobs into steps: Blog scraping and AI generation split into individually retried steps under 60s
- Queue-based processing: AI generation and Pinterest publishing use database queues processed by cron

### Critical Pitfalls

The research identified 15+ pitfalls across framework, database, UI, integration, and migration domains. The top 5 are:

1. **Multi-tenant data leakage through missing RLS** — Supabase auto-generates REST APIs from schema, RLS is opt-in not default, a single missing policy exposes entire database. CVE-2025-48757 affected 170+ apps in 2025. Prevention: Enable RLS on ALL tables before production data, denormalize tenant_id onto every table, implement defense-in-depth, run Supabase Security Advisor, never use service_role key in client code.

2. **Airtable formula/linked record conversion complexity** — Formulas use JavaScript-like syntax with no direct Postgres equivalent, most ETL tools don't support linked records, relationships require manual cardinality mapping. Prevention: Audit all formula fields before migration, document business logic, budget 2-3x expected time, use tools that support linked records (Whalesync), test with small dataset first.

3. **Calendar performance with large datasets** — Rendering 1000+ events overwhelms DOM, complex date calculations per render, no virtualization causes UI freeze. Prevention: Use virtualization library (Bryntum/Syncfusion), implement date range loading (not all data at once), leverage React 18 concurrent features, offload computations to Web Workers, optimize TanStack Query cache.

4. **TanStack Start hydration errors** — Server-rendered HTML doesn't match client hydration, causes console errors and UI glitches. Common causes: Date.now()/Intl without sync, random IDs that differ, browser APIs called during SSR. Prevention: Pick deterministic locale/timezone on server, use cookies not localStorage during SSR, implement environment detection, use error boundaries.

5. **n8n webhook reliability issues** — Workflows return 500 on execution failure, missing responses leave client hanging, self-hosted instances have config issues. Prevention: Configure WEBHOOK_URL correctly, implement error handling in all workflow paths, always include "Respond to Webhook" node, keep n8n updated (January 2026+ for bug fixes), test in staging.

**Additional high-severity pitfalls:**

- RLS performance degradation (100x slower without indexes on tenant_id/user_id)
- Server function insecurity (exposing secrets by misunderstanding loader execution model)
- Pinterest API rate limiting (100 calls/second universal limit, ~1000/hour unofficial)
- TanStack Query cache invalidation bugs (manual invalidation error-prone, use generated keys)
- Supabase Storage image upload issues (10MB+ images hit limits, transformation costs on Pro plan)

## Implications for Roadmap

Based on research, suggested phase structure emphasizes security-first foundation, followed by core scheduling features, then integration with Pinterest/n8n, and finally migration tooling. This order prevents data leakage risks, establishes proven patterns early, and defers high-complexity features until foundation is solid.

### Phase 1: Foundation & Security
**Rationale:** Multi-tenant security is CRITICAL and must be established before any production data. RLS policies, auth flow, and basic CRUD with proper testing prevent CVE-class vulnerabilities.

**Delivers:**
- Database schema with migrations
- RLS policies on all tables (profiles, posts, scraping_jobs, ai_generation_queue, pinterest_boards)
- Supabase client setup with type generation
- Auth flow (login/signup) with Supabase Auth
- Project file structure following TanStack Start conventions
- User can sign up, log in, see empty dashboard

**Addresses (from FEATURES.md):**
- Multi-account support foundation
- Pinterest API compliance (proper auth setup)

**Avoids (from PITFALLS.md):**
- Multi-tenant data leakage (CRITICAL)
- Server function insecurity (CRITICAL)
- Authentication integration complexity (MODERATE)

**Research flag:** Needs phase-specific research for Supabase Auth + TanStack Start integration patterns (JWT signing, session management, middleware setup).

---

### Phase 2: Core Scheduling CRUD
**Rationale:** Establishes basic scheduling functionality with proper validation and type safety. This phase validates the architecture and provides immediate value (matches Pinterest native scheduler + multi-account).

**Delivers:**
- Post model with server functions (create, read, update, delete)
- Post form UI with React Hook Form + Zod validation
- Post list view with status filters
- Edit/delete scheduled pins
- Queue preview (list view of pending posts)
- Board selection UI (multi-select for cross-posting)

**Addresses (from FEATURES.md):**
- Edit scheduled pins (table stakes)
- Queue preview (table stakes)
- Multiple board selection (table stakes)

**Uses (from STACK.md):**
- TanStack Start server functions for type-safe RPC
- React Hook Form + Zod for form validation
- TanStack Query for client-side caching
- shadcn/ui components (form, select, button)

**Implements (from ARCHITECTURE.md):**
- Post CRUD with RLS enforcement
- Server functions pattern
- Vertical organization (each page contains needed components)

**Avoids (from PITFALLS.md):**
- TanStack Query cache invalidation bugs (establish generated key pattern)

**Research flag:** Standard CRUD patterns, unlikely to need additional research.

---

### Phase 3: Visual Calendar & Scheduling
**Rationale:** Visual calendar is non-negotiable table stakes feature. Requires performance testing with large datasets and library evaluation. Calendar UI enables bulk operations and improves UX significantly.

**Delivers:**
- Calendar component with Schedule-X + shadcn theme
- Drag-and-drop scheduling (date/time changes)
- Date/time picker integration (react-day-picker)
- Month/week/day views
- Optimistic UI updates for immediate feedback
- Performance testing with 1000+ posts

**Addresses (from FEATURES.md):**
- Visual calendar interface (table stakes)
- Schedule pins up to 30 days ahead (table stakes)

**Uses (from STACK.md):**
- Schedule-X for calendar UI
- react-day-picker for date selection
- date-fns for date manipulation
- dnd-kit for drag-and-drop (if needed beyond Schedule-X)

**Implements (from ARCHITECTURE.md):**
- Date range loading (not all data at once)
- TanStack Query caching strategy
- Real-time updates via Supabase Broadcast

**Avoids (from PITFALLS.md):**
- Calendar performance issues with large datasets (CRITICAL)
- Image gallery drag-and-drop performance (MODERATE)

**Research flag:** NEEDS phase-specific research for calendar library evaluation (Schedule-X vs alternatives), performance benchmarking, dnd-kit integration patterns.

---

### Phase 4: Image Upload & Storage
**Rationale:** Image handling can be developed in parallel with calendar. Supabase Storage provides integrated solution with RLS policies. Client-side compression prevents upload issues.

**Delivers:**
- Supabase Storage bucket setup with RLS policies
- File upload UI component with drag-and-drop
- Server function for image upload
- Image preview with transformations
- Client-side compression before upload (browser-image-compression)
- Thumbnail generation via Supabase transformations

**Addresses (from FEATURES.md):**
- Image upload (table stakes)

**Uses (from STACK.md):**
- Supabase Storage with S3 compatibility
- Global CDN serving (285 cities)
- Built-in image transformations

**Implements (from ARCHITECTURE.md):**
- Storage bucket configuration with RLS
- File upload pattern with tenant_id folder structure
- Image optimization strategy

**Avoids (from PITFALLS.md):**
- Supabase Storage image upload issues (MODERATE)
- Image gallery performance issues (use thumbnails)

**Research flag:** Standard Supabase Storage patterns, unlikely to need additional research.

---

### Phase 5: n8n Integration & Publishing
**Rationale:** Pinterest API operations handled by n8n via webhooks. This phase enables actual publishing functionality. January 2026 n8n updates improve webhook reliability.

**Delivers:**
- n8n webhook trigger endpoint (app → n8n)
- n8n callback handler (n8n → app)
- Post status state machine (draft → scheduled → publishing → published/failed)
- Error handling + retry logic
- n8n workflow setup (Pinterest OAuth, pin creation, error handling)
- Polling fallback for stuck publishing jobs (Vercel Cron)

**Addresses (from FEATURES.md):**
- Pinterest API compliance (table stakes)
- Actual pin publishing to Pinterest

**Uses (from STACK.md):**
- n8n for workflow orchestration
- Bidirectional webhooks
- Supabase Broadcast for status updates

**Implements (from ARCHITECTURE.md):**
- n8n communication patterns (trigger + callback)
- Background job monitoring (Vercel Cron)
- Real-time status updates

**Avoids (from PITFALLS.md):**
- n8n webhook reliability issues (MODERATE)
- Pinterest API rate limiting (MODERATE)
- n8n to TanStack Start communication issues (MODERATE)

**Research flag:** NEEDS phase-specific research for Pinterest OAuth flow UX, n8n workflow patterns, error handling strategies, rate limit management.

---

### Phase 6: Bulk Operations
**Rationale:** Bulk scheduling is table stakes for professional use. CSV upload enables managing months of content efficiently. Builds on established calendar and publishing infrastructure.

**Delivers:**
- CSV bulk upload UI (100+ pins)
- CSV parsing and validation
- Batch post creation with queue
- Progress tracking UI
- Error handling for failed rows
- CSV template download

**Addresses (from FEATURES.md):**
- Bulk scheduling (100+ pins) (table stakes)

**Uses (from STACK.md):**
- Zod for CSV validation
- TanStack Query for optimistic updates
- Sonner for progress toasts

**Implements (from ARCHITECTURE.md):**
- Break jobs into steps (under 60s Vercel limit)
- Queue-based processing
- Background job pattern

**Avoids (from PITFALLS.md):**
- Vercel timeout for large uploads (break into batches)
- Over-scheduling spam detection (add validation warnings)

**Research flag:** Standard CSV parsing patterns, unlikely to need additional research.

---

### Phase 7: Blog Scraping
**Rationale:** Unique differentiator for multi-blog use case. Enables automatic content import from blog posts. Requires careful timeout management within Vercel constraints.

**Delivers:**
- Scraping job model and UI
- Blog parser (Cheerio for HTML parsing)
- Job status tracking (pending → processing → completed/failed)
- Scraping API route (synchronous < 60s)
- Error handling for various blog platforms
- Posts created in draft status

**Addresses (from FEATURES.md):**
- Blog scraping integration (unique differentiator)
- Multi-pin from URL (should-have)

**Uses (from STACK.md):**
- Cheerio for HTML parsing
- TanStack Query for job status polling
- Supabase for scraping_jobs table

**Implements (from ARCHITECTURE.md):**
- Scraping job broken into steps
- Background processing pattern
- Job queue management

**Avoids (from PITFALLS.md):**
- Vercel timeout for scraping large blogs (limit to X posts, paginate)

**Research flag:** NEEDS phase-specific research for blog platform HTML structures, error handling edge cases, image extraction strategies.

---

### Phase 8: AI Metadata Generation
**Rationale:** High-value differentiator with low dependency complexity. Can be added anytime but deferred until core features stable. Automates tedious description writing.

**Delivers:**
- OpenAI integration (or Claude/Gemini)
- AI generation queue model
- Vercel Cron job for queue processing (every 5 minutes)
- Prompt engineering for Pinterest-optimized descriptions
- UI for regenerating metadata
- Batch generation for scraped posts

**Addresses (from FEATURES.md):**
- AI description generation (should-have, competitive)
- SEO optimization

**Uses (from STACK.md):**
- OpenAI SDK or alternative
- Zod for prompt/response validation
- Supabase for ai_generation_queue

**Implements (from ARCHITECTURE.md):**
- Queue + Cron processing pattern
- Exponential backoff for retries
- Rate limiting awareness

**Avoids (from PITFALLS.md):**
- OpenAI API rate limits (queue with backoff)
- Vercel timeout (process 10 at a time)

**Research flag:** NEEDS phase-specific research for prompt engineering, AI API comparison (OpenAI vs Claude vs Gemini), quality testing.

---

### Phase 9: Analytics Dashboard
**Rationale:** Basic analytics is table stakes. Pinterest Analytics API integration provides proof of value. Users need to see what's working.

**Delivers:**
- Pinterest Analytics API integration
- Basic analytics dashboard (impressions, clicks, saves per pin)
- Board performance metrics
- Date range filtering
- Export to CSV

**Addresses (from FEATURES.md):**
- Basic analytics (table stakes)
- Board analytics (should-have)

**Uses (from STACK.md):**
- TanStack Query for caching analytics data
- shadcn/ui charts or alternative
- date-fns for date range handling

**Implements (from ARCHITECTURE.md):**
- Analytics data caching (24-48hr lag from Pinterest)
- Separate analytics server functions

**Avoids (from PITFALLS.md):**
- Pinterest API rate limiting (cache analytics data heavily)

**Research flag:** Standard analytics dashboard patterns, Pinterest Analytics API well-documented.

---

### Phase 10: Real-Time Updates
**Rationale:** Enhances UX for status changes (publishing → published). Can be developed alongside other phases. Supabase Broadcast provides scalable solution.

**Delivers:**
- Supabase Realtime setup
- Broadcast channel implementation (tenant-scoped)
- Frontend subscription logic
- RLS policies for broadcasts
- Status change notifications

**Addresses (from FEATURES.md):**
- Improved UX for multi-user scenarios

**Uses (from STACK.md):**
- Supabase Realtime Broadcast
- TanStack Query invalidation on broadcasts

**Implements (from ARCHITECTURE.md):**
- Real-time status updates
- Tenant-scoped channels
- Optimistic UI + real-time sync

**Avoids (from PITFALLS.md):**
- Supabase Realtime cost (monitor usage)

**Research flag:** Standard Supabase Realtime patterns, unlikely to need additional research.

---

### Phase 11: Airtable Migration Tooling
**Rationale:** Enables migration from existing Airtable setup. High complexity due to formula conversion and linked records. Should be separate phase after core features stable.

**Delivers:**
- Airtable data extraction tool
- Formula conversion mapping
- Linked record relationship mapping
- Automation recreation (Postgres triggers, Edge Functions, n8n workflows)
- Schema redesign for relational database
- Migration validation and testing

**Addresses (from FEATURES.md):**
- Migration from existing Airtable system

**Uses (from STACK.md):**
- Whalesync or n8n for migration
- Supabase Foreign Data Wrappers (one-time only)

**Implements (from ARCHITECTURE.md):**
- One-time migration scripts
- Data validation post-migration

**Avoids (from PITFALLS.md):**
- Formula field conversion complexity (CRITICAL)
- Linked records to foreign keys (CRITICAL)
- Automation loss during migration (MODERATE)
- Schema design mistakes (MODERATE)
- Query performance with Foreign Data Wrappers (MODERATE)
- Technical complexity underestimation (MODERATE)

**Research flag:** NEEDS extensive phase-specific research for Airtable formula mapping, linked record conversion strategies, migration tool evaluation (Whalesync vs custom), testing with real Airtable data.

---

### Phase 12: Polish & Production Readiness
**Rationale:** Final phase before launch. Ensures production-quality UX and handles edge cases.

**Delivers:**
- Error boundaries throughout app
- Loading states with skeletons
- Empty states for all views
- Toast notifications (Sonner) for all actions
- Mobile responsiveness (Tailwind)
- Monitoring and logging
- Performance optimization

**Addresses (from FEATURES.md):**
- Production-ready UX

**Uses (from STACK.md):**
- Sonner for toasts
- shadcn/ui components for consistent UX
- React Suspense for loading states

**Avoids (from PITFALLS.md):**
- Set-and-forget mentality (analytics prompts, review reminders)
- Technical content quality issues (validation before publish)

**Research flag:** Standard production polish, unlikely to need additional research.

---

### Phase Ordering Rationale

**Security first:** Phase 1 establishes multi-tenant RLS before any production data, preventing CVE-class data leakage vulnerabilities identified in research.

**Core features early:** Phases 2-4 (CRUD, calendar, images) provide immediate value and validate architecture, matching Pinterest native functionality plus multi-account differentiator.

**Integration deferred:** Phase 5 (n8n/Pinterest) requires stable foundation and benefits from January 2026 webhook reliability improvements in n8n.

**Unique differentiators mid-term:** Phases 7-8 (blog scraping, AI) provide competitive advantage but depend on core infrastructure being solid.

**Migration last:** Phase 11 (Airtable) is highest complexity, requires working system for validation, and benefits from all patterns being established.

**Dependencies respected:**
- Calendar (Phase 3) depends on CRUD (Phase 2) for post data
- n8n integration (Phase 5) depends on CRUD (Phase 2) for post status
- Blog scraping (Phase 7) depends on CRUD (Phase 2) for creating posts
- AI generation (Phase 8) depends on CRUD (Phase 2) for modifying posts
- Analytics (Phase 9) depends on n8n integration (Phase 5) for published posts
- Migration (Phase 11) depends on all features being implemented

**Pitfalls avoided by ordering:**
- RLS policies established before data (prevents leakage)
- Performance patterns validated with calendar (prevents late refactoring)
- n8n reliability tested before bulk operations (prevents publishing failures)
- Migration deferred until system proven (prevents wasted effort)

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 1 (Foundation & Security):** Supabase Auth + TanStack Start integration patterns unclear (JWT signing key transition, session management in server functions, middleware setup). Official docs exist but TanStack Start examples limited.

- **Phase 3 (Visual Calendar):** Library evaluation and performance testing required (Schedule-X vs Bryntum vs Syncfusion), dnd-kit integration patterns, virtualization strategies for 1000+ events, drag-and-drop UX with calendar.

- **Phase 5 (n8n Integration):** Pinterest OAuth flow UX and token refresh rotation unclear, n8n workflow error handling patterns, webhook authentication strategies (API key vs HMAC), rate limit queue implementation.

- **Phase 7 (Blog Scraping):** Blog platform HTML structures vary widely (WordPress, Webflow, Ghost, custom), image extraction edge cases, handling paywalls and dynamic content, Cheerio vs Puppeteer tradeoffs.

- **Phase 8 (AI Metadata):** Prompt engineering for Pinterest-optimized descriptions needs testing, AI API comparison (OpenAI vs Claude vs Gemini for SEO content), quality validation strategies.

- **Phase 11 (Airtable Migration):** Extensive research needed for formula conversion mapping, linked record relationship cardinality, Whalesync vs n8n vs custom script evaluation, testing with real Airtable data structure.

**Phases with standard patterns (skip research-phase):**

- **Phase 2 (Core Scheduling CRUD):** Well-documented CRUD patterns with TanStack Start server functions, React Hook Form + Zod is official shadcn pattern, standard Supabase queries.

- **Phase 4 (Image Upload):** Supabase Storage documentation thorough, browser-image-compression library proven, RLS policies for storage well-documented.

- **Phase 6 (Bulk Operations):** CSV parsing with Papa Parse or similar is standard, Zod validation patterns established, batch processing straightforward.

- **Phase 9 (Analytics):** Pinterest Analytics API well-documented, dashboard patterns standard, TanStack Query caching established.

- **Phase 10 (Real-Time Updates):** Supabase Realtime Broadcast documentation comprehensive, tenant-scoped channels pattern clear, React subscription patterns standard.

- **Phase 12 (Polish):** Production polish best practices well-established, error boundaries documented, loading states with Suspense standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | TanStack Start official docs current (v1.149.4), Supabase integration verified (v2.90.1), all packages recent (verified Jan 2026), proven patterns |
| Features | HIGH | Consistent across multiple competitor tools (Tailwind, Later, Planoly), table stakes verified in Pinterest native scheduler, market leader features clear |
| Architecture | MEDIUM-HIGH | Multi-tenant RLS patterns well-documented (AWS, Supabase guides), n8n webhook patterns official but TanStack Start integration examples limited, Vercel serverless constraints clear |
| Pitfalls | HIGH | Multi-tenant leakage confirmed by CVE-2025-48757 (170+ apps), hydration errors in official TanStack docs, Airtable migration issues verified in community, n8n January 2026 release notes confirm fixes |

**Overall confidence:** HIGH

Research based on official documentation for framework (TanStack Start, Supabase, n8n, Pinterest API), recent release notes (verified January 2026 versions), real-world vulnerabilities (CVE reports), community consensus (migration challenges), and competitor feature analysis (5+ tools compared).

### Gaps to Address

**During planning/execution:**

1. **Supabase Auth + TanStack Start specifics:** Official Supabase quickstart exists but session management patterns in server functions need validation. Test with prototype in Phase 1. Alternative: Consider WorkOS or Clerk if Supabase Auth integration proves complex.

2. **Calendar library final choice:** Schedule-X recommended based on shadcn theming, but performance with 1000+ events needs benchmarking. Bryntum and Syncfusion are paid alternatives with proven performance. Prototype and benchmark in Phase 3.

3. **Pinterest API rate limiting real-world behavior:** Official docs specify 100 calls/second universal limit, but production usage patterns unclear. Monitor in Phase 5, implement conservative queue-based approach.

4. **Airtable migration data structures:** Cannot fully plan conversion without seeing actual Airtable base structure. Audit formulas and linked records before Phase 11, budget 2-3x expected time.

5. **AI prompt engineering for Pinterest:** Quality of AI-generated descriptions for Pinterest SEO unclear. Needs testing in Phase 8 with real blog content and Pinterest performance validation.

6. **n8n webhook authentication:** API key vs HMAC signature tradeoff unclear. Research in Phase 5 based on security requirements and n8n capabilities.

7. **Vercel Cron reliability:** Cron jobs are best-effort, not guaranteed. May need external queue service (Inngest, Trigger.dev) if reliability issues in production. Monitor in Phases 6-8.

**Validation priorities:**

- **Phase 1:** Auth integration patterns (block if complex)
- **Phase 3:** Calendar performance with large datasets (block if requires architecture change)
- **Phase 5:** n8n webhook reliability in production (monitor, fallback patterns ready)
- **Phase 11:** Airtable formula complexity (may require custom logic, not automated conversion)

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [TanStack Start Documentation](https://tanstack.com/start/latest) — Server functions, hydration, code execution patterns, routing
- [Supabase Documentation](https://supabase.com/docs) — RLS best practices, Storage, Realtime, Auth, multi-tenant patterns
- [n8n Documentation](https://docs.n8n.io) — Webhook node, Respond to Webhook, error handling, integrations
- [Pinterest API Developer Guide](https://developers.pinterest.com/docs/api/v5/) — Rate limits, endpoints, OAuth, scheduling

**Package Registries (version verification):**
- [@tanstack/react-start npm](https://www.npmjs.com/package/@tanstack/react-start) — v1.149.4 published Jan 26, 2026
- [@supabase/supabase-js npm](https://www.npmjs.com/package/@supabase/supabase-js) — v2.90.1 published Jan 16, 2026
- [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query) — v5.90.19 published Jan 25, 2026
- [react-hook-form npm](https://www.npmjs.com/package/react-hook-form) — v7.71.1 published Jan 21, 2026
- [zod npm](https://www.npmjs.com/package/zod) — v4.3.5 published Jan 11, 2026
- [react-day-picker npm](https://www.npmjs.com/package/react-day-picker) — v9.13.0 published Dec 2025

### Secondary (MEDIUM-HIGH confidence)

**Security & Best Practices:**
- [Supabase Security Flaw: 170+ Apps Exposed by Missing RLS](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/) — CVE-2025-48757 details, real-world impact
- [Multi-Tenant Applications with RLS on Supabase](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) — Shared schema pattern, RLS policies, performance
- [Designing Your Postgres Database for Multi-tenancy | Crunchy Data](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy) — Multi-tenant strategies comparison
- [Top 5 authentication solutions for secure TanStack Start apps in 2026](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026) — Auth provider comparison, security checklist
- [How to protect server functions with auth middleware in TanStack Start](https://dev.to/hirotoshioi/how-to-protect-server-functions-with-auth-middleware-in-tanstack-start-opj) — Middleware patterns

**TanStack Start Patterns:**
- [TanStack Start Best Practices 2026](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026) — Vertical organization, avoiding premature abstraction
- [Building Full-Stack App with TanStack Start](https://blog.logrocket.com/full-stack-app-with-tanstack-start/) — Project structure, server functions, API routes
- [TanStack Start: Catch Bugs Before Your Users Do](https://ruintheextinct.medium.com/tanstack-start-catch-bugs-before-your-users-do-530e66155ec4) — Hydration errors, debugging

**Performance & UI:**
- [React FullCalendar vs Big Calendar - Bryntum](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/) — Calendar library comparison, performance benchmarks
- [How To Render Large Datasets In React without Killing Performance](https://www.syncfusion.com/blogs/post/render-large-datasets-in-react) — Virtualization strategies, React 18 concurrent features
- [Top 5 Drag-and-Drop Libraries for React in 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) — dnd-kit recommendation (10kb, zero deps)
- [React Scheduler: Large Datasets and Performance](https://code.daypilot.org/88405/react-scheduler-large-datasets-and-performance) — Performance optimization techniques

**n8n Integration:**
- [n8n Release Notes - January 2026 Latest Updates](https://releasebot.io/updates/n8n) — Queue mode 500 error fix, webhook improvements
- [Fixing n8n Webhook Problems: Complete Troubleshooting Guide](https://blog.tamertemel.net/2025/09/25/fixing-n8n-webhook-problems-the-complete-troubleshooting-guide-for-self-hosted-instances/) — WEBHOOK_URL configuration, error patterns
- [Why n8n Webhooks Fail in Production: Fix Them Now](https://prosperasoft.com/blog/automation-tools/n8n/n8n-webhook-failures-production/) — Production reliability patterns

**Pinterest API & Scheduling:**
- [Pinterest API 2026: Complete Developer Documentation](https://getlate.dev/blog/pinterest-api) — Rate limits, OAuth flow, best practices
- [Schedule Pinterest Pins via API](https://getlate.dev/blog/schedule-pinterest-pins-via-api) — Scheduling patterns, API examples
- [What is the Rate Limit for Pinterest API?](https://medium.com/@jasoon_10023/what-is-the-rate-limit-for-pinterest-api-insights-guidelines-4557cdf870ed) — Rate limit details, category limits

**Airtable Migration:**
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups) — Formula conversion, automation loss, technical complexity
- [Moving from Airtable to Xano or Supabase - who has done it?](https://community.softr.io/t/moving-from-airtable-to-xano-or-supabase-who-has-done-it/10913) — Community experience, linked records challenge
- [Syncing Airtable to PostgreSQL with ETL](https://community.airtable.com/development-apis-11/syncing-airtable-to-a-postgresql-database-with-an-etl-solution-like-estuary-airrtable-as-a-backend-4794) — ETL tool limitations

**Image Optimization:**
- [Client-side image compression with Supabase Storage](https://mikeesto.com/posts/supabaseimagecompression/) — browser-image-compression integration
- [How I Reduced Supabase Storage Image Transformed by 48%](https://medium.com/@muhaimincs/how-i-reduced-supabase-storage-image-transformed-by-48-8ff0949eaa7) — Optimization case study, Smart CDN

### Tertiary (MEDIUM confidence, competitor analysis)

**Pinterest Scheduling Tools:**
- [The Best Pinterest Scheduling Tools in 2025 (Ranked & Reviewed)](https://www.tailwindapp.com/blog/best-pinterest-scheduling-tools) — Feature comparison, Tailwind positioning
- [I Tested Pinterest Approved Schedulers So You Don't Have To](https://heatherfarris.com/pinterest-approved-schedulers/) — User testing, tool capabilities
- [Best Pinterest Scheduler Tools 2026](https://socialrails.com/blog/best-pinterest-scheduler-tools-guide) — Market analysis, pricing
- [How to Schedule Pinterest Posts in 2026 for Maximum Traffic](https://www.socialchamp.com/blog/schedule-pinterest-posts/) — Best practices, timing strategies

**Pinterest Marketing Best Practices:**
- [Pinterest Tips That Actually Work in 2026](https://jenvazquez.com/pinterest-tips-that-actually-work-in-2026-and-what-to-stop-doing/) — Anti-patterns (watermarks, over-pinning)
- [Pinterest algorithm: How it actually works in 2026](https://www.outfy.com/blog/pinterest-algorithm/) — Spam detection, consistency over frequency
- [Best Practices for Scheduling Your Pins on Pinterest](https://meaganwilliamson.com/best-practices-for-scheduling-your-pins-on-pinterest/) — Scheduling strategy, common mistakes

**UI Component Libraries:**
- [Schedule-X with Shadcn Theme](https://dev.to/tomosterlund/event-calendar-with-shadcn-theme-l8k) — Setup guide, theming
- [shadcn/ui Components](https://ui.shadcn.com/docs/components) — Form, calendar, sonner documentation
- [React Hook Form with shadcn](https://ui.shadcn.com/docs/forms/react-hook-form) — Integration patterns

---

*Research completed: 2026-01-26*
*Ready for roadmap: Yes*

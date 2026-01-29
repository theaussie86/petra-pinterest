---
phase: 05-ai-metadata-publishing
plan: 01
subsystem: database, ai
tags: openai, gpt-4o, vision, postgres, supabase, metadata-generation

# Dependency graph
requires:
  - phase: 04-pin-management
    provides: pins table schema, Pin type definitions
provides:
  - Database schema for AI metadata generation (alt_text, previous_status, pin_metadata_generations table)
  - OpenAI GPT-4o client with vision support for multimodal metadata generation
  - Pinterest SEO system prompt with character limits (title 100, description 220-232, alt 125)
  - Pin type updates with alt_text, previous_status, and PinMetadataGeneration interface
affects: [05-02-metadata-ui, 05-03-scheduling, metadata-generation, pin-workflow]

# Tech tracking
tech-stack:
  added: [openai@6.1.0+]
  patterns: [OpenAI multimodal vision with article + image input, trigger-based previous_status tracking, generation history with feedback loop]

key-files:
  created:
    - supabase/migrations/00006_metadata_generation.sql
    - src/lib/openai/client.ts
    - src/lib/openai/prompts.ts
  modified:
    - src/types/pins.ts
    - .env.example

key-decisions:
  - "Use GPT-4o with detail: 'auto' for cost-efficient vision analysis"
  - "Truncate article content to 4000 chars (~1000 tokens) to manage API costs"
  - "Track previous_status via database trigger for error recovery 'Reset to previous state'"
  - "Store generation history in separate pin_metadata_generations table (retention managed in app layer)"

patterns-established:
  - "OpenAI vision pattern: content array with type: 'text' and type: 'image_url' objects"
  - "Pinterest SEO constraints encoded in system prompt (100/220-232/125 char limits)"
  - "Generation history with feedback field (null for first generation, text for regenerations)"

# Metrics
duration: 2.5min
completed: 2026-01-29
---

# Phase 5 Plan 1: AI Metadata Generation Foundation Summary

**OpenAI GPT-4o vision client with Pinterest SEO prompt, database schema for metadata generation history, and Pin type updates for alt_text and error recovery**

## Performance

- **Duration:** 2min 31s
- **Started:** 2026-01-29T07:50:17Z
- **Completed:** 2026-01-29T07:52:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Database schema extended with alt_text, previous_status columns on pins table and pin_metadata_generations history table with RLS policies
- OpenAI client singleton configured with generatePinMetadata function supporting vision-enabled multimodal input (article text + pin image)
- Pinterest SEO system prompt defined with character limits (title 100, description 220-232 with CTA, alt text 125)
- Pin types updated with alt_text, previous_status, scheduled_at, and PinMetadataGeneration interface

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration for metadata generation** - `26aa1d3` (feat)
2. **Task 2: OpenAI client, prompts, and type updates** - `87a119b` (feat)

## Files Created/Modified

### Created
- `supabase/migrations/00006_metadata_generation.sql` - Adds alt_text and previous_status columns to pins table, creates pin_metadata_generations table with RLS, trigger function to track previous status on status changes
- `src/lib/openai/client.ts` - OpenAI singleton instance, generatePinMetadata function with GPT-4o vision multimodal input (article + image), JSON response parsing with validation
- `src/lib/openai/prompts.ts` - PINTEREST_SEO_SYSTEM_PROMPT with Pinterest 2026 SEO best practices (character limits, CTA requirements, keyword placement)

### Modified
- `src/types/pins.ts` - Added alt_text and previous_status to Pin interface, alt_text and scheduled_at to PinUpdate, new PinMetadataGeneration interface for history tracking
- `.env.example` - Added OPENAI_API_KEY under new OpenAI Configuration section
- `package.json` + `package-lock.json` - Added openai@6.1.0+ dependency

## Decisions Made

**1. Use GPT-4o with `detail: 'auto'` for vision input**
- Rationale: Auto mode intelligently selects resolution based on image complexity, cost-efficient for mid-resolution pin images (1000x1500px typical)
- Alternative considered: `detail: 'high'` for maximum quality, but higher cost without proven benefit for Pinterest metadata generation
- Source: OpenAI vision pricing research, "auto" is 2026 default

**2. Truncate article content to 4000 characters (~1000 tokens)**
- Rationale: Full articles can be very long (10k+ chars), leading to high token costs and slower responses. First 4000 chars capture article essence.
- Impact: Reduces input tokens by 50-70% for typical blog posts while maintaining metadata quality (title/description are at top of articles)

**3. Track previous_status via database trigger**
- Rationale: Error recovery "Reset to previous state" button (from CONTEXT.md) needs to know status before error occurred, not always "entwurf"
- Implementation: Trigger function `update_previous_status()` automatically sets `NEW.previous_status = OLD.status` when status changes
- Alternative considered: Track in application layer, but trigger is more reliable and can't be bypassed

**4. Separate pin_metadata_generations table for history**
- Rationale: Enables comparison of previous generations and regeneration with feedback refinement loop
- Retention: Keep last 3 generations per pin (implemented in application layer, not database constraint)
- Alternative considered: JSON column in pins table, but separate table enables cleaner querying and indexing on (pin_id, created_at)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - migration applied successfully, build passed with no TypeScript errors, OpenAI client verified exportable.

## User Setup Required

**External services require manual configuration.**

**OpenAI API Key:**
- Service: OpenAI
- Why: AI metadata generation via GPT-4o with vision
- Steps:
  1. Go to [OpenAI Dashboard](https://platform.openai.com/api-keys)
  2. Create new secret key
  3. Add to `.env.local`: `OPENAI_API_KEY=sk-...`
- Verification: Server functions (Plan 05-02) will fail with auth error if missing

## Next Phase Readiness

**Ready for 05-02 (Metadata Generation UI & Server Functions):**
- ✅ Database schema supports metadata generation history storage
- ✅ OpenAI client ready for import in server functions
- ✅ Pinterest SEO prompt encodes character limits and formatting rules
- ✅ Pin type includes alt_text for metadata and previous_status for error recovery
- ✅ Build passes with no TypeScript errors

**Dependencies satisfied:**
- Pins table exists (04-01)
- Pin type interface established (04-02)
- Image storage and retrieval patterns established (04-02, 04-03)

**No blockers or concerns.**

---
*Phase: 05-ai-metadata-publishing*
*Completed: 2026-01-29*

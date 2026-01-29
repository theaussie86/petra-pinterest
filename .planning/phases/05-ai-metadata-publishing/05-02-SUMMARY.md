---
phase: 05-ai-metadata-publishing
plan: 02
subsystem: api
tags: [openai, tanstack-start, inngest, server-functions, gpt-4o]

# Dependency graph
requires:
  - phase: 05-01
    provides: OpenAI client with generatePinMetadata function and pin_metadata_generations table
provides:
  - Server functions for single/feedback/bulk metadata generation
  - Inngest pipeline for async bulk processing
  - Client API layer for metadata history and restoration
  - TanStack Query hooks for metadata operations
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server functions with cookie auth for single metadata generation
    - Inngest bulk processing with per-pin error handling
    - TanStack Query hooks with toast feedback and invalidation

key-files:
  created:
    - src/lib/server/metadata.ts
    - server/inngest/functions/generate-metadata.ts
    - src/lib/api/metadata.ts
    - src/lib/hooks/use-metadata.ts
  modified:
    - server/inngest/index.ts

key-decisions:
  - "Use createServerFn with cookie auth for single pin generation (synchronous user action)"
  - "Inngest bulk processing handles per-pin errors and continues to next pin"
  - "Auto-prune old generations (keep last 3) in both server function and Inngest"
  - "Feedback regeneration uses conversation messages with previous generation as assistant message"

patterns-established:
  - "Server function error handling: catch errors, update pin status to 'fehler', set error_message, re-throw"
  - "Generation history pruning: query all, keep top 3 by created_at DESC, delete rest using NOT IN"
  - "TanStack Query hooks invalidate both ['pins'] and ['metadata-history'] on mutations"

# Metrics
duration: 2.4min
completed: 2026-01-29
---

# Phase 5 Plan 02: Metadata Generation Pipeline Summary

**Server-side metadata generation pipeline with single/feedback/bulk operations, Inngest async processing, and TanStack Query hooks for UI consumption**

## Performance

- **Duration:** 2.4 min (142 seconds)
- **Started:** 2026-01-29T02:43:06Z
- **Completed:** 2026-01-29T02:45:28Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments
- Single pin metadata generation via server function with OpenAI integration
- Feedback-based regeneration using conversation history with previous generation
- Bulk metadata generation dispatched to Inngest for async processing
- Client API layer for metadata history queries and restoration
- Complete TanStack Query hooks ready for UI integration in Plans 03-05

## Task Commits

Each task was committed atomically:

1. **Task 1: Server functions and Inngest pipeline for metadata generation** - `12ec3c6` (feat)
2. **Task 2: Client API layer and TanStack Query hooks for metadata** - `d9c169a` (feat)

## Files Created/Modified
- `src/lib/server/metadata.ts` - Three server functions: generateMetadataFn (single), generateMetadataWithFeedbackFn (feedback refinement), triggerBulkMetadataFn (async dispatch)
- `server/inngest/functions/generate-metadata.ts` - Inngest bulk metadata pipeline with per-pin error handling
- `server/inngest/index.ts` - Export generateMetadataBulk function
- `src/lib/api/metadata.ts` - Client API for metadata history and restoration
- `src/lib/hooks/use-metadata.ts` - Five TanStack Query hooks for metadata operations

## Decisions Made

**1. Server function error handling pattern**
- Wrap entire handler in try/catch
- On error: update pin status to 'fehler', set error_message, re-throw
- Ensures pin state always reflects current status (processing/success/error)

**2. Feedback regeneration conversation structure**
- System: PINTEREST_SEO_SYSTEM_PROMPT
- User: article content + pin image (multimodal)
- Assistant: previous generation JSON
- User: "Please regenerate the metadata with this feedback: {feedback}"
- Allows OpenAI to understand context and refine based on user input

**3. Generation history pruning strategy**
- Keep last 3 generations per pin
- Prune after every insert (single + bulk)
- Query all generations, keep top 3 by created_at DESC, delete rest using NOT IN clause
- Prevents unbounded growth while preserving refinement history

**4. TanStack Query invalidation scope**
- Invalidate both ['pins'] and ['metadata-history'] on all mutations
- Broad invalidation ensures all dependent UI updates
- Acceptable given small dataset sizes (per-project operations)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all patterns followed existing server function and Inngest conventions from Phase 3.

## User Setup Required

None - no external service configuration required. OpenAI API key already configured in 05-01.

## Next Phase Readiness

**Ready for Plan 03 (Single Pin UI):**
- `useGenerateMetadata()` hook ready for "Generate Metadata" button
- `useGenerateMetadataWithFeedback()` hook ready for feedback dialog
- `useMetadataHistory()` hook ready for history comparison UI
- `useRestoreMetadataGeneration()` hook ready for "Restore" action

**Ready for Plan 04 (Bulk UI):**
- `useTriggerBulkMetadata()` hook ready for bulk action toolbar button
- Async processing via Inngest (users don't wait for completion)

**No blockers.** All backend plumbing complete. Plans 03-05 are pure UI integration.

---
*Phase: 05-ai-metadata-publishing*
*Completed: 2026-01-29*

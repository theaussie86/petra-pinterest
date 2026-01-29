# Phase 5: AI Metadata & Publishing - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

AI-powered pin metadata generation (title, description, alt text) from article content + pin image, and scheduling pins to specific dates/times with automatic status workflow progression. Pinterest publishing itself stays in n8n — this phase handles metadata generation and scheduling within the app.

</domain>

<decisions>
## Implementation Decisions

### AI Generation Trigger & Flow
- Both single-pin and bulk generation supported
- Single pin: "Generate metadata" button on pin detail page
- Bulk: Select multiple pins from pins list, trigger via bulk action
- AI provider: OpenAI Chat Completions with system prompt (replicate existing n8n prompt)
- Input: Article content (title, body) + pin image (multimodal)
- Generates three fields per pin: title, description, alt_text
- Bulk processing runs as an Inngest pipeline, pins queued sequentially
- During generation: pin status changes to "Metadaten werden generiert", toast confirms processing
- alt_text column needs to be added to pins table schema

### Metadata Output & Editing
- Generated values auto-fill directly into pin fields (title, description, alt_text) — no review step
- Regeneration supported with history: keeps last 3 generations per pin
- User can compare previous generations and pick the best one
- Regeneration includes feedback: dialog with text input (e.g., "make it shorter", "focus on baking keywords") before regenerating
- Generation history stored in a separate table (pin_metadata_generations) with timestamps, values, and feedback
- Pinterest SEO approach: replicate the existing system prompt from n8n/OpenAI setup

### Scheduling Interaction
- Date/time picker on the pin detail page (inline alongside other pin fields)
- Time picker: preset quick-pick times + custom time entry
- Bulk scheduling from pins list: "spread across dates" — user picks start date + interval (e.g., one pin every 2 days)
- No default time — user must always pick both date and time explicitly
- Simple date picker — no conflict/overlap visualization (calendar phase handles that)
- Prerequisite: metadata must be generated before scheduling is allowed (title + description required)

### Status Workflow Automation
- After successful AI metadata generation: status auto-advances to "Metadaten erstellt" with toast notification
- After scheduling (date/time set): status auto-advances to "Bereit zum Planen/Veröffentlichen"
- "Veröffentlicht" (Published) status is set by n8n after Pinterest publishing — not managed in-app
- Pin image generation states (Pin generieren → Pin wird generiert → Pin generiert) are for a FUTURE feature (in-app pin image generation) — keep in schema/docs but hide from Phase 5 UI
- Status progression is flexible — user can skip states or jump to any state (for corrections/edge cases)
- Error recovery: "Reset to previous state" button (returns pin to the state before the error occurred, not always back to Entwurf)

### Claude's Discretion
- Exact layout of scheduling controls on pin detail page
- Preset time slot values for the quick-pick
- Bulk scheduling dialog design
- Generation history UI (how to browse/compare previous generations)
- Error handling for failed API calls

</decisions>

<specifics>
## Specific Ideas

- Existing OpenAI Chat Completions endpoint with preconfigured system prompt — replicate this prompt for Pinterest SEO optimization
- Inngest pipeline pattern already established in Phase 3 (blog scraping) — reuse for bulk metadata generation
- Regeneration feedback loop: user types feedback text → new generation incorporates feedback → keeps conversation-like refinement

</specifics>

<deferred>
## Deferred Ideas

- In-app pin image generation (Pin generieren → Pin wird generiert → Pin generiert workflow) — future phase, states kept in schema
- Calendar view showing scheduled pins with conflict visualization — Phase 6

</deferred>

---

*Phase: 05-ai-metadata-publishing*
*Context gathered: 2026-01-29*

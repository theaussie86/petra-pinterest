# 1. AI disclosure on Pins

Date: 2026-06-08

## Status

Accepted

## Context

Pinterest requires creators to disclose AI involvement in a Pin's image. The disclosure is sent on `POST /v5/pins` (and pin update) via the `ai_disclosures` object:

```jsonc
"ai_disclosures": { "values": ["AI_MODIFIED", "SYNTHETIC_PERFORMER"] }
```

Two enum values exist (UPPERCASE on the Pin API; the Catalog API uses lowercase variants):

- `AI_MODIFIED` - image generated or altered with AI. Broad. Pinterest also auto-applies an "AI modified" badge when its own detection fires.
- `SYNTHETIC_PERFORMER` - a fully AI-invented, fictional human performer (a person who does not exist and is not a copy of an identifiable real human). Narrow.

The field is optional in Pinterest's OpenAPI schema but mandatory by Pinterest policy for AI content.

Constraints specific to this project:

- Essentially every image this app publishes is AI-generated (blog Pinterest graphics), so `AI_MODIFIED` applies to almost every Pin.
- There are two publish paths that both build the Pinterest payload: the user-triggered server function (`src/lib/server/pinterest-publishing.ts`) and the scheduled Edge cron function (`supabase/functions/publish-scheduled-pins/index.ts`). The cron path runs with no UI, so the disclosure must be persisted in the database, not held in UI state.

## Decision

1. Persist the disclosure as **two boolean columns** on `pins`:
   - `ai_modified boolean NOT NULL DEFAULT true`
   - `synthetic_performer boolean NOT NULL DEFAULT false`
2. Both publish paths map the two booleans to `ai_disclosures.values` at request-build time.
3. If both booleans are false, omit the `ai_disclosures` field entirely (do not send an empty `values` array).
4. `synthetic_performer = true` implies `ai_modified = true`. The UI enforces this: enabling synthetic auto-enables and locks ai_modified.
5. UI: two switches in the edit-pin dialog under a "KI-Kennzeichnung" block; `ai_modified` default on, `synthetic_performer` default off with an explanatory hint.
6. Gemini-based auto-suggestion of `synthetic_performer` is deferred to a later iteration.

## Consequences

**Positive**

- Default-on for `ai_modified` is the compliant-by-default posture: Pinterest penalizes missing disclosure, not over-disclosure, and all our images are AI-generated.
- The `DEFAULT true` backfills existing Pins correctly on migration, with no data migration script.
- Two booleans map 1:1 to the two UI switches, default trivially, and are easy to query and validate.

**Negative / trade-offs**

- Two booleans diverge from the API's native `text[]` shape; a mapping step is required on each publish path. Accepted because there are only two fixed values and an array adds default/validation friction for no gain.
- The mapping logic is duplicated across two runtimes (Node server fn and Deno Edge fn) with no shared helper. Both must be changed and tested together; drift is a maintenance risk.
- A user can turn `ai_modified` off on a genuinely AI image and under-disclose. Accepted: the toggle exists for the rare non-AI image, and default-on makes the unsafe state deliberate.

## Alternatives considered

- **`text[]` or `jsonb` column** mirroring the API shape - rejected: overkill for two fixed values, harder defaults and validation.
- **Default off / opt-in disclosure** - rejected: every image is AI-generated, so opt-in invites forgetting and policy violations.
- **Gemini auto-detection of synthetic performers** - deferred: real-vs-fictional person is a human judgment Gemini cannot reliably make (it cannot know whether a depicted person exists), and false positives are riskier than a manual switch.

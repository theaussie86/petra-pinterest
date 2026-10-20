# Pin-Template Write Contract (Agenten-Eingang)

The Pin-Werkstatt templates are produced **by an external agent**, never by a
human editing texts in Pinfinity. Pinfinity only displays templates, changes
their status, and records revision requests.

As of ADR-0006 (issue #126) that agent is a **Connected Agent** going through
the MCP server at `/mcp` under the user's OAuth token and RLS — the Werkstatt
MCP tools (`create_pin_template`, `update_pin_template`,
`answer_revision_request`) enforce this contract before every write
(`src/lib/mcp/tools/werkstatt.ts`). The older path, a direct login as the
least-privilege Postgres role **`pin_werkstatt_agent`** (epic #74, issues #77,
#83), has been removed: the role was locked `NOLOGIN`
(`00038_lock_pin_werkstatt_agent_role.sql`, #126) and then dropped together with
`agent_project_access` and its guard trigger
(`00039_drop_pin_werkstatt_agent_role.sql`, #127). The rejection rules below are
unchanged — they are what matters to repo readers regardless of the write path.

This document is the contract for repo readers. The database enforces the
rejection rules (see migration `00027_pin_template_validation.sql`); the same
rules are mirrored in TypeScript at `src/lib/validation/pin-template.ts` for any
future server-side ingest and for unit testing.

Related:

- **Agent skill** (what the agent actually reads, no repo access needed):
  [`agent-skills/pin-werkstatt/`](../agent-skills/pin-werkstatt/SKILL.md). It
  now describes the MCP tool workflow; the old SQL queries lived in
  `references/sql.md` before #126 (in the Git history).
- **MCP Werkstatt tools** (the live write path): `src/lib/mcp/tools/werkstatt.ts`.

The retired DB role setup (`pin-werkstatt-agent-db-user.md`) and its SQL skill
probe (`pin_werkstatt_agent_skill.sql`) were removed with the role in #127; they
live in the Git history if the MCP approach ever has to be undone.

If this document and the code disagree, `src/lib/mcp/tools/werkstatt.ts` and the
DB constraints (migration `00027`) are the source of truth.

## Write path

- Write through the MCP Werkstatt tools under the user's OAuth token and RLS, not
  with the service role key — the agent sees and writes only its own tenant's
  data and can read `blog_projects`/`blog_articles`, read/insert/update
  `pin_templates` (no delete) and update only a revision's `previous_snapshot`.
  (Historically this was the Postgres role `pin_werkstatt_agent` scoped per
  project via `public.agent_project_access`, migration
  `00029_pin_werkstatt_agent_role.sql`; dropped per ADR-0006 in migration
  `00039_drop_pin_werkstatt_agent_role.sql`.)
- `tenant_id` is set automatically from the article by a trigger — the agent
  does not set it.
- **Upsert on the natural key `(blog_article_id, position)`.** Re-running an
  ingest for the same article must update the existing row for a position rather
  than insert a duplicate (the unique index `idx_pin_templates_article_position`
  rejects duplicates).
- **Do not overwrite reviewed templates.** A row whose `status` is `approved`
  (or `archived`) reflects human review inside Pinfinity; the MCP Werkstatt tools
  (`update_pin_template`, `answer_revision_request`) refuse to change it and
  never set the status to `approved`/`archived`. (The old DB-role path enforced
  the same rule with the `pin_templates_guard_agent_writes` trigger, dropped in
  migration `00039` together with the role.) A re-ingest only touches rows that
  are still `draft`, so `approved`, `archived` **and** `needs_revision` positions
  are left alone. `needs_revision` rows are changed only through the revision
  flow below, so the pre-rework snapshot is never lost.

## Which articles get templates

The reviewer curates articles in the Pin-Werkstatt (migration
`00035_article_workshop_curation.sql`). `blog_articles.workshop_status` is
`NULL` (undecided), `wanted` or `excluded`. The agent only writes templates for
`wanted` articles that are not archived, oldest `workshop_status_changed_at`
first, and reads the optional `workshop_note` as per-article guidance (skill
query A3). The agent cannot change these columns. A request counts as done once
the article has 30 templates; nothing is stored for that.

## Required fields

Enforced `NOT NULL` by the schema (`00026_pin_templates.sql`):

- `tenant_id`: the owning tenant. Derived from the article by the trigger
  `set_pin_templates_tenant_id`; the agent does not set it (a value it sends is
  overwritten).
- `blog_article_id` — the article the template hangs off (FK, `ON DELETE
  CASCADE`). Landing pages without a scraped article are added as normal
  articles via "Add Article" first.
- `position` — 1..30, unique per article.
- `main_keyword` — the primary keyword.
- `image_prompt` — the finished image prompt.

Additionally required by the validation constraints:

- `overlay` — must be present and must contain `main_keyword` (see rules below).

## Allowed status values

`status` defaults to `draft`. Allowed values (CHECK constraint in `00026`):

| Status           | Meaning                          |
| ---------------- | -------------------------------- |
| `draft`          | New, awaiting review (default)   |
| `needs_revision` | Revision requested in Pinfinity  |
| `approved`       | Approved by a human — do not overwrite |
| `archived`       | Archived — do not overwrite      |

The agent normally writes `draft`. It must not move a template to `approved`
itself; approval happens in the UI.

## Revision requests (Änderungswünsche)

A reviewer can request a change on a template from the Pin-Werkstatt detail view.
Submitting a request records a row in `public.pin_template_revisions` (see
`00028_pin_template_revisions.sql`) and moves the template's `status` to
`needs_revision` in one step. The agent works these off:

- **Find open requests** — poll for templates with `status = 'needs_revision'`.
  The newest (up to 3 kept) `pin_template_revisions` rows for that
  `template_id`, ordered by `created_at DESC`, carry the reviewer `feedback`.
- **Rework the template** with a direct `UPDATE` by `id` (not the batch
  upsert, which skips `needs_revision`). In the same statement, write the
  pre-rework template fields into the newest revision's `previous_snapshot`
  (jsonb) so the change stays auditable.
- **Set the status back to `draft`** in that statement, so the template
  re-enters the review queue. Do **not** set `approved`/`archived` — that is a
  human action in the UI.

The `answer_revision_request` MCP tool does all three and is a no-op once the
template is no longer `needs_revision`.

The application layer keeps only the **last 3** revisions per template; older
rows are pruned when a new request is recorded.

## `design` shape

`design` is `jsonb`, all fields optional (legacy templates may omit any):

```json
{
  "name": "string",
  "layout": "string",
  "image_position": "string",
  "fonts": ["string"],
  "scroll_stopper": "string",
  "colors": ["#hex", "#hex"]
}
```

The external `format` field (constant `1000 x 1500 Pixel`) is dropped.

## Rejection rules (enforced by the DB)

`description` is optional and the agent leaves it `null`: the Pinterest
description is generated later in Pinfinity, on the pin, once the image exists
(`pins.description`, `pin_metadata_generations`). It is never copied from the
template.

A write that breaks any of these is rejected by a CHECK constraint or the unique
index:

1. **Position out of range** — `position` must be within `1..30`.
2. **Duplicate position per article** — `(blog_article_id, position)` is unique.
3. **Description too long** — `description`, when set, is at most 500 characters.
4. **Keyword not in overlay** — `main_keyword` must appear **literally** in
   `overlay`, compared after normalization (lower-cased, whitespace runs
   collapsed to a single space, trimmed). A missing overlay is rejected.
5. **Description not starting with keyword** — `description`, when set, must
   **begin** with `main_keyword` under the same normalization.

Normalization is `pin_template_normalize(txt)` in SQL and `normalizeForMatch()`
in TS — keep the two in sync.

## Completeness check (not enforced)

Each article should carry **exactly 30** templates, but completeness is not
enforced by a constraint (a batch is inserted row by row). After an ingest, run
this to find articles that do not have 30 templates:

```sql
SELECT blog_article_id, COUNT(*) AS template_count
FROM public.pin_templates
GROUP BY blog_article_id
HAVING COUNT(*) <> 30
ORDER BY template_count;
```

An empty result means every article has its full 30 templates.

# Pin-Template Write Contract (Agenten-Eingang)

The Pin-Werkstatt templates are produced **exclusively by an external agent**
that writes rows into `public.pin_templates` directly, logged in as the
least-privilege Postgres role **`pin_werkstatt_agent`** (epic #74, issues #77,
#83). Pinfinity only displays templates, changes their status, and records
revision requests. It never edits template texts and does not create templates.

This document is the contract for repo readers. The database enforces the
rejection rules (see migration `00027_pin_template_validation.sql`); the same
rules are mirrored in TypeScript at `src/lib/validation/pin-template.ts` for any
future server-side ingest and for unit testing.

Related:

- **Agent skill** (what the agent actually reads, no repo access needed):
  [`agent-skills/pin-werkstatt/`](../agent-skills/pin-werkstatt/SKILL.md), with
  the finished SQL queries in `references/sql.md`.
- **DB user setup** (enable login, grant projects, extend, rotate, revoke):
  [`pin-werkstatt-agent-db-user.md`](./pin-werkstatt-agent-db-user.md).
- **Skill query test** (runs every skill query as the role, rolled back):
  `supabase/tests/pin_werkstatt_agent_skill.sql`.

If this document and the skill disagree, the skill's SQL in `references/sql.md`
is the source of truth (it is what the test runs against the DB). Change it
there first, then update the test copy and this document.

## Write path

- Connect as the dedicated Postgres role **`pin_werkstatt_agent`** (migration
  `00029_pin_werkstatt_agent_role.sql`), not with the service role key. The role
  does not bypass RLS: it only sees and writes data for the blog projects listed
  for it in `public.agent_project_access`. It can read `blog_projects` and
  `blog_articles`, read/insert/update `pin_templates` (no delete), read
  `pin_template_revisions` and update only their `previous_snapshot`.
- `tenant_id` is set automatically from the article by a trigger — the agent
  does not set it.
- **Upsert on the natural key `(blog_article_id, position)`.** Re-running an
  ingest for the same article must update the existing row for a position rather
  than insert a duplicate (the unique index `idx_pin_templates_article_position`
  rejects duplicates).
- **Do not overwrite reviewed templates.** A row whose `status` is `approved`
  (or `archived`) reflects human review inside Pinfinity; the trigger
  `pin_templates_guard_agent_writes` rejects any agent change to it. The batch
  upsert only updates rows that are still `draft`
  (`ON CONFLICT ... DO UPDATE ... WHERE pin_templates.status = 'draft'`), so a
  re-ingest skips `approved`, `archived` **and** `needs_revision` positions.
  `needs_revision` rows are changed only through the revision flow below, so the
  pre-rework snapshot is never lost.

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

The skill's query C2 does all three atomically and is a no-op once the template
is no longer `needs_revision`.

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

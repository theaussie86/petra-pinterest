# Pin-Template Write Contract (Agenten-Eingang)

The Pin-Werkstatt templates are produced **exclusively by an external agent**
that writes rows into `public.pin_templates` directly, using the Supabase
**service role** key (epic #74, issue #77). Pinfinity only displays templates,
changes their status, and records revision requests — it never edits template
texts and does not create templates.

This document is the contract that agent works to. The database enforces the
rejection rules (see migration `00027_pin_template_validation.sql`); the same
rules are mirrored in TypeScript at `src/lib/validation/pin-template.ts` for any
future server-side ingest and for unit testing.

## Write path

- Insert/update `public.pin_templates` with the **service role** key. The
  `Service role full access pin_templates` policy bypasses RLS, so the agent is
  responsible for setting the correct `tenant_id` itself — it is **not** derived
  from `auth.uid()` on this path.
- **Upsert on the natural key `(blog_article_id, position)`.** Re-running an
  ingest for the same article must update the existing row for a position rather
  than insert a duplicate (the unique index `idx_pin_templates_article_position`
  rejects duplicates).
- **Do not overwrite already-approved templates.** A row whose `status` is
  `approved` (or `archived`) reflects human review inside Pinfinity. The agent
  must exclude those positions from an upsert (e.g. `WHERE status IN
  ('draft','needs_revision')` on update, or skip positions already `approved`/
  `archived`), so a re-ingest never clobbers reviewed work.

## Required fields

Enforced `NOT NULL` by the schema (`00026_pin_templates.sql`):

- `tenant_id` — the owning tenant. The agent sets this explicitly.
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
- **Rework the template** and upsert it on `(blog_article_id, position)` as
  usual. Before overwriting, write the pre-rework template fields into the
  latest revision's `previous_snapshot` (jsonb) so the change stays auditable.
- **Set the status back to `draft`** after the rework, so the template
  re-enters the review queue. Do **not** set `approved`/`archived` — that is a
  human action in the UI.

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

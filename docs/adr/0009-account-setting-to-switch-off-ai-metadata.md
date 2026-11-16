---
status: accepted
---

# Account setting to switch off AI metadata generation

Users can switch automatic AI metadata generation (Gemini) off for their whole account in `/settings`. The value lives in a new table `tenant_settings` (`tenant_id` primary key, `ai_metadata_enabled boolean not null default true`), which the user's own tenant may read, insert and update under RLS. No row means on. When off, no path in Pinfinity calls Gemini for pin metadata: the user writes titles and descriptions himself or lets a Connected Agent fill them in via MCP (`create_pin`, `create_pin_from_chat_image`, `set_pin_metadata`).

## Why

A Connected Agent created pins with finished metadata and then, asked to "take over metadata generation", called `generate_metadata`. The Gemini key had no credit, all ten pins went to `error` and error mails went out. The operators do not want to use Gemini any more, but the app offered no way to say so: the generate actions, the auto trigger after pin creation and the MCP tool were always there.

## Decisions

- **User setting, not a feature flag.** `tenant_features` is set by an admin in the SQL editor and is read-only for users. This switch belongs to the user, so it gets its own table with insert/update policies. `tenant_settings` is the place for further per-tenant user settings.
- **Checked on every layer, enforced in the database.** UI hides or disables the actions; server functions refuse (`triggerAutoMetadataFn` quietly returns 0, so new pins stay `draft`); `enqueue_generate_metadata` raises `AI metadata generation is disabled for this account` for every queue path including MCP; the Edge pipeline checks before any Gemini work, so messages that were already queued are dropped without `error` status or mail and the pin goes back to `previous_status` (`draft` or `metadata_created`), else `draft`; the MCP server neither lists nor runs `generate_metadata` and tells the agent to write metadata itself.
- **Default on, missing table counts as on.** Existing accounts keep their behaviour. Code that reads the setting treats PostgREST `PGRST205` / Postgres `42P01` as on, so the code is safe before the migration runs; the migration is additive and keeps the RPC signature, so main keeps working after it runs. Other read errors fail (server) or retry (queue) rather than calling Gemini on a guess.
- **`generate_metadata` only on explicit request.** Even with the setting on, its description says: only when the user explicitly wants Pinfinity to generate metadata with AI, never for pins whose metadata the agent has just written.

## Consequences

- The project's Gemini key is only needed while the setting is on.
- In the MCP path the setting is cached per user for up to 60s (#154), so flipping it takes up to a minute to change which tools a Connected Agent sees; the database still enforces it immediately (`enqueue_generate_metadata` raises).
- `pin_metadata_generations` history stays readable when off; restore still works.
- MCP tool descriptions can carry an `aiMetadataOffNote` and tools can be gated with `requiresAiMetadata`, analogous to `feature`.

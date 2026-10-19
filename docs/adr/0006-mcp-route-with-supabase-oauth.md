---
status: accepted
---

# MCP as an app route with Supabase OAuth, replacing the agent DB role

Pinfinity exposes an MCP server at `/mcp` (Streamable HTTP, stateless) as a TanStack Start server route. Supabase Auth is the OAuth 2.1 authorization server, with dynamic client registration so Claude, ChatGPT and Codex can connect after a consent page in Pinfinity. Every tool call runs with the user's access token under RLS, never the service role, so a Connected Agent can do exactly what its user can and sees exactly what its user sees. The architecture follows CaDo (reico-crm, ADR-0002 there) one to one.

## Rules on top of RLS

- **No deletes in v1.** Articles are archived, not deleted (article delete cascades to pins).
- **Proposes, never decides.** Werkstatt tools write only `draft`/`needs_revision` and never touch approved or archived pin templates. Approval stays a human action in the UI.
- **No Gemini by default.** MCP never triggers metadata generation implicitly. A Connected Agent can write metadata itself (`set_pin_metadata`, which sets `metadata_created`) or call `generate_metadata` explicitly.
- **Scheduling only in the future** (`scheduled_at > now + 15 min`), so the user can still correct a plan before MQ publishes it. Immediate publish is out of v1.
- Bulk and enqueue tools default to dry-run.
- MCP is open to every tenant; Werkstatt tools are listed only when `tenant_features.pin_werkstatt` is on.
- Pins and pin templates written via MCP record `source` and the OAuth `client_id`.

## Considered options

- **Keep the Postgres login role `pin_werkstatt_agent` (rejected).** A second permission model next to RLS, per-agent migrations, passwords in agent environments, no self-service revoke.
- **Separate MCP service (rejected).** Duplicates auth and data access; the app already has the Supabase clients and domain logic.
- **Per-project scoping on the consent page (rejected).** One tenant is one person; grants are revocable per client.

## Consequences

- First server routes in Pinfinity, plus `/.well-known/oauth-protected-resource`, a consent page and a `next` return path through Google login.
- `@supabase/supabase-js` must jump from 2.49 to a version with the OAuth server API.
- `src/lib/api/*` uses the browser client; MCP tools need variants that take a Supabase client per call.
- The OAuth server section is set by hand in the Supabase Dashboard (CaDo: the GitHub integration did not carry `[auth.oauth_server]` to prod).
- Role removal order: MCP live -> Werkstatt skill rewritten to MCP -> role `NOLOGIN` -> later a migration drops role, policies, guard trigger and `agent_project_access` (supersedes `docs/pin-werkstatt-agent-db-user.md`).
- Public `/impressum`, `/datenschutz`, `/agb`: Christoph is the provider; terms state that Pinfinity only provides the interface and that the user's choice of AI provider governs how that provider processes data.

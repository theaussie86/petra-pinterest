-- ============================================================================
-- Migration: Pin provenance (source + OAuth client) for Connected Agents
-- ============================================================================
-- MCP 5 (issue #122, PRD #115, ADR-0006): a Connected Agent can create pins
-- and pin templates on the user's behalf. Every row written over MCP records
-- where it came from so the user can later tell agent-made rows apart from her
-- own UI work (Spec #115, user story 42).
--
--   source          -- 'ui' (default, written in the app) or 'mcp' (a Connected
--                      Agent via the /mcp server)
--   oauth_client_id -- the OAuth client_id from the agent's token (e.g. Claude,
--                      ChatGPT), NULL for UI writes
--
-- Backfill: DEFAULT 'ui' marks every existing pin and template as UI-authored,
-- which is correct — MCP did not exist before this slice. RLS is unchanged
-- (same tenant_id scope on both tables).

BEGIN;

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ui'
    CHECK (source IN ('ui', 'mcp')),
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT;

COMMENT ON COLUMN public.pins.source IS
  'Where the pin was written: ''ui'' (the app) or ''mcp'' (a Connected Agent via /mcp). Defaults ''ui''.';
COMMENT ON COLUMN public.pins.oauth_client_id IS
  'OAuth client_id of the Connected Agent that wrote the pin (e.g. Claude, ChatGPT), NULL for UI writes.';

ALTER TABLE public.pin_templates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ui'
    CHECK (source IN ('ui', 'mcp')),
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT;

COMMENT ON COLUMN public.pin_templates.source IS
  'Where the template was written: ''ui'' (the app) or ''mcp'' (a Connected Agent via /mcp). Defaults ''ui''.';
COMMENT ON COLUMN public.pin_templates.oauth_client_id IS
  'OAuth client_id of the Connected Agent that wrote the template, NULL for UI writes.';

COMMIT;

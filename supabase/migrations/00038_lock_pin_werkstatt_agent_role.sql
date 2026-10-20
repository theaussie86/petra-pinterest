-- Lock the Pin-Werkstatt agent DB role (NOLOGIN), reversible.
-- Spec #115, issue #126, ADR-0006.
--
-- The external Pin-Werkstatt agent no longer logs in as the Postgres role
-- `pin_werkstatt_agent`. Its work now runs through the MCP server at /mcp under
-- the user's OAuth token (ADR-0006), so the second permission model next to RLS
-- is being retired. This migration is the reversible first step of that
-- retirement: it revokes LOGIN and terminates any open session. The role,
-- policies, guard trigger and `agent_project_access` still exist and are dropped
-- later in a separate migration (issue #127), once the MCP path has run cleanly
-- for a while.
--
-- Apply this ONLY after a verified real Werkstatt run over MCP (issue #126
-- acceptance). It is reversible — to hand the old DB role access back:
--
--   ALTER ROLE pin_werkstatt_agent WITH LOGIN;
--   -- password is still set; rotate it if in doubt (see
--   -- docs/pin-werkstatt-agent-db-user.md, section 5).
--
-- Guarded on role existence so a fresh database (where 00029 already creates the
-- role NOLOGIN) and a database where #127 has since dropped the role both apply
-- this cleanly.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pin_werkstatt_agent') THEN
    -- Revoke login. 00029 created the role NOLOGIN; login was enabled by hand.
    ALTER ROLE pin_werkstatt_agent WITH NOLOGIN;

    -- End any session still connected with the old credentials, so the lock
    -- takes effect immediately instead of only on the next reconnect.
    PERFORM pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE usename = 'pin_werkstatt_agent'
      AND pid <> pg_backend_pid();

    COMMENT ON ROLE pin_werkstatt_agent IS
      'Retired external Pin-Werkstatt agent role (NOLOGIN as of #126). Superseded by the MCP server under RLS (ADR-0006). Dropped in a later migration (#127). Re-enable with ALTER ROLE ... WITH LOGIN if the MCP path has to be rolled back.';
  END IF;
END
$$;

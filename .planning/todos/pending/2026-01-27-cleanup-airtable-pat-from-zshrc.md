---
created: 2026-01-27T00:00
title: Cleanup AIRTABLE_PAT from ~/.zshrc
area: tooling
files:
  - ~/.zshrc:39-40
  - .mcp.json
---

## Problem

AIRTABLE_PAT is exported in ~/.zshrc (line 39-40) to support the Airtable MCP server configured in .mcp.json. The MCP server uses `${AIRTABLE_PAT}` env expansion to set AIRTABLE_API_KEY.

Once the project no longer needs the Airtable MCP server (e.g., after Airtable migration to Supabase is complete in Phase 7), the export should be removed from ~/.zshrc to keep the shell profile clean and avoid leaving credentials in config files unnecessarily.

## Solution

Remove these lines from ~/.zshrc:
```
# Airtable
export AIRTABLE_PAT="pats..."
```

Only do this after confirming the Airtable MCP server is no longer needed (likely after Phase 7 - Airtable migration).

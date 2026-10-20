import { supabase } from '@/lib/supabase'

/**
 * A Connected Agent is an OAuth client (Claude, ChatGPT, Codex, …) the user has
 * authorized to act on their behalf through the `/mcp` server (Spec #115,
 * ADR-0006). It is backed one-to-one by a Supabase OAuth grant.
 */
export interface ConnectedAgent {
  /** OAuth client id (UUID) — the handle used to revoke the grant. */
  clientId: string
  /** Human-readable client name from the OAuth client registration. */
  name: string
  /** ISO 8601 timestamp of when the user granted access. */
  grantedAt: string
  /** Scopes granted to the client. */
  scopes: string[]
}

/**
 * List the user's Connected Agents, newest grant first.
 *
 * Runs through the browser Supabase client's OAuth 2.1 server API under the
 * caller's session (same client the consent page uses), so RLS and tenant
 * scoping come from the logged-in user — never a service role.
 */
export async function listConnectedAgents(): Promise<ConnectedAgent[]> {
  const { data, error } = await supabase.auth.oauth.listGrants()
  if (error) throw error

  return (data ?? [])
    .map((grant) => ({
      clientId: grant.client.id,
      name: grant.client.name,
      grantedAt: grant.granted_at,
      scopes: grant.scopes,
    }))
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
}

/**
 * Revoke a Connected Agent. Supabase marks the consent revoked, deletes the
 * client's active sessions and invalidates its refresh tokens, so the next tool
 * call from that client gets a 401 (AC: manual verification).
 */
export async function revokeConnectedAgent(clientId: string): Promise<void> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  if (error) throw error
}

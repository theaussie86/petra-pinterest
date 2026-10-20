import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureKey } from '@/lib/features'
import type { McpToolDefinition } from './tool'

/**
 * The resolved identity behind a single MCP request. Produced by an
 * {@link Authenticate} function from a Bearer token and handed to every tool.
 *
 * A Connected Agent (see CONTEXT.md) always acts as exactly this user: the
 * `supabase` client carries the user's access token, so every query runs under
 * RLS — never the service role (ADR-0006).
 */
export interface McpUserContext {
  userId: string
  tenantId: string
  displayName: string
  email: string
  /** Feature flags enabled for the user's tenant (see src/lib/features.ts). */
  features: FeatureKey[]
  /** OAuth client id from the token (`client_id` claim), null when absent. */
  oauthClientId: string | null
  /** Supabase client bound to the user's token; all tool reads/writes go here. */
  supabase: SupabaseClient
}

/**
 * Turns a Bearer token into a user context, or returns null when the token is
 * missing/invalid. Injected into the request handler so tests can supply a fake
 * (no network, in-memory Supabase) and production can verify against Supabase.
 */
export type Authenticate = (token: string) => Promise<McpUserContext | null>

/**
 * Dependencies injected into {@link handleMcpRequest}. The test seam: swap
 * `authenticate` for a fake and `baseUrl`/`authServerUrl` for fixtures, and the
 * whole handler is exercised with no network.
 */
export interface McpHandlerDeps {
  authenticate: Authenticate
  /** Deployment base URL, no trailing slash, e.g. `https://pinfinity.app`. */
  baseUrl: string
  /** OAuth 2.1 authorization server (Supabase Auth) base URL. */
  authServerUrl: string
  /** Tool set to expose; defaults to the full registry when omitted. */
  tools?: ReadonlyArray<McpToolDefinition<never>>
}

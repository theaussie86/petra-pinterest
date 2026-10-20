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
  /**
   * Lists the Pinterest boards of one of the user's projects. Injected because
   * fetching boards needs a service-role Vault read for the access token plus a
   * live Pinterest API call — kept out of tool code so `list_boards` stays
   * testable over the seam and the service read never leaks into other tools.
   */
  listBoards?: (projectId: string) => Promise<McpBoard[]>
  /**
   * Fetches a remote image for `create_pin`. Injected because the actual HTTPS
   * request belongs outside tool code — the tool keeps the guardrails (HTTPS
   * only, `image/*`, size cap) and stays testable over this seam. Returns the
   * server-reported content type and the raw bytes.
   */
  fetchRemoteImage?: (url: string) => Promise<FetchedImage>
  /**
   * Reconciles the MQ publish jobs for the given pins (ADR-0005). Injected so
   * the `schedule_pins`/`unschedule_pin` tools keep the delayed publish job
   * consistent over the same path the UI uses, but with the agent's token-bound
   * client (an MCP request carries no cookies). Best-effort: never throws.
   */
  syncPublishJobs?: (pinIds: string[]) => Promise<void>
}

/** A Pinterest board as surfaced to a Connected Agent. */
export interface McpBoard {
  pinterest_board_id: string
  name: string
}

/** The result of fetching a remote image for `create_pin`. */
export interface FetchedImage {
  /** `Content-Type` as reported by the server, or null when absent. */
  contentType: string | null
  /** The raw image bytes. */
  bytes: ArrayBuffer
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

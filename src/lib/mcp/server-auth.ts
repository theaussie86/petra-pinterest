import { createClient } from '@supabase/supabase-js'
import type {
  Authenticate,
  FetchedImage,
  McpHandlerDeps,
  McpUserContext,
} from './context'
import type { FeatureKey } from '@/lib/features'
import { protectedResourceMetadata } from './metadata'
import { createBoardLister } from './boards-server'

/**
 * Production {@link Authenticate}: verify a Bearer token against Supabase and
 * build the user context. Uses the publishable key with the caller's token in
 * the Authorization header, so every subsequent query runs under RLS as that
 * user — never the service role (ADR-0006).
 *
 * The token is verified with `getClaims()` (local verification when asymmetric
 * signing keys are enabled, otherwise a network call to Auth). Profile and
 * tenant features are then read through the same RLS-scoped client.
 */
export function createSupabaseAuthenticate(): Authenticate {
  return async (token: string): Promise<McpUserContext | null> => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )

    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims) {
      return null
    }

    const { claims } = data
    const userId = claims.sub
    const email = typeof claims.email === 'string' ? claims.email : ''
    const oauthClientId =
      typeof claims.client_id === 'string' ? claims.client_id : null

    const [{ data: profile }, { data: featureRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('tenant_id, display_name')
        .eq('id', userId)
        .single(),
      supabase.from('tenant_features').select('feature'),
    ])

    return {
      userId,
      tenantId: profile?.tenant_id ?? '',
      displayName: profile?.display_name ?? email.split('@')[0] ?? 'User',
      email,
      features: (featureRows ?? []).map((row) => row.feature as FeatureKey),
      oauthClientId,
      supabase,
      listBoards: createBoardLister(supabase),
      fetchRemoteImage,
    }
  }
}

/**
 * Production image fetch for `create_pin`: a plain HTTPS GET returning the
 * server-reported content type and the raw bytes. The tool enforces the
 * guardrails (HTTPS only, `image/*`, size cap); this just does the request.
 */
async function fetchRemoteImage(url: string): Promise<FetchedImage> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Bild-Download fehlgeschlagen (HTTP ${res.status}).`)
  }
  return {
    contentType: res.headers.get('content-type'),
    bytes: await res.arrayBuffer(),
  }
}

/**
 * Deployment base URL (no trailing slash). Prefers an explicit env override,
 * then Vercel's deployment URL, then localhost for dev.
 */
export function resolveBaseUrl(): string {
  const explicit = process.env.MCP_BASE_URL ?? process.env.SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

/** Dependencies for the live `/mcp` handler, resolved from the environment. */
export function resolveMcpHandlerDeps(): McpHandlerDeps {
  return {
    authenticate: createSupabaseAuthenticate(),
    baseUrl: resolveBaseUrl(),
    authServerUrl: process.env.SUPABASE_URL!,
  }
}

/**
 * JSON response for the Protected Resource Metadata well-known endpoints.
 * CORS-open and cacheable; both the base and `/mcp`-bound routes serve this.
 */
export function protectedResourceMetadataResponse(): Response {
  const body = protectedResourceMetadata(
    resolveBaseUrl(),
    process.env.SUPABASE_URL!,
  )
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

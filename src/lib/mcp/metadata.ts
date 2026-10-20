/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * The MCP endpoint (`<baseUrl>/mcp`) is the protected resource; Supabase Auth is
 * the authorization server. A 401 from the handler points clients here via the
 * `WWW-Authenticate: resource_metadata=...` header so they can start the OAuth
 * flow automatically (ADR-0006).
 */
export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  bearer_methods_supported: string[]
}

export function protectedResourceMetadata(
  baseUrl: string,
  authServerUrl: string,
): ProtectedResourceMetadata {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [authServerUrl],
    bearer_methods_supported: ['header'],
  }
}

/** Path of the resource-specific metadata document for `/mcp` (RFC 9728 §3.1). */
export const PROTECTED_RESOURCE_METADATA_PATH =
  '/.well-known/oauth-protected-resource/mcp'

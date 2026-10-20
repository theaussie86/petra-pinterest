import { createFileRoute } from '@tanstack/react-router'
import { protectedResourceMetadataResponse } from '@/lib/mcp/server-auth'

/**
 * Path-bound Protected Resource Metadata (RFC 9728 §3.1) for the `/mcp`
 * resource. This is the URL the handler's 401 `WWW-Authenticate` header points
 * at; it serves the same document as the well-known root.
 */
export const Route = createFileRoute(
  '/.well-known/oauth-protected-resource/mcp',
)({
  server: {
    handlers: {
      GET: () => protectedResourceMetadataResponse(),
    },
  },
})

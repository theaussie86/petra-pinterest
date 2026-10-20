import { createFileRoute } from '@tanstack/react-router'
import { protectedResourceMetadataResponse } from '@/lib/mcp/server-auth'

/**
 * Protected Resource Metadata (RFC 9728) at the well-known root. Points OAuth
 * clients at Supabase Auth as the authorization server for the `/mcp` resource.
 */
export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: {
    handlers: {
      GET: () => protectedResourceMetadataResponse(),
    },
  },
})

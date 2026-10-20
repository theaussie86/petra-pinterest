import { createFileRoute } from '@tanstack/react-router'
import { handleMcpRequest } from '@/lib/mcp/handler'
import { resolveMcpHandlerDeps } from '@/lib/mcp/server-auth'

/**
 * `/mcp` — the MCP server endpoint (Streamable HTTP, stateless, POST only).
 * `ANY` routes every method into the handler, which answers non-POST with 405,
 * OPTIONS preflight with CORS, and POST with the JSON-RPC response (ADR-0006).
 */
export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      ANY: ({ request }) => handleMcpRequest(request, resolveMcpHandlerDeps()),
    },
  },
})

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpHandlerDeps } from './context'
import { registerTool } from './tool'
import { allTools } from './tools'
import { PROTECTED_RESOURCE_METADATA_PATH } from './metadata'

/**
 * CORS for the `/mcp` endpoint. Open origin (browser-based clients like
 * claude.ai connect cross-origin) with the two MCP-relevant response headers
 * explicitly exposed so clients can read them (ADR-0006, Spec #115).
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Accept',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

function withCors(headers: Headers): Headers {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return headers
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * 401 pointing clients at the Protected Resource Metadata so they can start the
 * OAuth flow (RFC 9728 / MCP auth). The body is a JSON-RPC error for well-behaved
 * clients that still parse it.
 */
function unauthorized(baseUrl: string): Response {
  const headers = withCors(
    new Headers({
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}${PROTECTED_RESOURCE_METADATA_PATH}"`,
    }),
  )
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    }),
    { status: 401, headers },
  )
}

function methodNotAllowed(): Response {
  const headers = withCors(
    new Headers({ 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' }),
  )
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method Not Allowed' },
      id: null,
    }),
    { status: 405, headers },
  )
}

/**
 * The `/mcp` request handler: stateless Streamable HTTP, JSON responses, POST
 * only. Verifies the Bearer token via the injected `authenticate`, builds a
 * fresh MCP server per request with the user's feature-gated tools, and lets the
 * SDK transport answer the JSON-RPC message. Every tool call runs under the
 * user's token (RLS), never the service role.
 */
export async function handleMcpRequest(
  request: Request,
  deps: McpHandlerDeps,
): Promise<Response> {
  const method = request.method.toUpperCase()

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withCors(new Headers()) })
  }

  if (method !== 'POST') {
    return methodNotAllowed()
  }

  const token = bearerToken(request)
  if (!token) {
    return unauthorized(deps.baseUrl)
  }

  const ctx = await deps.authenticate(token)
  if (!ctx) {
    return unauthorized(deps.baseUrl)
  }

  const server = new McpServer({ name: 'pinfinity', version: '1' })
  const tools = deps.tools ?? allTools
  for (const tool of tools) {
    registerTool(server, tool, ctx)
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)

  const response = await transport.handleRequest(request)
  return new Response(response.body, {
    status: response.status,
    headers: withCors(new Headers(response.headers)),
  })
}

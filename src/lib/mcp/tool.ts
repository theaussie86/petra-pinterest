import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FeatureKey } from '@/lib/features'
import { hasFeature } from '@/lib/features'
import type { McpUserContext } from './context'

/** A tool result in MCP's content envelope. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** Arguments a tool handler receives after parsing and gate/dry-run handling. */
export interface ToolHandlerArgs<Shape extends z.ZodRawShape> {
  /** Parsed tool input, without the injected `dry_run` field. */
  input: z.infer<z.ZodObject<Shape>>
  /**
   * Resolved dry-run flag. For tools with `dryRun: true` this is the caller's
   * `dry_run` argument (default `true`); for all other tools it is `true` and
   * carries no meaning.
   */
  dryRun: boolean
  ctx: McpUserContext
}

/**
 * A typed MCP tool. Built with {@link defineTool} and registered via
 * {@link registerTool}. Two levers are prepared here for later slices:
 *
 * - `feature`: a feature gate. The tool is only listed and callable when the
 *   user's tenant has the flag (Werkstatt tools use this; ADR-0006).
 * - `dryRun`: opt-in. When set, the tool gains a boolean `dry_run` argument that
 *   defaults to `true`, so bulk/enqueue tools preview by default.
 */
export interface McpToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  /** German description (tool names are English snake_case; see Spec #115). */
  description: string
  inputSchema?: Shape
  feature?: FeatureKey
  dryRun?: boolean
  handler: (args: ToolHandlerArgs<Shape>) => Promise<ToolResult> | ToolResult
}

/** Identity helper that pins the generic so call sites stay typed. */
export function defineTool<Shape extends z.ZodRawShape>(
  def: McpToolDefinition<Shape>,
): McpToolDefinition<Shape> {
  return def
}

/** Wraps any JSON-serialisable value as a single text content block. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

const DRY_RUN_FIELD = 'dry_run'

/**
 * Registers a tool on an {@link McpServer} for a given user context. Honours the
 * feature gate (a gated tool the tenant lacks is skipped, so it never appears in
 * `tools/list` nor runs) and, for dry-run tools, injects the `dry_run` argument
 * and resolves it before calling the handler.
 *
 * @returns true if the tool was registered, false if it was gated out.
 */
export function registerTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  def: McpToolDefinition<Shape>,
  ctx: McpUserContext,
): boolean {
  if (def.feature && !hasFeature(ctx, def.feature)) {
    return false
  }

  const inputSchema = {
    ...(def.inputSchema ?? {}),
    ...(def.dryRun
      ? {
          [DRY_RUN_FIELD]: z
            .boolean()
            .default(true)
            .describe('Probelauf: nur anzeigen, nichts speichern. Standard: true.'),
        }
      : {}),
  } as z.ZodRawShape

  const callback = async (args: Record<string, unknown>): Promise<ToolResult> => {
    const { [DRY_RUN_FIELD]: dryRunArg, ...rest } = args ?? {}
    const dryRun = def.dryRun ? dryRunArg !== false : true
    return def.handler({
      input: rest as z.infer<z.ZodObject<Shape>>,
      dryRun,
      ctx,
    })
  }

  server.registerTool(
    def.name,
    { description: def.description, inputSchema },
    // The SDK infers the callback's argument type from `inputSchema`; our shape
    // is built dynamically, so bridge it at this one boundary.
    callback as Parameters<typeof server.registerTool>[2],
  )
  return true
}

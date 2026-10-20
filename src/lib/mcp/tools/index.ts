import type { McpToolDefinition } from '../tool'
import { getProfile } from './account'

/**
 * The full MCP tool registry. v1 grows area by area (Spec #115); this tracer
 * slice ships only the account tool. The handler exposes these unless a test
 * injects its own set.
 */
export const allTools: ReadonlyArray<McpToolDefinition<never>> = [
  getProfile,
] as ReadonlyArray<McpToolDefinition<never>>

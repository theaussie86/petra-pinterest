import type { McpToolDefinition } from '../tool'
import { getProfile } from './account'
import { getProject, listProjects } from './projects'
import { getArticleTool, listArticlesTool } from './articles'
import { getPinStatusCountsTool, getPinTool, listPinsTool } from './pins'
import { listBoardsTool } from './boards'
import { getDashboardStatsTool } from './dashboard'
import { listPublishEventsTool } from './publish-events'

/**
 * The full MCP tool registry (Spec #115). v1 grows area by area; this slice adds
 * the ten read tools (#121) next to the account tracer. The handler exposes
 * these unless a test injects its own set; feature-gated tools are filtered per
 * tenant at registration time.
 */
export const allTools: ReadonlyArray<McpToolDefinition<never>> = [
  getProfile,
  listProjects,
  getProject,
  listArticlesTool,
  getArticleTool,
  listPinsTool,
  getPinTool,
  getPinStatusCountsTool,
  listBoardsTool,
  getDashboardStatsTool,
  listPublishEventsTool,
] as unknown as ReadonlyArray<McpToolDefinition<never>>

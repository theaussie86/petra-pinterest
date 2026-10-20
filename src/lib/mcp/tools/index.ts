import type { McpToolDefinition } from '../tool'
import { getProfile } from './account'
import { getProject, listProjects } from './projects'
import { getArticleTool, listArticlesTool } from './articles'
import { getPinStatusCountsTool, getPinTool, listPinsTool } from './pins'
import { createPinTool, setPinMetadataTool, updatePinTool } from './pins-write'
import { listBoardsTool } from './boards'
import { getDashboardStatsTool } from './dashboard'
import { listPublishEventsTool } from './publish-events'
import { werkstattTools } from './werkstatt'

/**
 * The full MCP tool registry (Spec #115). v1 grows area by area: the account
 * tracer (#119), the ten read tools (#121) and the Gemini-free pin write tools
 * create_pin/set_pin_metadata/update_pin (#122). The handler exposes these
 * unless a test injects its own set; feature-gated tools are filtered per tenant
 * at registration time. The Werkstatt tools (#125) are gated behind
 * `pin_werkstatt` and only surface for tenants with that feature.
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
  createPinTool,
  setPinMetadataTool,
  updatePinTool,
  listBoardsTool,
  getDashboardStatsTool,
  listPublishEventsTool,
  ...werkstattTools,
] as unknown as ReadonlyArray<McpToolDefinition<never>>

import type { McpToolDefinition } from '../tool'
import { getProfile } from './account'
import { getProject, listProjects } from './projects'
import { getArticleTool, listArticlesTool } from './articles'
import { getPinStatusCountsTool, getPinTool, listPinsTool } from './pins'
import { createPinTool, setPinMetadataTool, updatePinTool } from './pins-write'
import { schedulePinsTool, unschedulePinTool } from './pins-schedule'
import { listBoardsTool } from './boards'
import { getDashboardStatsTool } from './dashboard'
import { listPublishEventsTool } from './publish-events'

/**
 * The full MCP tool registry (Spec #115). v1 grows area by area: the account
 * tracer (#119), the ten read tools (#121), the Gemini-free pin write tools
 * create_pin/set_pin_metadata/update_pin (#122) and the scheduling tools
 * schedule_pins/unschedule_pin (#123). The handler exposes these unless a test
 * injects its own set; feature-gated tools are filtered per tenant at
 * registration time.
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
  schedulePinsTool,
  unschedulePinTool,
  listBoardsTool,
  getDashboardStatsTool,
  listPublishEventsTool,
] as unknown as ReadonlyArray<McpToolDefinition<never>>

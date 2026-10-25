import type { McpToolDefinition } from '../tool'
import { getProfile } from './account'
import { getProject, listProjects } from './projects'
import { getArticleTool, listArticlesTool } from './articles'
import { getPinStatusCountsTool, getPinTool, listPinsTool } from './pins'
import {
  createPinTool,
  requestPinUploadTool,
  setPinMetadataTool,
  updatePinTool,
} from './pins-write'
import { schedulePinsTool, unschedulePinTool } from './pins-schedule'
import {
  addArticleTool,
  archiveArticleTool,
  generateMetadataTool,
  restoreArticleTool,
  scrapeArticleTool,
  scrapeBlogTool,
} from './articles-write'
import { listBoardsTool } from './boards'
import { getDashboardStatsTool } from './dashboard'
import { listPublishEventsTool } from './publish-events'
import { werkstattTools } from './werkstatt'

/**
 * The full MCP tool registry (Spec #115). v1 grows area by area: the account
 * tracer (#119), the ten read tools (#121), the Gemini-free pin write tools
 * create_pin/set_pin_metadata/update_pin (#122) plus request_pin_upload (#135), the scheduling tools
 * schedule_pins/unschedule_pin (#123) and the article/scraping/metadata tools
 * (#124). The handler exposes these unless a test injects its own set;
 * feature-gated tools are filtered per tenant at registration time. The
 * Werkstatt tools (#125) are gated behind `pin_werkstatt` and only surface for
 * tenants with that feature.
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
  requestPinUploadTool,
  createPinTool,
  setPinMetadataTool,
  updatePinTool,
  schedulePinsTool,
  unschedulePinTool,
  addArticleTool,
  archiveArticleTool,
  restoreArticleTool,
  scrapeBlogTool,
  scrapeArticleTool,
  generateMetadataTool,
  listBoardsTool,
  getDashboardStatsTool,
  listPublishEventsTool,
  ...werkstattTools,
] as unknown as ReadonlyArray<McpToolDefinition<never>>

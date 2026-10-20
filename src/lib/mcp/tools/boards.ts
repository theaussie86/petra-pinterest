import { z } from 'zod'
import { defineTool, errorResult, jsonResult } from '../tool'

/**
 * `list_boards` — the Pinterest boards of one project, so the agent can pick a
 * board for a pin (Spec #115, user story 25). Boards come live from Pinterest
 * (not the database): the handler delegates to `ctx.listBoards`, which resolves
 * the project's connection and reads the Vault token server-side (ADR-0006).
 */
export const listBoardsTool = defineTool({
  name: 'list_boards',
  description:
    'Listet die Pinterest-Boards des angegebenen Projekts (pinterest_board_id und Name), damit der Agent ein passendes Board wählt. Erfordert ein mit Pinterest verbundenes Projekt.',
  inputSchema: {
    project_id: z
      .string()
      .describe('Die ID des Blog-Projekts, dessen verbundene Boards gelistet werden.'),
  },
  handler: async ({ input, ctx }) => {
    if (!ctx.listBoards) {
      return errorResult('Board-Abruf ist in diesem Kontext nicht verfügbar.')
    }
    try {
      const boards = await ctx.listBoards(input.project_id)
      return jsonResult({ count: boards.length, boards })
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : 'Boards konnten nicht geladen werden.',
      )
    }
  },
})

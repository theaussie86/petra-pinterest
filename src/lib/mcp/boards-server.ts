import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/server/supabase'
import { fetchPinterestBoards } from '@/lib/server/pinterest-api'
import type { McpBoard } from './context'

/**
 * Builds the `listBoards` capability for an MCP user context (ADR-0006).
 *
 * The user-token client (RLS) resolves the project and its
 * `pinterest_connection_id`, so a Connected Agent only ever reaches its own
 * projects. The access token then comes from Vault via the service-role client
 * (migration 00030 restricts that RPC to service), and the boards are fetched
 * live from the Pinterest API. This is the one place the service role is used,
 * and only to read a token the agent is entitled to — never for tool data.
 */
export function createBoardLister(userClient: SupabaseClient) {
  return async (projectId: string): Promise<McpBoard[]> => {
    const { data: project, error: projectError } = await userClient
      .from('blog_projects')
      .select('pinterest_connection_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      throw new Error('Blog-Projekt nicht gefunden oder kein Zugriff.')
    }
    if (!project.pinterest_connection_id) {
      throw new Error('Für dieses Projekt ist kein Pinterest-Konto verbunden.')
    }

    const service = getSupabaseServiceClient()
    const { data: token, error: vaultError } = await service.rpc(
      'get_pinterest_access_token',
      { p_connection_id: project.pinterest_connection_id },
    )
    if (vaultError || !token) {
      throw new Error('Pinterest-Zugriffstoken konnte nicht geladen werden.')
    }

    const boards = await fetchPinterestBoards(token)
    return boards.map((board) => ({
      pinterest_board_id: board.id,
      name: board.name,
    }))
  }
}

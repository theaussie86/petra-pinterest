import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { fetchPinterestBoards } from './pinterest-api'

/**
 * Server function: Fetch boards directly from Pinterest API
 * Returns boards as { pinterest_board_id, name }[] without storing them in DB
 */
export const fetchPinterestBoardsFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data: { blog_project_id } }) => {
    try {
      const supabase = getSupabaseServerClient()
      const serviceSupabase = getSupabaseServiceClient()

      // Authenticate user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        return { success: false as const, error: 'Not authenticated', boards: [] }
      }

      // Get tenant_id from profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        return { success: false as const, error: 'Profile not found', boards: [] }
      }

      // Fetch blog_project, verify tenant ownership, get pinterest_connection_id
      const { data: project, error: projectError } = await supabase
        .from('blog_projects')
        .select('pinterest_connection_id')
        .eq('id', blog_project_id)
        .eq('tenant_id', profile.tenant_id)
        .single()

      if (projectError || !project) {
        return {
          success: false as const,
          error: 'Blog project not found or access denied',
          boards: [],
        }
      }

      if (!project.pinterest_connection_id) {
        return { success: false as const, error: 'No Pinterest account connected', boards: [] }
      }

      // Get access token from Vault using service client
      const { data: tokenData, error: vaultError } = await serviceSupabase.rpc(
        'get_pinterest_access_token',
        { p_connection_id: project.pinterest_connection_id },
      )

      if (vaultError || !tokenData) {
        return { success: false as const, error: 'Could not retrieve access token', boards: [] }
      }

      // Call Pinterest API to get all boards
      const pinterestBoards = await fetchPinterestBoards(tokenData)

      return {
        success: true as const,
        boards: pinterestBoards.map((board) => ({
          pinterest_board_id: board.id,
          name: board.name,
        })),
      }
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to fetch boards',
        boards: [],
      }
    }
  })

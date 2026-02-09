import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { fetchPinterestBoards } from './pinterest-api'

/**
 * Server function: Sync boards from Pinterest API
 * Replaces all existing boards for the blog project with fresh data from Pinterest
 */
export const syncPinterestBoardsFn = createServerFn({ method: 'POST' })
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
        return { success: false, error: 'Not authenticated' }
      }

      // Get tenant_id from profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        return { success: false, error: 'Profile not found' }
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
          success: false,
          error: 'Blog project not found or access denied',
        }
      }

      if (!project.pinterest_connection_id) {
        return { success: false, error: 'No Pinterest account connected' }
      }

      // Get access token from Vault using service client
      const { data: tokenData, error: vaultError } = await serviceSupabase.rpc(
        'get_pinterest_access_token',
        { p_connection_id: project.pinterest_connection_id },
      )

      if (vaultError || !tokenData) {
        return { success: false, error: 'Could not retrieve access token' }
      }

      // Call Pinterest API to get all boards
      const pinterestBoards = await fetchPinterestBoards(tokenData)

      // Replace boards: delete all existing boards for this project
      const { error: deleteError } = await supabase
        .from('pinterest_boards')
        .delete()
        .eq('blog_project_id', blog_project_id)

      if (deleteError) {
        return { success: false, error: 'Failed to clear existing boards' }
      }

      // Insert new boards from Pinterest
      if (pinterestBoards.length > 0) {
        const newBoards = pinterestBoards.map((board) => ({
          tenant_id: profile.tenant_id,
          blog_project_id,
          name: board.name,
          pinterest_board_id: board.id,
          cover_image_url: board.media?.image_cover_url || null,
        }))

        const { error: insertError } = await supabase
          .from('pinterest_boards')
          .insert(newBoards)

        if (insertError) {
          return { success: false, error: 'Failed to insert boards' }
        }
      }

      return { success: true, synced_count: pinterestBoards.length }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to sync boards',
      }
    }
  })

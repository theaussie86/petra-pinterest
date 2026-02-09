import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import {
  exchangePinterestCode,
  fetchPinterestUser,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from './pinterest-api'

/**
 * Server function: Initiate Pinterest OAuth flow
 * Returns authorization URL for user to navigate to
 */
export const initPinterestOAuthFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data: { blog_project_id } }) => {
    try {
      const supabase = getSupabaseServerClient()

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

      // Verify blog_project_id belongs to user's tenant
      const { data: project, error: projectError } = await supabase
        .from('blog_projects')
        .select('id')
        .eq('id', blog_project_id)
        .eq('tenant_id', profile.tenant_id)
        .single()

      if (projectError || !project) {
        return {
          success: false,
          error: 'Blog project not found or access denied',
        }
      }

      // Generate PKCE parameters
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const state = generateState()

      // Store state mapping
      const { error: stateError } = await supabase
        .from('oauth_state_mapping')
        .insert({
          state,
          code_verifier: codeVerifier,
          blog_project_id,
          tenant_id: profile.tenant_id,
          user_id: user.id,
        })

      if (stateError) {
        return {
          success: false,
          error: 'Failed to initialize OAuth flow',
        }
      }

      // Build Pinterest OAuth authorization URL
      const appId = process.env.PINTEREST_APP_ID
      const redirectUri = process.env.PINTEREST_REDIRECT_URI

      if (!appId || !redirectUri) {
        return {
          success: false,
          error: 'Pinterest OAuth not configured',
        }
      }

      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'boards:read,boards:write,pins:read,pins:write',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })

      const authUrl = `https://www.pinterest.com/oauth/?${params.toString()}`

      return { success: true, authUrl }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to initiate OAuth',
      }
    }
  })

/**
 * Server function: Exchange OAuth callback code for tokens
 * Stores tokens in Vault and links connection to blog project
 */
export const exchangePinterestCallbackFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { code: string; state: string }) => data)
  .handler(async ({ data: { code, state } }) => {
    try {
      const supabase = getSupabaseServerClient()
      const serviceSupabase = getSupabaseServiceClient()

      // Look up state in oauth_state_mapping
      const { data: stateRow, error: stateError } = await supabase
        .from('oauth_state_mapping')
        .select('*')
        .eq('state', state)
        .single()

      if (stateError || !stateRow) {
        return {
          success: false,
          error: 'Invalid or expired state',
        }
      }

      // Verify state hasn't expired (created_at + 10 min > now)
      const expiresAt = new Date(stateRow.expires_at)
      if (expiresAt < new Date()) {
        // Clean up expired state
        await supabase
          .from('oauth_state_mapping')
          .delete()
          .eq('id', stateRow.id)

        return {
          success: false,
          error: 'OAuth state expired',
        }
      }

      // Exchange code for tokens
      const tokens = await exchangePinterestCode(code, stateRow.code_verifier)

      // Fetch Pinterest user info
      const pinterestUser = await fetchPinterestUser(tokens.access_token)

      // Calculate token expiration
      const tokenExpiresAt = new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString()

      // Check if connection already exists for this (tenant_id, pinterest_user_id)
      const { data: existingConnection } = await supabase
        .from('pinterest_connections')
        .select('id')
        .eq('tenant_id', stateRow.tenant_id)
        .eq('pinterest_user_id', pinterestUser.id)
        .single()

      let connectionId: string

      if (existingConnection) {
        // Update existing connection
        const { error: updateError } = await supabase
          .from('pinterest_connections')
          .update({
            pinterest_username: pinterestUser.username,
            scope: tokens.scope,
            token_expires_at: tokenExpiresAt,
            is_active: true,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConnection.id)

        if (updateError) {
          throw new Error('Failed to update connection')
        }

        connectionId = existingConnection.id
      } else {
        // Create new connection
        const { data: newConnection, error: insertError } = await supabase
          .from('pinterest_connections')
          .insert({
            tenant_id: stateRow.tenant_id,
            pinterest_user_id: pinterestUser.id,
            pinterest_username: pinterestUser.username,
            scope: tokens.scope,
            token_expires_at: tokenExpiresAt,
            is_active: true,
          })
          .select('id')
          .single()

        if (insertError || !newConnection) {
          throw new Error('Failed to create connection')
        }

        connectionId = newConnection.id
      }

      // Store tokens in Vault using service role client
      const { error: vaultError } = await serviceSupabase.rpc(
        'store_pinterest_tokens',
        {
          p_connection_id: connectionId,
          p_access_token: tokens.access_token,
          p_refresh_token: tokens.refresh_token,
        },
      )

      if (vaultError) {
        throw new Error('Failed to store tokens in Vault')
      }

      // Update blog_projects.pinterest_connection_id
      const { error: projectUpdateError } = await supabase
        .from('blog_projects')
        .update({ pinterest_connection_id: connectionId })
        .eq('id', stateRow.blog_project_id)

      if (projectUpdateError) {
        throw new Error('Failed to link connection to project')
      }

      // Clean up state mapping
      await supabase
        .from('oauth_state_mapping')
        .delete()
        .eq('id', stateRow.id)

      return {
        success: true,
        blog_project_id: stateRow.blog_project_id,
        pinterest_username: pinterestUser.username,
      }
    } catch (error) {
      // Clean up state mapping on any error
      try {
        const supabase = getSupabaseServerClient()
        await supabase
          .from('oauth_state_mapping')
          .delete()
          .eq('state', state)
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to complete OAuth flow',
      }
    }
  })

/**
 * Server function: Disconnect Pinterest account from blog project
 * Removes connection link and cleans up tokens if no other projects use the connection
 */
export const disconnectPinterestFn = createServerFn({ method: 'POST' })
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

      // Fetch blog_project to get pinterest_connection_id, verify tenant ownership
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

      // If no connection, already disconnected
      if (!project.pinterest_connection_id) {
        return { success: true }
      }

      const connectionId = project.pinterest_connection_id

      // Set blog_projects.pinterest_connection_id to null
      const { error: unlinkError } = await supabase
        .from('blog_projects')
        .update({ pinterest_connection_id: null })
        .eq('id', blog_project_id)

      if (unlinkError) {
        return { success: false, error: 'Failed to disconnect connection' }
      }

      // Check if any OTHER blog_projects still reference this connection_id
      const { data: otherProjects, error: checkError } = await supabase
        .from('blog_projects')
        .select('id')
        .eq('pinterest_connection_id', connectionId)
        .eq('tenant_id', profile.tenant_id)

      if (checkError) {
        return {
          success: false,
          error: 'Failed to check for other connections',
        }
      }

      // If no other projects use this connection, delete it and its tokens
      if (!otherProjects || otherProjects.length === 0) {
        // Delete tokens from Vault
        const { error: vaultError } = await serviceSupabase.rpc(
          'delete_pinterest_tokens',
          { p_connection_id: connectionId },
        )

        if (vaultError) {
          // Log error but don't fail the operation
          console.error('Failed to delete tokens from Vault:', vaultError)
        }

        // Delete the pinterest_connections row
        const { error: deleteError } = await supabase
          .from('pinterest_connections')
          .delete()
          .eq('id', connectionId)

        if (deleteError) {
          return { success: false, error: 'Failed to delete connection' }
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to disconnect',
      }
    }
  })

/**
 * Server function: Get Pinterest connection status for a blog project
 * Returns connection info if connected, otherwise null
 */
export const getPinterestConnectionFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data: { blog_project_id } }) => {
    try {
      const supabase = getSupabaseServerClient()

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

      // Fetch blog_project with pinterest_connection_id, verify tenant ownership
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

      // If no pinterest_connection_id, not connected
      if (!project.pinterest_connection_id) {
        return { success: true, connected: false }
      }

      // Fetch the pinterest_connections row
      const { data: connection, error: connectionError } = await supabase
        .from('pinterest_connections')
        .select(
          'id, pinterest_username, is_active, last_error, token_expires_at',
        )
        .eq('id', project.pinterest_connection_id)
        .single()

      if (connectionError || !connection) {
        return { success: true, connected: false }
      }

      return {
        success: true,
        connected: true,
        connection: {
          id: connection.id,
          pinterest_username: connection.pinterest_username,
          is_active: connection.is_active,
          last_error: connection.last_error,
          token_expires_at: connection.token_expires_at,
        },
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get connection status',
      }
    }
  })

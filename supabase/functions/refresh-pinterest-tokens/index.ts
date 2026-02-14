import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { refreshPinterestToken } from '../_shared/pinterest-api.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()

    // Find connections with tokens expiring within 7 days
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

    const { data: connections, error: fetchError } = await supabase
      .from('pinterest_connections')
      .select('*')
      .eq('is_active', true)
      .lt('token_expires_at', sevenDaysFromNow.toISOString())

    if (fetchError) {
      throw new Error(
        `Failed to fetch connections: ${fetchError.message}`
      )
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          total: 0,
          refreshed: 0,
          failed: 0,
          message: 'No tokens need refreshing',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let totalRefreshed = 0
    let totalFailed = 0
    const details: Array<{
      connection_id: string
      success: boolean
      error?: string
    }> = []

    // Process each connection
    for (const connection of connections) {
      try {
        // Get refresh token from Vault
        const { data: refreshTokenData, error: vaultError } =
          await supabase.rpc('get_pinterest_refresh_token', {
            p_connection_id: connection.id,
          })

        if (vaultError || !refreshTokenData) {
          throw new Error(
            `Failed to retrieve refresh token: ${vaultError?.message || 'Unknown error'}`
          )
        }

        const refreshToken = refreshTokenData as string

        // Call Pinterest API to refresh tokens
        const tokenResponse = await refreshPinterestToken(refreshToken)

        // Calculate new expiration time
        const expiresAt = new Date()
        expiresAt.setSeconds(
          expiresAt.getSeconds() + tokenResponse.expires_in
        )

        // Store new tokens in Vault
        const { error: storeError } = await supabase.rpc(
          'store_pinterest_tokens',
          {
            p_connection_id: connection.id,
            p_access_token: tokenResponse.access_token,
            p_refresh_token: tokenResponse.refresh_token,
          }
        )

        if (storeError) {
          throw new Error(
            `Failed to store new tokens: ${storeError.message}`
          )
        }

        // Update connection with new expiration time
        await supabase
          .from('pinterest_connections')
          .update({
            token_expires_at: expiresAt.toISOString(),
            last_error: null,
          })
          .eq('id', connection.id)

        totalRefreshed++
        details.push({ connection_id: connection.id, success: true })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        // Mark connection as inactive on refresh failure
        await supabase
          .from('pinterest_connections')
          .update({
            is_active: false,
            last_error: `Token refresh failed: ${errorMessage}`,
          })
          .eq('id', connection.id)

        totalFailed++
        details.push({
          connection_id: connection.id,
          success: false,
          error: errorMessage,
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: connections.length,
        refreshed: totalRefreshed,
        failed: totalFailed,
        details,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[refresh-pinterest-tokens] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

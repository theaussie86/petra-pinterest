import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { createPinterestPin } from '../../../src/lib/server/pinterest-api'
import type { PinterestCreatePinPayload } from '../../../src/types/pinterest'

export const publishScheduledPins = inngest.createFunction(
  { id: 'publish-scheduled-pins', retries: 0 },
  { cron: 'TZ=UTC */15 * * * *' }, // Every 15 minutes
  async ({ step }) => {
    // Create service-role Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Find pins due for publishing
    const { data: pins, error: fetchError } = await supabase
      .from('pins')
      .select('*, blog_articles(url), boards(pinterest_board_id), blog_projects(pinterest_connection_id)')
      .eq('status', 'ready_to_schedule')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', new Date().toISOString())
      .not('blog_projects.pinterest_connection_id', 'is', null)

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled pins: ${fetchError.message}`)
    }

    if (!pins || pins.length === 0) {
      return { published: 0, failed: 0, message: 'No pins to publish' }
    }

    // Group pins by pinterest_connection_id for batch token retrieval
    const pinsByConnection = new Map<string, typeof pins>()
    for (const pin of pins) {
      const connectionId = pin.blog_projects?.pinterest_connection_id
      if (!connectionId) continue

      if (!pinsByConnection.has(connectionId)) {
        pinsByConnection.set(connectionId, [])
      }
      pinsByConnection.get(connectionId)!.push(pin)
    }

    let totalPublished = 0
    let totalFailed = 0
    const details: Array<{ pin_id: string; success: boolean; error?: string }> = []

    // Process each connection group
    for (const [connectionId, connectionPins] of pinsByConnection) {
      // Retrieve access token from Vault
      const tokenResult = await step.run(
        `get-token-${connectionId}`,
        async () => {
          const { data: tokenData, error: tokenError } = await supabase.rpc(
            'get_pinterest_access_token',
            { p_connection_id: connectionId }
          )

          if (tokenError || !tokenData) {
            return { success: false, error: tokenError?.message || 'Failed to retrieve token' }
          }

          return { success: true, token: tokenData as string }
        }
      )

      if (!tokenResult.success) {
        // Mark all pins in this group as error
        for (const pin of connectionPins) {
          await supabase
            .from('pins')
            .update({
              status: 'error',
              error_message: `Token retrieval failed: ${tokenResult.error}`,
            })
            .eq('id', pin.id)

          details.push({ pin_id: pin.id, success: false, error: tokenResult.error })
          totalFailed++
        }
        continue
      }

      const accessToken = tokenResult.token!

      // Process pins sequentially with delay
      for (let i = 0; i < connectionPins.length; i++) {
        const pin = connectionPins[i]

        const result = await step.run(`publish-pin-${pin.id}`, async () => {
          try {
            // Validate pin has required fields
            if (!pin.boards?.pinterest_board_id) {
              throw new Error('Pin must have a Pinterest board assigned')
            }

            if (!pin.image_path) {
              throw new Error('Pin must have an image')
            }

            // Update status to 'publishing'
            await supabase
              .from('pins')
              .update({ status: 'publishing' })
              .eq('id', pin.id)

            // Get public URL for pin image
            const imagePublicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.image_path}`

            // Build Pinterest API payload
            const payload: PinterestCreatePinPayload = {
              board_id: pin.boards.pinterest_board_id,
              media_source: {
                source_type: 'image_url',
                url: imagePublicUrl,
              },
            }

            // Add optional fields (with length limits)
            if (pin.title) {
              payload.title = pin.title.substring(0, 100)
            }
            if (pin.description) {
              payload.description = pin.description.substring(0, 800)
            }
            if (pin.alt_text) {
              payload.alt_text = pin.alt_text.substring(0, 500)
            }
            if (pin.blog_articles?.url) {
              payload.link = pin.blog_articles.url
            }

            // Call Pinterest API with retry logic
            let attempts = 0
            const maxAttempts = 3
            let lastError: Error | null = null

            while (attempts < maxAttempts) {
              try {
                const apiResult = await createPinterestPin(accessToken, payload)

                // Success: update pin
                await supabase
                  .from('pins')
                  .update({
                    status: 'published',
                    published_at: new Date().toISOString(),
                    pinterest_pin_id: apiResult.id,
                    pinterest_pin_url: `https://www.pinterest.com/pin/${apiResult.id}/`,
                  })
                  .eq('id', pin.id)

                return { success: true, pinterest_pin_id: apiResult.id }
              } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))

                // Check for rate limit (429)
                if (lastError.message.includes('429')) {
                  attempts++
                  if (attempts < maxAttempts) {
                    // Exponential backoff: 2^attempt * 1000ms
                    const delay = Math.pow(2, attempts) * 1000
                    await new Promise((resolve) => setTimeout(resolve, delay))
                    continue
                  }
                }

                // Check for auth failure (401)
                if (lastError.message.includes('401')) {
                  // Mark connection as inactive
                  await supabase
                    .from('pinterest_connections')
                    .update({
                      is_active: false,
                      last_error: 'Authentication failed - token expired or revoked',
                    })
                    .eq('id', connectionId)
                }

                throw lastError
              }
            }

            throw lastError || new Error('Max retry attempts exceeded')
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)

            // Update pin with error status
            await supabase
              .from('pins')
              .update({
                status: 'error',
                error_message: errorMessage,
              })
              .eq('id', pin.id)

            return { success: false, error: errorMessage }
          }
        })

        if (result.success) {
          totalPublished++
          details.push({ pin_id: pin.id, success: true })
        } else {
          totalFailed++
          details.push({ pin_id: pin.id, success: false, error: result.error })
        }

        // Add 10-second delay between pins (except after last pin)
        if (i < connectionPins.length - 1) {
          await step.sleep('rate-limit-delay', 10000)
        }
      }
    }

    return {
      total: pins.length,
      published: totalPublished,
      failed: totalFailed,
      details,
    }
  }
)

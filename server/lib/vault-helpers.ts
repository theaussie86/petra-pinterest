import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retrieve the decrypted Gemini API key for a blog project from Supabase Vault.
 * Works with any Supabase client (server-side cookie client or service-role client).
 * Throws a user-friendly error if no key is configured.
 */
export async function getGeminiApiKeyFromVault(
  supabase: SupabaseClient,
  blogProjectId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('get_gemini_api_key', {
    p_blog_project_id: blogProjectId,
  })

  if (error) {
    throw new Error(`Failed to retrieve Gemini API key: ${error.message}`)
  }

  if (!data) {
    throw new Error(
      'No Gemini API key configured for this project. Go to Project Settings to add your key.'
    )
  }

  return data as string
}

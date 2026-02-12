import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'

/**
 * Server function: Store a Gemini API key for a blog project.
 * Encrypts the key in Supabase Vault — the decrypted value never leaves the server.
 */
export const storeGeminiKeyFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { blog_project_id: string; api_key: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Verify project belongs to user's tenant
    const { data: project, error: projectError } = await supabase
      .from('blog_projects')
      .select('id')
      .eq('id', data.blog_project_id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (projectError || !project) {
      throw new Error('Blog project not found or access denied')
    }

    // Store key in Vault via service client (SECURITY DEFINER RPC needs service role)
    const serviceSupabase = getSupabaseServiceClient()
    const { error: vaultError } = await serviceSupabase.rpc(
      'store_gemini_api_key',
      {
        p_blog_project_id: data.blog_project_id,
        p_api_key: data.api_key,
      }
    )

    if (vaultError) {
      throw new Error('Failed to store API key')
    }

    return { success: true }
  })

/**
 * Server function: Delete the Gemini API key for a blog project.
 */
export const deleteGeminiKeyFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Verify project belongs to user's tenant
    const { data: project, error: projectError } = await supabase
      .from('blog_projects')
      .select('id')
      .eq('id', data.blog_project_id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (projectError || !project) {
      throw new Error('Blog project not found or access denied')
    }

    const serviceSupabase = getSupabaseServiceClient()
    const { error: vaultError } = await serviceSupabase.rpc(
      'delete_gemini_api_key',
      { p_blog_project_id: data.blog_project_id }
    )

    if (vaultError) {
      throw new Error('Failed to delete API key')
    }

    return { success: true }
  })

/**
 * Server function: Check if a Gemini API key exists for a blog project.
 * Returns { has_key: boolean } — the decrypted key never leaves the server.
 */
export const getGeminiKeyStatusFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { blog_project_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Verify project belongs to user's tenant
    const { data: project, error: projectError } = await supabase
      .from('blog_projects')
      .select('id')
      .eq('id', data.blog_project_id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (projectError || !project) {
      throw new Error('Blog project not found or access denied')
    }

    const serviceSupabase = getSupabaseServiceClient()
    const { data: hasKey, error: vaultError } = await serviceSupabase.rpc(
      'has_gemini_api_key',
      { p_blog_project_id: data.blog_project_id }
    )

    if (vaultError) {
      throw new Error('Failed to check API key status')
    }

    return { has_key: !!hasKey }
  })

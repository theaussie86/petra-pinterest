/**
 * Supabase Admin Client
 * Uses service role key to bypass RLS for migration scripts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SECRET_KEY!

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set')
}

/**
 * Supabase admin client with service role key
 * Bypasses RLS for migration scripts that need to write data for specific tenants
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

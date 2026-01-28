import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env.local and fill in your project values.',
  )
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

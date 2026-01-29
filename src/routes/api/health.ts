import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const envCheck = {
          SUPABASE_URL: !!process.env.SUPABASE_URL,
          SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
          SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY,
          VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY:
            !!process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          NODE_ENV: process.env.NODE_ENV,
          VERCEL: !!process.env.VERCEL,
        }
        return new Response(JSON.stringify(envCheck, null, 2), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})

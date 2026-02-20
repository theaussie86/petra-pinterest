import { loadEnv } from 'vite'

const env = loadEnv('', process.cwd(), 'VITE_')
const supabaseHostname = env.VITE_SUPABASE_URL
  ? new URL(env.VITE_SUPABASE_URL).hostname
  : ''

export default {
  vercel: {
    images: {
      domains: supabaseHostname ? [supabaseHostname] : [],
      sizes: [48, 96, 128, 256, 384, 640, 750, 800, 828, 1080, 1200, 1920, 2048, 3840],
      formats: ['image/webp'],
      minimumCacheTTL: 60,
      dangerouslyAllowSVG: false,
    },
  },
}

import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  // Load all env vars from .env.local (not just VITE_ prefixed)
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    server: {
      port: 3000,
    },
    plugins: [
      tsConfigPaths(),
      devtools(),
      tanstackStart(),
      tailwindcss(),
    ],
  }
})

import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

function apiMiddleware(): Plugin {
  let handler: any = null

  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        if (!handler) {
          const { app } = await import('./server/app')
          handler = app
        }

        handler(req, res, next)
      })
    },
  }
}

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
      apiMiddleware(),
      devtools(),
      tanstackStart(),
      tailwindcss(),
    ],
  }
})

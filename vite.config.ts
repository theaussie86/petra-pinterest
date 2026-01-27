import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { TanStackStartVitePlugin as tanstackStart } from '@tanstack/start/vite'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    tailwindcss(),
    viteReact()
  ],
  server: {
    port: 3000
  }
})

import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tsConfigPaths(),
    devtools(),
    tanstackStart(),
    tailwindcss(),
  ],
})

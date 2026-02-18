import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/lib/hooks/**', 'src/test/**'],
    },
  },
  resolve: {
    alias: {
      '@/': resolve(__dirname, 'src') + '/',
    },
  },
})

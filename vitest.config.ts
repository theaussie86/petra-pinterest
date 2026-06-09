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
      // The Deno edge mirror (`supabase/functions/_shared/ai.ts`) imports the AI
      // SDK via `npm:` specifiers. Map them to the installed Node packages so the
      // mirror can be exercised under vitest for Node/Deno parity tests.
      'npm:ai': 'ai',
      'npm:@ai-sdk/google': '@ai-sdk/google',
      'npm:zod': 'zod',
      // Deno-only side-effect import (ambient Edge-runtime types) with no Node
      // equivalent; stub it so Edge functions can be loaded under vitest.
      'jsr:@supabase/functions-js/edge-runtime.d.ts': resolve(
        __dirname,
        'src/test/mocks/empty-module.ts',
      ),
    },
  },
})

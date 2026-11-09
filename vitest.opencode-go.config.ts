import { defineConfig } from 'vitest/config'
import { googleFetchVitePlugin } from './scripts/google-fetch-bridge.mjs'
export default defineConfig({
  plugins: [googleFetchVitePlugin()],
  test: {
    setupFiles: ['tests/opencode-go/setup.ts'],
    include: ['tests/opencode-go/*.spec.ts', 'tests/opencode-go/*.client.spec.tsx'],
    testTimeout: 15000,
    sequence: { hooks: 'stack' },
    server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives', 'opencode-go-pi-ai', '@google/genai'] } },
  },
})

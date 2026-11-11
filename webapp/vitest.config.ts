import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./vitest.setup.ts'],
      // Node 25+ ships a built-in `localStorage` global that is undefined
      // unless --localstorage-file is given. Vitest keeps existing Node
      // globals, so it shadows happy-dom's Storage and every
      // localStorage.* call throws. Turning the Node feature off lets
      // happy-dom's implementation through. Node 22 accepts the flag too.
      execArgv: ['--no-experimental-webstorage'],
      include: ['src/**/*.{test,spec}.{js,ts}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/**/*.{test,spec}.{js,ts}',
          'src/**/__tests__/**',
          'src/main.ts',
          'src/router/**',
          'src/types/**',
          'src/assets/**',
        ],
        // Minimum coverage the suite must hit; CI fails if any metric
        // drops below these numbers. Set a few points below the current
        // baseline so small, incidental changes don't flicker CI red.
        thresholds: {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
      },
    },
  }),
)

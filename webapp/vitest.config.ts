import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      root: fileURLToPath(new URL('./', import.meta.url)),
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
        // Current as of 2026-04-10: stmts 96.36 / branch 91.48 / funcs 97.01 / lines 98.06.
        thresholds: {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  }),
)

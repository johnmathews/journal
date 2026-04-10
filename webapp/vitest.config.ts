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
      },
    },
  }),
)

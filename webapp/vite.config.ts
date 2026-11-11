import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Anchored regex so only real API paths (/api/...) are proxied.
      // A plain '/api' prefix also matched SPA routes like /api-keys,
      // which made hard refreshes on those routes return the backend's
      // raw 404 instead of index.html. Prod nginx is unaffected — its
      // location block is already '/api/' (trailing slash).
      '^/api/': {
        target: 'http://localhost:8400',
        changeOrigin: true,
      },
    },
  },
})

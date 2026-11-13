import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: forward API calls to the NestJS app, so the browser sees one origin (no CORS).
    // In production NestJS serves the built frontend itself.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
  },
})

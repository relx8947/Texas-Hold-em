import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// During `vite dev` (port 5173) the Go backend runs on :8080. Proxy /ws and the
// health endpoints so the default same-origin WebSocket URL works without extra
// config. Override the backend with VITE_DEV_BACKEND if needed.
const devBackend = process.env.VITE_DEV_BACKEND || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: devBackend, ws: true, changeOrigin: true },
      '/healthz': { target: devBackend, changeOrigin: true },
      '/readyz': { target: devBackend, changeOrigin: true },
    },
  },
})

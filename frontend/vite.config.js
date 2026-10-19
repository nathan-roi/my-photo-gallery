import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // En dev, les appels à /api sont relayés vers l'API locale : le code du front
    // utilise des URL relatives, comme derrière le proxy nginx et l'Ingress.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

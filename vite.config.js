import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, `npm run dev` levanta Vite y reenvía /api al Worker local (`npm run dev:api`, puerto 8787).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // If needed, allow reading assets from one level up during dev.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:5174',
        changeOrigin: true,
      },
      '/assets': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
})

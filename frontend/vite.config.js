import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "https://satquery.onrender.com",
        changeOrigin: true,
      },
      "/media": {
        target: process.env.VITE_API_BASE_URL || "https://satquery.onrender.com",
        changeOrigin: true,
      },
    },
  },
})

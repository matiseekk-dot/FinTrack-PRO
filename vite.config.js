import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/FinTrack-PRO/',
  build: {
    // Prevent TDZ errors by not inlining module preload
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Split vendor chunks to prevent circular evaluation order
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'charts-vendor': ['recharts'],
          'icons-vendor': ['lucide-react'],
        }
      }
    }
  }
})

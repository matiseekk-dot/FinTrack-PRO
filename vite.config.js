import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/FinTrack-PRO/',
  build: {
    // Code splitting — rozbij bundle na mniejsze chunks
    rollupOptions: {
      output: {
        manualChunks: {
          // React + ReactDOM — stabilny, rzadko się zmienia, dobry cache
          'react-vendor': ['react', 'react-dom'],
          // Recharts — duży ~300KB, ładowany tylko gdy user wchodzi na Analizę
          'recharts': ['recharts'],
          // Firebase — ~400KB, ładowane przy logowaniu
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/messaging'],
          // Lucide icons — ~150KB, ładowane zawsze
          'icons': ['lucide-react'],
          // XLSX — ~200KB, używane tylko przy import/export
          'xlsx': ['xlsx'],
        },
      },
    },
    // Zwiększ próg warning bo mamy świadomie duży bundle
    chunkSizeWarningLimit: 600,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

// Plugin: po build podmień __APP_VERSION__ w dist/sw.js. Vite `define` nie dotyka
// plików z public/ — są kopiowane 1:1. Bez tego CACHE_NAME w SW byłby literałem
// "__APP_VERSION__" zamiast realnej wersji, więc cache nie byłby invalidowany
// po deployu nowej wersji.
const swVersionPlugin = () => ({
  name: 'sw-version-replace',
  closeBundle() {
    const swPath = resolve(__dirname, 'dist', 'sw.js');
    if (existsSync(swPath)) {
      const content = readFileSync(swPath, 'utf-8');
      writeFileSync(swPath, content.replace(/__APP_VERSION__/g, pkg.version), 'utf-8');
    }
  },
});

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  base: '/FinTrack-PRO/',
  // Inject wersji z package.json — używana w UI (SettingsPanel) i jako cache-busting
  // dla Service Workera. Bez tego mieliśmy hardcodowane "v1.1.0" w UI gdy package.json
  // był 1.3.9.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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

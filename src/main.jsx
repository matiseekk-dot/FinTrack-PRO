import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { setupGlobalHandlers } from './lib/errorTracking.js'
import { prefetchRates } from './lib/fx.js'

// Rejestruj globalne handlery dla unhandled errors + promise rejections.
// Bez tego błędy w runtime znikają bez śladu (errorTracking nie działa).
setupGlobalHandlers();

// Prefetch kursów NBP w tle (jeśli cache stary) — żeby przy pierwszej
// transakcji w EUR/USD user już miał świeże dane bez czekania.
prefetchRates();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

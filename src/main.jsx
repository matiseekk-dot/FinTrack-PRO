import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { setupGlobalHandlers } from './lib/errorTracking.js'

// Rejestruj globalne handlery dla unhandled errors + promise rejections.
// Bez tego błędy w runtime znikają bez śladu (errorTracking nie działa).
setupGlobalHandlers();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Prosty error tracking - logi lokalne + opcjonalny external service
 * 
 * Dla skali 1-10k userów Sentry SaaS jest drogi ($26/msc Business).
 * Własny prosty endpoint = darmowe.
 * 
 * Setup:
 * 1. Stwórz Firebase Cloud Function (lub Vercel serverless)
 * 2. Wklej URL do ERROR_ENDPOINT poniżej
 * 3. Function zapisuje do Firestore errors collection
 * 
 * Lub: nadstaw window.Sentry jeśli dodasz @sentry/react
 */

const ERROR_ENDPOINT = null;  // dodaj URL gdy masz function
const MAX_ERRORS_LOCAL = 50;  // rolling buffer w localStorage
const ERRORS_KEY = "ft_errors";

function getLocalErrors() {
  try {
    const raw = localStorage.getItem(ERRORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeLocalError(err) {
  try {
    const list = getLocalErrors();
    list.unshift(err);
    const trimmed = list.slice(0, MAX_ERRORS_LOCAL);
    localStorage.setItem(ERRORS_KEY, JSON.stringify(trimmed));
  } catch { /* localStorage full, ignore */ }
}

async function reportError(error, context = {}) {
  const err = {
    message: error?.message || String(error),
    stack: error?.stack?.substring(0, 2000) || null,
    url: window.location.href,
    userAgent: navigator.userAgent.substring(0, 200),
    timestamp: new Date().toISOString(),
    context,
  };
  
  // 1. Zawsze zapisuj lokalnie (user może zgłosić bug)
  storeLocalError(err);
  
  // 2. Sentry jeśli dostępne
  if (typeof window !== "undefined" && window.Sentry) {
    window.Sentry.captureException(error, { contexts: { ft: context } });
    return;
  }
  
  // 3. Custom endpoint jeśli ustawiony
  if (ERROR_ENDPOINT) {
    try {
      await fetch(ERROR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(err),
      });
    } catch { /* fire and forget */ }
  }
  
  // 4. Fallback - console
  console.error("[FT Error]", err);
}

function setupGlobalHandlers() {
  // Unhandled exceptions
  window.addEventListener("error", (event) => {
    reportError(event.error || event.message, { type: "window_error", source: event.filename });
  });
  
  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { type: "unhandled_promise" });
  });
}

function exportErrorsForSupport() {
  const errors = getLocalErrors();
  return {
    errors,
    count: errors.length,
    lastError: errors[0]?.timestamp || null,
  };
}

function clearLocalErrors() {
  localStorage.removeItem(ERRORS_KEY);
}

export {
  reportError, setupGlobalHandlers,
  exportErrorsForSupport, clearLocalErrors,
  getLocalErrors,
};

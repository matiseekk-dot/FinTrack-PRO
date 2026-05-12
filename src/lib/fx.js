// Live FX rates z NBP API (Tabela A — kursy średnie).
//
// Strategia:
//   1. Cache w localStorage (24h TTL) — nie spamujemy NBP
//   2. Fetch on-demand: convertToPLN() zwraca cached rates (sync)
//      a w tle prefetch() odświeża cache jeśli stary
//   3. Fallback: gdy API down + brak cache → twarde stałe (kurs ~maj 2026)
//
// NBP API:
//   https://api.nbp.pl/api/exchangerates/tables/A?format=json
//   - Tabela A = kursy średnie, publikowane w dni robocze ~12:00
//   - Limit: ~100 req/min per IP, ale my fetchujemy raz na 24h, więc bezpieczne
//   - Brak CORS issues — NBP udostępnia z `Access-Control-Allow-Origin: *`
//
// UWAGA: kursy NBP są informacyjne. Bank zaksięguje kupno walutą po SWOIM
// kursie + spread. Dla trackera osobistego NBP wystarczy — to nie księga
// rachunkowa firmy.

import { checkLimit } from "./rateLimit.js";

const FX_CACHE_KEY = "ft_fx_cache_v1";
const FX_HIST_KEY  = "ft_fx_hist_v1";       // historyczne kursy: { "YYYY-MM-DD": { EUR: 4.28, ... } }
const FX_TTL_MS = 24 * 60 * 60 * 1000;      // 24h dla "current rates"
const FX_HIST_PRUNE_DAYS = 730;             // sprzątaj wpisy starsze niż 2 lata

// Fallback gdy: pierwszy uruchom + brak netu, lub NBP down + brak cache.
// Kursy z ~maja 2026, świadomie zaniżone żeby user widział że to fallback
// (a nie myślał że to live).
const FALLBACK_RATES = {
  EUR: 4.28,
  USD: 3.92,
  GBP: 5.02,
  CHF: 4.32,
  CZK: 0.172,
  HUF: 0.011,
  SEK: 0.37,
  NOK: 0.36,
  DKK: 0.57,
  JPY: 0.025,
};
const FALLBACK_DATE = "2026-05-01";

// Lista walut z NBP Tabeli A które wspieramy w UI.
// (Tabela A zawiera ich więcej, ale UI wystarczy 10 najpopularniejszych.)
const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CZK", "HUF", "SEK", "NOK", "DKK", "JPY"];

function getCachedRates() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.rates || !parsed.fetchedAt) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function setCachedRates(rates, date) {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
      rates, date, fetchedAt: Date.now(),
    }));
  } catch (_) { /* quota - ignore */ }
}

let inFlightPromise = null; // dedupe równoległych fetchów

async function fetchFromNBP() {
  if (inFlightPromise) return inFlightPromise;

  // Rate limit ochronny (rateLimit.js już ma 'nbpFx' = 50/min)
  const check = checkLimit("nbpFx");
  if (!check.allowed) {
    console.warn("[fx] NBP rate limit, używam cache");
    return null;
  }

  inFlightPromise = (async () => {
    try {
      const res = await fetch("https://api.nbp.pl/api/exchangerates/tables/A?format=json", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`NBP HTTP ${res.status}`);
      const data = await res.json();
      // Format: [{ table:"A", no:"...", effectiveDate:"YYYY-MM-DD", rates:[{currency:"...", code:"EUR", mid:4.2856}] }]
      if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0].rates)) {
        throw new Error("Nieprawidłowy format NBP");
      }
      const rates = {};
      for (const r of data[0].rates) {
        if (SUPPORTED_CURRENCIES.includes(r.code) && typeof r.mid === "number") {
          rates[r.code] = r.mid;
        }
      }
      const date = data[0].effectiveDate || new Date().toISOString().slice(0, 10);
      setCachedRates(rates, date);
      return { rates, date, source: "nbp" };
    } catch (e) {
      console.warn("[fx] NBP fetch failed:", e?.message || e);
      return null;
    } finally {
      inFlightPromise = null;
    }
  })();
  return inFlightPromise;
}

/**
 * Zwraca aktualne rates (sync) — z cache lub fallback.
 * Async refresh w tle jeśli cache stary lub brak.
 *
 * @returns {{ rates: Record<string, number>, date: string, source: "nbp"|"cache"|"fallback" }}
 */
function getCurrentRates() {
  const cached = getCachedRates();
  const isStale = !cached || (Date.now() - cached.fetchedAt) > FX_TTL_MS;

  if (isStale) {
    // Background refresh, nie blokuj UI
    fetchFromNBP();
  }

  if (cached && cached.rates) {
    return { rates: cached.rates, date: cached.date, source: "cache" };
  }
  return { rates: FALLBACK_RATES, date: FALLBACK_DATE, source: "fallback" };
}

/**
 * Konwersja sync (używa cache lub fallback). PLN → 1.0.
 *
 * @param {number} amount kwota w walucie source
 * @param {string} currency np. "EUR", "USD". Niewspierana waluta → traktowana jak PLN.
 * @returns {number} kwota w PLN
 */
function convertToPLN(amount, currency) {
  if (!currency || currency === "PLN") return Number(amount) || 0;
  const { rates } = getCurrentRates();
  const rate = rates[currency.toUpperCase()];
  if (typeof rate !== "number" || !isFinite(rate)) return Number(amount) || 0;
  return (Number(amount) || 0) * rate;
}

/**
 * Zwraca kurs konkretnej waluty (sync, z cache).
 * @returns {number} kurs lub 1 dla PLN, NaN dla niewspieranej
 */
function getRate(currency) {
  if (!currency || currency === "PLN") return 1;
  const { rates } = getCurrentRates();
  const r = rates[currency.toUpperCase()];
  return typeof r === "number" ? r : NaN;
}

/**
 * Wymusza refetch teraz (np. user kliknął "Odśwież kursy").
 * @returns {Promise<{rates,date,source}|null>}
 */
async function refreshRates() {
  const result = await fetchFromNBP();
  if (result) return result;
  // refresh failed - zwróć co mamy
  return getCurrentRates();
}

/**
 * Prefetch przy starcie apki (call once z main.jsx lub App.jsx).
 * Nie blokuje, fire-and-forget.
 */
function prefetchRates() {
  const cached = getCachedRates();
  const isStale = !cached || (Date.now() - cached.fetchedAt) > FX_TTL_MS;
  if (isStale) fetchFromNBP();
}

// ─── Historical rates (per data transakcji) ──────────────────────────────
// Tx z 5 dni temu powinna używać kursu z TAMTEGO dnia, nie z dzisiejszego.
// NBP /tables/A/{date} zwraca kursy z konkretnego dnia. Dla dni nie-roboczych
// (sobota/niedziela/święta) zwraca 404 — w fallbacku cofamy się o 1 dzień
// aż znajdziemy publication (max 7 dni wstecz, potem fallback do current).
//
// Cache: localStorage["ft_fx_hist_v1"] = { "YYYY-MM-DD": { EUR: 4.28, USD: 3.92, ... } }
// Historyczne kursy się nie zmieniają, więc cache jest permanent (sprzątanie
// po 2 latach żeby localStorage się nie rozdmuchał).

function getHistCache() {
  try {
    const raw = localStorage.getItem(FX_HIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveHistCache(obj) {
  try { localStorage.setItem(FX_HIST_KEY, JSON.stringify(obj)); } catch {}
}

function pruneHistCache(cache) {
  const cutoffMs = Date.now() - FX_HIST_PRUNE_DAYS * 86400000;
  const cutoffStr = new Date(cutoffMs).toISOString().slice(0, 10);
  const out = {};
  for (const [date, rates] of Object.entries(cache)) {
    if (date >= cutoffStr) out[date] = rates;
  }
  return out;
}

const histInFlight = new Map(); // dedupe równoległych fetch dla tej samej daty

/**
 * Pobiera tabelę NBP A dla konkretnej daty. Dla dni nie-roboczych cofa się
 * iteracyjnie aż znajdzie publication (max 7 dni). Zwraca { rates, date, source }.
 *
 * Cache pod ORYGINALNĄ datą (np. dla niedzieli 11.05 zapisze rate z pt 09.05,
 * ale kluczem cache jest 11.05 — bo to data tx). Drugi lookup tej samej daty
 * trafi w cache od razu.
 */
async function getRatesForDate(dateISO) {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    return getCurrentRates();
  }

  // Cache hit?
  const cache = getHistCache();
  if (cache[dateISO]) {
    return { rates: cache[dateISO], date: dateISO, source: "cache" };
  }

  // In-flight dedupe — drugi caller czeka na pierwszego
  if (histInFlight.has(dateISO)) return histInFlight.get(dateISO);

  const fetchPromise = (async () => {
    // Iteracyjny fallback do najbliższego dnia roboczego wstecz
    for (let i = 0; i <= 7; i++) {
      const tryDate = shiftDateISO(dateISO, -i);
      try {
        const res = await fetch(
          `https://api.nbp.pl/api/exchangerates/tables/A/${tryDate}/?format=json`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) continue; // 404 dla weekendów/świąt
        const data = await res.json();
        if (!Array.isArray(data) || !data[0]?.rates) continue;

        const rates = {};
        for (const r of data[0].rates) {
          if (SUPPORTED_CURRENCIES.includes(r.code) && typeof r.mid === "number") {
            rates[r.code] = r.mid;
          }
        }

        // Cache pod oryginalną datą tx (nie tryDate) — to ułatwia future lookups
        const fresh = pruneHistCache({ ...cache, [dateISO]: rates });
        saveHistCache(fresh);
        return { rates, date: data[0].effectiveDate || tryDate, source: "nbp" };
      } catch (_) { /* try previous day */ }
    }

    // Wszystkie próby fail (offline?) — fallback do current rates
    console.warn(`[fx] No historical rate for ${dateISO}, using current`);
    return getCurrentRates();
  })();

  histInFlight.set(dateISO, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    histInFlight.delete(dateISO);
  }
}

/**
 * Kurs konkretnej waluty na konkretną datę. Async.
 * PLN → 1.0 (sync return). Niewspierana waluta → NaN.
 */
async function getRateForDate(currency, dateISO) {
  if (!currency || currency === "PLN") return 1;
  const upper = currency.toUpperCase();
  const { rates } = await getRatesForDate(dateISO);
  const r = rates[upper];
  return typeof r === "number" ? r : NaN;
}

// Helper: przesunięcie daty ISO (YYYY-MM-DD) o N dni
function shiftDateISO(dateISO, deltaDays) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export {
  getCurrentRates,
  convertToPLN,
  getRate,
  refreshRates,
  prefetchRates,
  getRatesForDate,
  getRateForDate,
  SUPPORTED_CURRENCIES,
};

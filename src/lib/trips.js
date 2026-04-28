/**
 * Trips - moduł wyjazdów. Trzyma logikę poza widokami żeby nie kopiować.
 *
 * Filozofia:
 * - tx.tripId = hard link, brak auto-detect po dacie/kategoriach (poprzedni
 *   `vacationArchive` próbował tego i było zbyt skomplikowane).
 * - Aktywny wyjazd = dziś jest między dateFrom-3 a dateTo+3 (bufor na dojazd/powrót).
 * - Można mieć wiele równoległych wyjazdów (np. tata wraca, mama+dziecko zostaje).
 *
 * Schemat trip:
 * {
 *   id:         number (Date.now())
 *   name:       string
 *   dateFrom:   "YYYY-MM-DD"
 *   dateTo:     "YYYY-MM-DD"
 *   budget:     number (PLN)
 *   color:      hex
 *   notes:      string (opcjonalne)
 *   archived:   boolean
 *   createdAt:  ISO string
 * }
 */

import { dateToLocal, todayLocal } from "../utils.js";

const TRIP_BUFFER_DAYS = 3;

function getTripById(trips, id) {
  return Array.isArray(trips) ? trips.find(t => t.id === id) : null;
}

function getTripsForYear(trips, year) {
  if (!Array.isArray(trips)) return [];
  const yyyy = String(year);
  return trips.filter(t => (t.dateFrom || "").startsWith(yyyy) || (t.dateTo || "").startsWith(yyyy));
}

/**
 * Zwraca tablicę aktywnych wyjazdów (dziś jest w zakresie ±bufor).
 * Bufor pozwala dodać tx „taxi z lotniska" dzień przed wyjazdem.
 */
function getActiveTrips(trips, todayStr = todayLocal()) {
  if (!Array.isArray(trips)) return [];
  return trips.filter(t => {
    if (t.archived) return false;
    if (!t.dateFrom || !t.dateTo) return false;
    const fromBuf = shiftDate(t.dateFrom, -TRIP_BUFFER_DAYS);
    const toBuf   = shiftDate(t.dateTo,   +TRIP_BUFFER_DAYS);
    return todayStr >= fromBuf && todayStr <= toBuf;
  });
}

/**
 * Wyjazdy "wybieralne" w modal dodawania transakcji - szerszy zakres niż active.
 * Obejmuje: aktywne (preselect) + nadchodzące do 90 dni naprzód
 * + niedawno zakończone (do 14 dni wstecz, na wypadek tx wprowadzonych z opóźnieniem).
 *
 * Use case: rezerwacja hotelu na wyjazd 3 miesiące naprzód powinna być tagowalna.
 * Lot kupiony pół roku wcześniej już nie - to skrajny przypadek, wtedy edytuj tx
 * ręcznie albo użyj bulk-tag (TODO v1.3.x).
 */
const TRIP_PRESELECT_DAYS = TRIP_BUFFER_DAYS;        // ±3 dni - preselect
const TRIP_FUTURE_DAYS    = 90;                       // do 90 dni naprzód - dostępne w selektorze
const TRIP_PAST_DAYS      = 14;                       // do 14 dni wstecz - dostępne w selektorze

function getSelectableTrips(trips, todayStr = todayLocal()) {
  if (!Array.isArray(trips)) return [];
  return trips.filter(t => {
    if (t.archived) return false;
    if (!t.dateFrom || !t.dateTo) return false;
    const fromExt = shiftDate(t.dateFrom, -TRIP_FUTURE_DAYS);  // 90 dni przed startem
    const toExt   = shiftDate(t.dateTo,   +TRIP_PAST_DAYS);    // 14 dni po końcu
    return todayStr >= fromExt && todayStr <= toExt;
  }).sort((a, b) => {
    // Najpierw aktywne, potem najbliższe nadchodzące, potem niedawno zakończone
    const aActive = getActiveTrips([a], todayStr).length > 0;
    const bActive = getActiveTrips([b], todayStr).length > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.dateFrom || "").localeCompare(b.dateFrom || "");
  });
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return dateToLocal(d);
}

/**
 * Sumuje wydatki (amount < 0) tx oznaczonych tym tripId.
 * Pomija przychody i transfery (cat === "inne" - transfery).
 */
function getTripSpending(transactions, tripId) {
  if (!Array.isArray(transactions) || tripId == null) {
    return { total: 0, byCategory: {}, byMerchant: {}, count: 0 };
  }
  const txs = transactions.filter(t =>
    t.tripId === tripId && t.amount < 0 && t.cat !== "inne"
  );
  const byCategory = {};
  const byMerchant = {};
  let total = 0;
  for (const t of txs) {
    const a = Math.abs(t.amount);
    total += a;
    byCategory[t.cat] = (byCategory[t.cat] || 0) + a;
    const m = (t.desc || "").trim() || "(bez opisu)";
    byMerchant[m] = (byMerchant[m] || 0) + a;
  }
  return { total, byCategory, byMerchant, count: txs.length };
}

/**
 * Sumy roczne wszystkich wyjazdów. Trip jest "w roku" jeśli dateFrom lub dateTo
 * mieszczą się w roku. Wydatki przypisywane do roku według daty TX (nie daty wyjazdu),
 * żeby tx zarezerwowane pre-trip (np. lot kupiony rok wcześniej) liczyły się
 * w roku zakupu.
 */
function getYearlyTripsSummary(trips, transactions, year) {
  if (!Array.isArray(trips) || !Array.isArray(transactions)) {
    return { trips: [], totalSpent: 0, totalBudget: 0 };
  }
  const yearTrips = getTripsForYear(trips, year);
  const tripIds = new Set(yearTrips.map(t => t.id));

  // Sumuj tx tylko z tego roku, oznaczone trip ID z tej puli
  const yyyy = String(year);
  const yearTxs = transactions.filter(t =>
    t.tripId != null && tripIds.has(t.tripId) &&
    t.amount < 0 && t.cat !== "inne" &&
    (t.date || "").startsWith(yyyy)
  );
  const totalSpent = yearTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalBudget = yearTrips.reduce((s, t) => s + (Number(t.budget) || 0), 0);

  // Per-trip spending (po wszystkich tx, nie tylko z tego roku — całe wyjazdy)
  const tripDetails = yearTrips.map(t => {
    const sp = getTripSpending(transactions, t.id);
    return { ...t, spent: sp.total, txCount: sp.count };
  });

  return { trips: tripDetails, totalSpent, totalBudget };
}

/**
 * Zwraca rok-do-rokowe sumy wydatków na wszystkie wyjazdy.
 * Output: [{ year: 2024, total: 12400 }, { year: 2025, total: 18900 }, ...]
 */
function getTripsTrendYoY(trips, transactions) {
  if (!Array.isArray(transactions)) return [];
  const tripIds = new Set((trips || []).map(t => t.id));
  const yearMap = {};
  for (const t of transactions) {
    if (t.tripId == null || !tripIds.has(t.tripId)) continue;
    if (t.amount >= 0 || t.cat === "inne") continue;
    const yr = (t.date || "").slice(0, 4);
    if (!yr) continue;
    yearMap[yr] = (yearMap[yr] || 0) + Math.abs(t.amount);
  }
  return Object.entries(yearMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, total]) => ({ year: parseInt(year, 10), total: Math.round(total) }));
}

/**
 * Grupowanie listy trips: aktywne (dziś), nadchodzące, archiwum.
 * Sortuje archiwum od najnowszego.
 */
function groupTrips(trips, todayStr = todayLocal()) {
  if (!Array.isArray(trips)) return { active: [], upcoming: [], past: [] };
  const active = [];
  const upcoming = [];
  const past = [];
  for (const t of trips) {
    if (t.archived || (t.dateTo && t.dateTo < todayStr && shiftDate(t.dateTo, +TRIP_BUFFER_DAYS) < todayStr)) {
      past.push(t);
    } else if (t.dateFrom > todayStr) {
      upcoming.push(t);
    } else {
      active.push(t);
    }
  }
  // Active i upcoming po dacie rosnąco, past malejąco
  active.sort((a, b) => (a.dateFrom || "").localeCompare(b.dateFrom || ""));
  upcoming.sort((a, b) => (a.dateFrom || "").localeCompare(b.dateFrom || ""));
  past.sort((a, b) => (b.dateFrom || "").localeCompare(a.dateFrom || ""));
  return { active, upcoming, past };
}

const DEFAULT_TRIP_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#10b981",
  "#f59e0b", "#06b6d4", "#f97316", "#14b8a6",
];

function pickTripColor(existingTrips) {
  const used = new Set((existingTrips || []).map(t => t.color));
  for (const c of DEFAULT_TRIP_COLORS) {
    if (!used.has(c)) return c;
  }
  return DEFAULT_TRIP_COLORS[Math.floor(Math.random() * DEFAULT_TRIP_COLORS.length)];
}

/**
 * Migracja ze starego vacation/vacationArchive (z v1.1.0) do nowego schematu.
 * Stary `vacation` w localStorage `ft_vacation`: pojedynczy obiekt aktywny.
 * Stary `vacationArchive` w state: tablica obiektów archiwalnych.
 *
 * Zwraca tablicę nowych Trip jeśli udało się zmigrować, lub null.
 * Wywoływana raz, gdy `trips` jest pusty a stare dane są.
 */
function migrateLegacyVacations() {
  const result = [];
  try {
    const raw = localStorage.getItem("ft_vacation");
    if (raw) {
      const v = JSON.parse(raw);
      if (v && (v.dateFrom || v.dateTo || v.name)) {
        result.push({
          id: Date.now(),
          name: v.name || v.dest || "Wyjazd (migracja)",
          dateFrom: v.dateFrom || todayLocal(),
          dateTo: v.dateTo || v.dateFrom || todayLocal(),
          budget: parseFloat(v.budget) || 0,
          color: "#3b82f6",
          notes: v.dest ? `Cel: ${v.dest}` : "",
          archived: false,
          createdAt: new Date().toISOString(),
          _migrated: true,
        });
      }
    }
  } catch (_) { /* skip */ }
  return result.length > 0 ? result : null;
}

export {
  TRIP_BUFFER_DAYS,
  DEFAULT_TRIP_COLORS,
  getTripById,
  getTripsForYear,
  getActiveTrips,
  getSelectableTrips,
  getTripSpending,
  getYearlyTripsSummary,
  getTripsTrendYoY,
  groupTrips,
  pickTripColor,
  migrateLegacyVacations,
  shiftDate,
};

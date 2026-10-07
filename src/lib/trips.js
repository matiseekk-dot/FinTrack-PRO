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
 *   id:               number (Date.now())
 *   name:             string
 *   dateFrom:         "YYYY-MM-DD"
 *   dateTo:           "YYYY-MM-DD"
 *   budget:           number (PLN)
 *   color:            hex
 *   notes:            string (opcjonalne)
 *   archived:         boolean
 *   createdAt:        ISO string
 *   defaultCurrency:  "PLN" | "EUR" | "USD" | ... (v1.4.1, opcjonalne, default "PLN")
 *     — Gdy user dodaje tx z preselectowanym tripId == active trip, modal
 *       presetuje walutę na trip.defaultCurrency (Serbia → EUR, Praga → CZK).
 * }
 *
 * Schemat transakcji (z multi-currency v1.4.1, wszystkie pola opcjonalne):
 *   amount:        number (zawsze w PLN, do obliczeń/sumowania)
 *   origAmount:    number (kwota w oryginalnej walucie, NA EUR/USD/...)
 *   origCurrency:  string ("EUR", "USD", ...; brak = PLN)
 *   fxRate:        number (kurs PLN/orig użyty przy zapisie)
 *   fxDate:        "YYYY-MM-DD" (data publication NBP użytego kursu)
 *
 * Backward compat: tx bez origCurrency == PLN tx.
 */

import { dateToLocal, todayLocal } from "../utils.js";
import { txAmountForDisplay, amountForDisplay } from "./fx.js";

const TRIP_BUFFER_DAYS = 3;

/**
 * Wyfiltruj wyjazdy które przecinają dany rok kalendarzowy.
 * Wywoływane wewnętrznie przez getYearlyTripsSummary.
 */
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

// ═══ v2.10: koszt „Twój” i rozliczenia ze znajomymi ═══════════════════════════
//
// trip.participants: [{ id, name }] — współtowarzysze (Ty to zawsze "me").
// Twój wydatek na wyjeździe (tx.tripId) może mieć tx.tripSplit: ["me", "p1", …] —
// z kim go dzielisz po równo. Wydatki, za które zapłacił ktoś inny, są w
// trip.friendPaid: [{ id, date, desc, amount, currency, fxRate, paidBy, split, cat }]
// (nie ruszają Twojego konta). Rozliczenia to wpisy z tx.tripSettle: { with: id }
// i kategorią "inne": + oddano Tobie, − oddałeś Ty.

const isSettlement = (tx) => !!(tx && tx.tripSettle);

/** Wpisy wyjazdu (bez rozliczeń). */
function tripEntries(transactions, tripId) {
  return (transactions || []).filter(tx => tx && tx.tripId === tripId && !isSettlement(tx) && tx.cat !== "inne");
}

/**
 * Twój koszt wyjazdu w PLN-ekwiwalencie dla fmtDisplay: Twoja część wspólnych wydatków,
 * całość tych, których nie dzielisz, Twoja część tego, za co zapłacili inni, minus zwroty.
 */
function tripCost(trip, transactions) {
  const out = { myCost: 0, paid: 0, friendShare: 0, byCategory: {}, byDay: {}, byCurrency: {}, count: 0 };
  if (!trip) return out;
  const add = (map, key, v) => { map[key] = (map[key] || 0) + v; };
  for (const tx of tripEntries(transactions, trip.id)) {
    const v = txAmountForDisplay(tx);
    out.count += 1;
    if (v >= 0) { out.myCost -= v; continue; } // zwrot (np. z rezerwacji)
    const full = -v;
    const split = Array.isArray(tx.tripSplit) && tx.tripSplit.length ? tx.tripSplit : ["me"];
    const mine = split.includes("me") ? full / split.length : 0;
    out.paid += full;
    out.myCost += mine;
    add(out.byCategory, tx.cat || "inne", mine);
    add(out.byDay, tx.date, mine);
    const cur = tx.origCurrency && tx.origAmount != null ? tx.origCurrency : "PLN";
    const orig = tx.origCurrency && tx.origAmount != null ? Math.abs(tx.origAmount) : Math.abs(tx.amount);
    out.byCurrency[cur] = out.byCurrency[cur] || { orig: 0, value: 0 };
    out.byCurrency[cur].orig += orig; out.byCurrency[cur].value += full;
  }
  for (const e of trip.friendPaid || []) {
    const split = Array.isArray(e.split) && e.split.length ? e.split : [e.paidBy];
    if (!split.includes("me")) continue;
    const share = amountForDisplay(e.amount, e.currency, e.fxRate) / split.length;
    out.count += 1;
    out.friendShare += share;
    out.myCost += share;
    add(out.byCategory, e.cat || "jedzenie", share);
    add(out.byDay, e.date, share);
  }
  return out;
}

/**
 * Bilans z każdą osobą: >0 — ta osoba oddaje Tobie, <0 — Ty oddajesz jej.
 * Liczymy tylko długi z Tobą (apka jest Twoja); długi między znajomymi pomijamy.
 */
function tripBalances(trip, transactions) {
  const people = (trip && trip.participants) || [];
  const bal = Object.fromEntries(people.map(p => [p.id, 0]));
  for (const tx of (transactions || []).filter(x => x && x.tripId === trip.id)) {
    if (isSettlement(tx)) {
      const p = tx.tripSettle.with;
      if (p in bal) bal[p] += -txAmountForDisplay(tx); // dostałeś (+) → mniej Ci winien; oddałeś (−) → mniej jesteś winien
      continue;
    }
    if (tx.cat === "inne" || tx.amount >= 0 || !Array.isArray(tx.tripSplit)) continue;
    const full = -txAmountForDisplay(tx);
    for (const p of tx.tripSplit) if (p !== "me" && p in bal) bal[p] += full / tx.tripSplit.length;
  }
  for (const e of trip.friendPaid || []) {
    const split = Array.isArray(e.split) && e.split.length ? e.split : [e.paidBy];
    if (!(e.paidBy in bal) || !split.includes("me")) continue;
    bal[e.paidBy] -= amountForDisplay(e.amount, e.currency, e.fxRate) / split.length;
  }
  return people.map(p => ({ ...p, balance: Math.round(bal[p.id] * 100) / 100 }));
}

/** Liczba dni wyjazdu, dzień bieżący i dni do końca (włącznie z dziś). */
function tripDays(trip, today = todayLocal()) {
  const day = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
  const total = Math.max(1, day(trip.dateFrom, trip.dateTo) + 1);
  const status = today < trip.dateFrom ? "upcoming" : today > trip.dateTo ? "past" : "active";
  return {
    total, status,
    current: status === "active" ? day(trip.dateFrom, today) + 1 : null,
    left: status === "active" ? day(today, trip.dateTo) + 1 : status === "upcoming" ? total : 0,
    until: status === "upcoming" ? day(today, trip.dateFrom) : null,
  };
}

/** Budżet w PLN-ekwiwalencie (stare wyjazdy: budżet w PLN). */
function tripBudget(trip) {
  return amountForDisplay(Number(trip.budget) || 0, trip.budgetCurrency || "PLN");
}

export {
  tripCost, tripBalances, tripDays, tripBudget, tripEntries,
  DEFAULT_TRIP_COLORS,
  getActiveTrips,
  getSelectableTrips,
  getTripSpending,
  getYearlyTripsSummary,
  groupTrips,
  pickTripColor,
  migrateLegacyVacations,
};

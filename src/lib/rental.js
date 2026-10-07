// Najem: miejsca na wynajem w synchronizowanej kolekcji `rentals`:
// { id, name, kind, mode: "monthly"|"bookings", rent, currency, dueDay, tenant, since, value, archived }.
// Pieniądze to zwykłe wpisy modułu "rental" (liczą się do dochodu pobocznego jak wszędzie):
//   czynsz        — przychód z rentalId i rentFor: "YYYY-MM" (za który miesiąc),
//   rezerwacja    — przychód z rentalId (najem krótkoterminowy, sprzęt), opcjonalnie nights,
//   koszt         — wydatek z rentalId (naprawy, opłaty, media, podatek…).

import { Building2, BedSingle, SquareParking, Warehouse, Hotel, Wrench, KeyRound } from "lucide-react";
import { txAmountForDisplay, amountForDisplay } from "./fx.js";
import { makeTx } from "./ledger.js";

const KINDS = {
  flat:      { icon: Building2,     color: "#f59e0b", mode: "monthly" },
  room:      { icon: BedSingle,     color: "#fb923c", mode: "monthly" },
  parking:   { icon: SquareParking, color: "#60a5fa", mode: "monthly" },
  garage:    { icon: Warehouse,     color: "#a78bfa", mode: "monthly" },
  shortterm: { icon: Hotel,         color: "#f472b6", mode: "bookings" },
  gear:      { icon: Wrench,        color: "#34d399", mode: "bookings" },
  other:     { icon: KeyRound,      color: "#94a3b8", mode: "monthly" },
};
const KIND_ORDER = ["flat", "room", "parking", "garage", "shortterm", "gear", "other"];

const kindOf = (p) => (p && KINDS[p.kind] ? p.kind : "other");
const modeOf = (p) => (p && (p.mode === "monthly" || p.mode === "bookings") ? p.mode : KINDS[kindOf(p)].mode);

const pad = (n) => String(n).padStart(2, "0");
const ymOf = (d) => (d || "").slice(0, 7);
function shiftYm(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** Termin czynszu w miesiącu (dzień płatności przycięty do długości miesiąca). */
function dueDate(p, ym) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(Math.max(1, Number(p.dueDay) || 10), last))}`;
}

const isRentalTx = (tx, p) => tx && tx.rentalId === p.id;

/**
 * Stan czynszu za miesiąc: paid (wpłacone co najmniej tyle, ile czynsz), partial,
 * late (termin minął, nic albo za mało), due (termin dziś lub za ≤ 5 dni), upcoming, none (przed startem najmu).
 * Kwoty w walucie miejsca.
 */
function rentStatus(p, ym, transactions, today) {
  if (modeOf(p) !== "monthly" || !(Number(p.rent) > 0)) return { state: "none", paid: 0, due: null };
  if (p.since && ym < ymOf(p.since)) return { state: "none", paid: 0, due: null };
  const due = dueDate(p, ym);
  const cur = p.currency || "PLN";
  const paid = transactions
    .filter(tx => isRentalTx(tx, p) && tx.rentFor === ym && tx.amount > 0)
    .reduce((s, tx) => s + (tx.origCurrency === cur && tx.origAmount != null ? Math.abs(tx.origAmount) : (cur === "PLN" ? tx.amount : tx.amount / (tx.fxRate || 1))), 0);
  const rent = Number(p.rent);
  if (paid >= rent - 0.005) return { state: "paid", paid, due };
  // Miesiące sprzed dodania miejsca do aplikacji: brak wpisu ≠ zaległość (najem trwał, a my o nim nie wiedzieliśmy)
  const tracked = p.createdAt && ymOf(p.createdAt) > ymOf(p.since || "") ? ymOf(p.createdAt) : null;
  if (tracked && ym < tracked) return { state: "none", paid, due };
  if (today > due) return { state: paid > 0 ? "partial" : "late", paid, due, missing: rent - paid };
  const days = Math.round((new Date(`${due}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  return { state: days <= 5 ? "due" : "upcoming", paid, due, missing: rent - paid, days };
}

/** Zaległe miesiące (ostatnie 12, od startu najmu, termin już minął). */
function arrears(p, transactions, today) {
  if (modeOf(p) !== "monthly" || p.archived || !(Number(p.rent) > 0)) return [];
  const out = [];
  const nowYm = ymOf(today);
  for (let i = 0; i < 12; i++) {
    const ym = shiftYm(nowYm, -i);
    if (p.since && ym < ymOf(p.since)) break;
    const s = rentStatus(p, ym, transactions, today);
    if (s.state === "late" || s.state === "partial") out.push({ ym, missing: s.missing });
  }
  return out;
}

/** Przychody, koszty i wynik miejsca (albo wszystkich) w okresie; kwoty w PLN-ekwiwalencie. */
function rentalTotals(transactions, { rentalId = null, from = null, to = null } = {}) {
  const s = { income: 0, costs: 0, net: 0, nights: 0, count: 0 };
  for (const tx of transactions) {
    if (!tx || tx.module !== "rental" || tx.cat === "inne") continue;
    if (rentalId != null && tx.rentalId !== rentalId) continue;
    const d = tx.date || "";
    if (from && d < from) continue;
    if (to && d > to) continue;
    const a = txAmountForDisplay(tx);
    if (a > 0) { s.income += a; s.nights += Number(tx.nights) || 0; } else s.costs -= a;
    s.net += a; s.count += 1;
  }
  return s;
}

/** Rentowność netto za ostatnie 12 miesięcy względem wartości miejsca (%), albo null. */
function rentalYield(p, transactions, today) {
  const value = amountForDisplay(p.value, p.currency);
  if (!(value > 0)) return null;
  const from = `${shiftYm(ymOf(today), -11)}-01`;
  const t = rentalTotals(transactions, { rentalId: p.id, from, to: today });
  // Krócej niż rok wynajmu — przeliczamy na rok, żeby nowy najem nie wyglądał źle
  const months = p.since && p.since > from ? Math.max(1, monthsBetween(p.since, today)) : 12;
  return t.net * (12 / months) / value * 100;
}
function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
}

function buildRentTx(p, { ym, date, amount, rate = 1, acc, desc }) {
  return makeTx({ date, desc, amount: Math.abs(amount), currency: p.currency || "PLN", rate, acc, cat: "dodatkowe", module: "rental", rentalId: p.id, rentFor: ym });
}

function sanitizeRentals(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(p => p && p.id != null && typeof p.name === "string");
}

export {
  KINDS, KIND_ORDER, kindOf, modeOf, dueDate, shiftYm, rentStatus, arrears, rentalTotals, rentalYield,
  buildRentTx, sanitizeRentals,
};

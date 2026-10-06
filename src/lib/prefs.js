// Ustawienia użytkownika, które idą za nim między urządzeniami (Firestore: prefs):
// miesięczny cel dochodu pobocznego i miesięczny limit strat w Zakładach.
//
// Kwoty są zapisane w walucie, w której je wpisano ({ amount, currency }), i przeliczane
// przy porównaniu — zmiana waluty głównej nie zmienia celu. `updatedAt` rozstrzyga
// konflikt między urządzeniami (nowszy zapis wygrywa w całości).

import { amountForDisplay, SUPPORTED_CURRENCIES } from "./fx.js";

function sanitizeMoney(v) {
  if (!v || typeof v !== "object") return null;
  const amount = Number(v.amount);
  const currency = typeof v.currency === "string" ? v.currency.toUpperCase() : "PLN";
  if (!isFinite(amount) || amount <= 0) return null;
  if (currency !== "PLN" && !SUPPORTED_CURRENCIES.includes(currency)) return null;
  return { amount, currency };
}

function sanitizePrefs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  const goal = sanitizeMoney(value.monthlyGoal);
  if (goal) out.monthlyGoal = goal;
  const limit = sanitizeMoney(value.betLossLimit);
  if (limit) out.betLossLimit = limit;
  if (typeof value.updatedAt === "number" && value.updatedAt > 0) out.updatedAt = value.updatedAt;
  return out;
}

/** Nowa wersja ustawień z jedną zmienioną kwotą (null usuwa). */
function withPref(prefs, key, money) {
  const next = { ...(prefs || {}), updatedAt: Date.now() };
  const clean = sanitizeMoney(money);
  if (clean) next[key] = clean; else delete next[key];
  return next;
}

/** Kwota do porównań i fmtDisplay (jak sumy wpisów). */
function moneyForDisplay(money) {
  return money ? amountForDisplay(money.amount, money.currency) : 0;
}

export { sanitizePrefs, withPref, moneyForDisplay };

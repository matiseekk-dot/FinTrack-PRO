/**
 * Wycena pozycji portfela i księgowanie wpisów na (ukrytym od 2.6.0) koncie.
 *
 * Konta nie są już pokazywane w apce, ale zostają w danych: każdy wpis ma `acc`,
 * a saldo konta jest nadal aktualizowane, żeby stare dane i kopie zostały spójne.
 */

import { getRate } from "./fx.js";

/**
 * Wartość i wynik pozycji portfela w PLN (v2.4.0), liczone na bieżąco z ilości, cen
 * i waluty pozycji. Wcześniej valuePLN = ilość × cena bez kursu, więc pozycja w USD
 * była liczona jak w PLN. Dla pozycji bez ceny (stare dane) zostaje zapisane valuePLN.
 */
function positionValues(p) {
  if (!p) return { valuePLN: 0, pnlPLN: 0 };
  const qty = Number(p.qty) || 0;
  const cur = Number(p.currentPrice);
  if (!isFinite(cur) || qty === 0) return { valuePLN: Number(p.valuePLN) || 0, pnlPLN: Number(p.pnlPLN) || 0 };
  const code = (p.currency || "PLN").toUpperCase();
  const rate = code === "PLN" ? 1 : getRate(code);
  const r = isFinite(rate) && rate > 0 ? rate : 1;
  const avg = Number(p.avgPrice) || 0;
  return { valuePLN: qty * cur * r, pnlPLN: qty * (cur - avg) * r };
}

/**
 * Helper: przelicza tx.amount (zawsze w PLN) na walutę natywną konta.
 * Używany przy księgowaniu tx — żeby balance konta EUR rosło/spadało w EUR,
 * nie w PLN.
 *
 * Precyzyjny match: gdy tx ma origCurrency = account.currency, użyj origAmount
 * (z poprawnym znakiem z amount). Inaczej dziel amount przez kurs konta dziś.
 */
function txAmountInAccountCurrency(account, tx) {
  const acCur = (account?.currency || "PLN").toUpperCase();
  if (acCur === "PLN") return Number(tx.amount) || 0;

  // Match origCurrency → użyj origAmount z odpowiednim znakiem
  if (tx.origCurrency && String(tx.origCurrency).toUpperCase() === acCur && typeof tx.origAmount === "number") {
    const sign = (Number(tx.amount) || 0) < 0 ? -1 : 1;
    return sign * Math.abs(tx.origAmount);
  }

  // Cross-currency: PLN → account.currency przez today's rate (drift ok dla normalnego use case)
  const rate = getRate(acCur);
  if (!isFinite(rate) || rate === 0) return Number(tx.amount) || 0; // fallback
  return (Number(tx.amount) || 0) / rate;
}

export { positionValues, txAmountInAccountCurrency };

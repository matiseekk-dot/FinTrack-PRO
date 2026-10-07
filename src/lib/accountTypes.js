/**
 * Księgowanie wpisów na (ukrytym od 2.6.0) koncie. Wycena pozycji portfela: lib/investments.js.
 *
 * Konta nie są już pokazywane w apce, ale zostają w danych: każdy wpis ma `acc`,
 * a saldo konta jest nadal aktualizowane, żeby stare dane i kopie zostały spójne.
 */

import { getRate } from "./fx.js";

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

export { txAmountInAccountCurrency };

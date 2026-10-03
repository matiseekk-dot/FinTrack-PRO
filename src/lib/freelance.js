// Moduł Freelance: zlecenia / faktury.
//
// Zlecenie (kolekcja `gigs`) nie rusza salda, dopóki nie jest opłacone — wtedy powstaje
// przychód w Wpisach (moduł freelance, kategoria „dodatkowe”) powiązany przez gigId.
// Koszty freelance (sprzęt, programy) to zwykłe wpisy modułu freelance w Wpisach.

import { makeTx } from "./ledger.js";
import { amountForDisplay, txAmountForDisplay } from "./fx.js";

const TAX_KEY = "ft_tax_reserve_pct";

function getTaxReservePct() {
  try {
    const v = parseFloat(localStorage.getItem(TAX_KEY));
    return isFinite(v) && v > 0 && v < 100 ? v : 0;
  } catch (_) { return 0; }
}

function setTaxReservePct(pct) {
  try {
    const v = parseFloat(pct);
    if (isFinite(v) && v > 0 && v < 100) localStorage.setItem(TAX_KEY, String(v));
    else localStorage.removeItem(TAX_KEY);
  } catch (_) { /* best effort */ }
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isOverdue(gig, today) {
  return gig.status === "unpaid" && !!gig.dueDate && gig.dueDate < today;
}

/** Przychód w Wpisach dla opłaconego zlecenia; zachowuje id istniejącego wpisu. */
function buildGigTx(gig, rate) {
  const label = gig.title || "Freelance";
  return makeTx({
    id: gig.txId ?? undefined, date: gig.paidDate, acc: gig.acc, rate,
    desc: gig.client ? `${label} · ${gig.client}` : label,
    amount: Number(gig.amount), currency: gig.currency,
    cat: "dodatkowe", module: "freelance", gigId: gig.id,
  });
}

/**
 * Statystyki: opłacone w okresie (po dacie zapłaty), niezapłacone zawsze bieżące,
 * plus wpisy modułu bez zlecenia (stare „dodatkowe”) i koszty. Kwoty dla fmtDisplay.
 */
function freelanceStats(gigs, moduleTxs, inPeriod, today) {
  const s = {
    paid: 0, paidCount: 0, hours: 0, paidWithHours: 0,
    unpaid: 0, unpaidCount: 0, overdue: 0, overdueCount: 0,
    looseIncome: 0, looseCount: 0, expenses: 0,
    byClient: {},
  };
  const client = (name) => {
    const key = (name || "").trim() || "—";
    return s.byClient[key] || (s.byClient[key] = { key, paid: 0, unpaid: 0, count: 0, hours: 0 });
  };

  for (const g of gigs) {
    const amt = amountForDisplay(g.amount, g.currency, g.paidFxRate);
    if (g.status === "paid") {
      if (!inPeriod(g.paidDate)) continue;
      s.paid += amt; s.paidCount += 1;
      const hrs = Number(g.hours) || 0;
      if (hrs > 0) { s.hours += hrs; s.paidWithHours += amt; }
      const c = client(g.client); c.paid += amt; c.count += 1; c.hours += hrs;
    } else {
      s.unpaid += amt; s.unpaidCount += 1;
      if (isOverdue(g, today)) { s.overdue += amt; s.overdueCount += 1; }
      client(g.client).unpaid += amt;
    }
  }

  for (const tx of moduleTxs) {
    if (!inPeriod(tx.date) || tx.gigId != null) continue;
    const v = txAmountForDisplay(tx);
    if (v > 0) { s.looseIncome += v; s.looseCount += 1; } else s.expenses += -v;
  }

  const income = s.paid + s.looseIncome;
  return {
    ...s,
    income,
    net: income - s.expenses,
    hourly: s.hours > 0 ? s.paidWithHours / s.hours : null,
    byClient: Object.values(s.byClient).sort((a, b) => (b.paid + b.unpaid) - (a.paid + a.unpaid)),
  };
}

function sanitizeGigs(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(g => g && g.id != null && isFinite(Number(g.amount)));
}

export {
  getTaxReservePct, setTaxReservePct, addDays, isOverdue,
  buildGigTx, freelanceStats, sanitizeGigs,
};

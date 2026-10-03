// Wspólne księgowanie dla widoków modułów (Zakłady, Sprzedaż).
//
// Widoki modułów tworzą zwykłe transakcje (te same co w Wpisach), więc Start, salda
// kont, backup i sync działają bez zmian. Ten plik pilnuje dwóch rzeczy, które
// TransactionsView robi u siebie: kursu NBP z dnia wpisu i korekty salda konta.

import { getRate, getRateForDate } from "./fx.js";
import { txAmountInAccountCurrency } from "./accountTypes.js";

const round2 = (n) => parseFloat((Number(n) || 0).toFixed(2));

// Unikalne ID nawet przy kilku wpisach w tej samej milisekundzie
let lastId = 0;
function newId() {
  const now = Date.now();
  lastId = now > lastId ? now : lastId + 1;
  return lastId;
}

/** Kurs waluty → PLN z dnia (NBP Tabela A); offline → dzisiejszy; brak → 1. */
async function rateOnDate(currency, date) {
  const cur = (currency || "PLN").toUpperCase();
  if (cur === "PLN") return 1;
  let rate = NaN;
  try { rate = await getRateForDate(cur, date); } catch (_) { /* offline */ }
  if (!isFinite(rate)) rate = getRate(cur);
  return isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * Buduje transakcję z kwoty w walucie oryginalnej (ze znakiem).
 * Kwota zapisywana w PLN jak wszędzie; dla walut obcych dochodzą pola FX,
 * identyczne z tymi, które zapisuje formularz w Wpisach.
 */
function makeTx({ id, date, desc, amount, currency = "PLN", rate = 1, cat, acc, module, ...extra }) {
  const cur = (currency || "PLN").toUpperCase();
  const tx = {
    id: id ?? newId(), date, desc,
    amount: round2(cur === "PLN" ? amount : amount * rate),
    cat, acc: parseInt(acc) || 1, module,
    ...extra,
  };
  if (cur !== "PLN") {
    tx.origAmount   = round2(Math.abs(amount));
    tx.origCurrency = cur;
    tx.fxRate       = parseFloat(Number(rate).toFixed(6));
    tx.fxDate       = date;
  }
  return tx;
}

function bookOnAccounts(accounts, tx, sign) {
  return accounts.map(a => (a.id !== tx.acc || a.type === "invest")
    ? a
    : { ...a, balance: round2(a.balance + sign * txAmountInAccountCurrency(a, tx)) });
}

/**
 * Zapisuje zmiany w transakcjach razem z saldami kont.
 * remove — obecne obiekty tx do wycofania; add — nowe tx. Ten sam id w obu = podmiana
 * w miejscu (bez tombstone'a, więc sync nie traktuje tego jak usunięcia).
 */
function commitTxChanges({ setTransactions, setAccounts }, { add = [], remove = [] }) {
  if (setAccounts && (add.length || remove.length)) {
    setAccounts(accs => {
      let next = accs;
      remove.forEach(tx => { next = bookOnAccounts(next, tx, -1); });
      add.forEach(tx => { next = bookOnAccounts(next, tx, +1); });
      return next;
    });
  }
  setTransactions(list => {
    const addMap = new Map(add.map(tx => [tx.id, tx]));
    const removeIds = new Set(remove.map(tx => tx.id));
    const out = [];
    for (const tx of list) {
      if (addMap.has(tx.id)) { out.push(addMap.get(tx.id)); addMap.delete(tx.id); }
      else if (!removeIds.has(tx.id)) out.push(tx);
    }
    return [...addMap.values(), ...out];
  });
}

export { round2, newId, rateOnDate, makeTx, commitTxChanges };

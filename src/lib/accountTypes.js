/**
 * Typy kont - rozbudowane o polski system emerytalny i długoterminowy majątek.
 *
 * Grupy:
 * - liquid       = gotówka dostępna "jutro" (checking, savings)
 * - invest       = inwestycje płynne (brokerage, krypto)
 * - retirement   = emerytura długoterminowa (PPK, IKE, IKZE)
 * - longterm     = inne długoterminowe (obligacje, nieruchomości)
 *
 * v1.5.0: account.currency support. Konto może mieć saldo w walucie obcej
 * (np. konto Revolut EUR z saldem 5000 EUR). Wszystkie sumy/agregacje
 * KONWERTUJĄ na PLN przez kurs NBP. Display layer (Dashboard) potem może
 * konwertować PLN → display currency. Internal = PLN zawsze.
 */

import { convertToPLN, getRate } from "./fx.js";
import { t } from "../i18n.js";

const ACCOUNT_TYPES = {
  checking: {
    get label() { return t("acc.type.checking", "Rachunek bieżący"); },
    group: "liquid",
    icon: "Wallet",
    color: "#3b82f6",
  },
  savings: {
    get label() { return t("acc.type.savings", "Oszczędności"); },
    group: "liquid",
    icon: "PiggyBank",
    color: "#10b981",
  },
  invest: {
    get label() { return t("acc.type.investShort", "Inwestycje"); },
    group: "invest",
    icon: "TrendingUp",
    color: "#8b5cf6",
  },
  ppk: {
    label: "PPK",
    group: "retirement",
    icon: "Shield",
    color: "#06b6d4",
    hint: "Pracownicze Plany Kapitałowe",
  },
  ike: {
    label: "IKE",
    group: "retirement",
    icon: "Shield",
    color: "#14b8a6",
    hint: "Indywidualne Konto Emerytalne",
  },
  ikze: {
    label: "IKZE",
    group: "retirement",
    icon: "Shield",
    color: "#0891b2",
    hint: "Indywidualne Konto Zabezpieczenia Emerytalnego",
  },
  bonds: {
    get label() { return t("acc.type.bonds", "Obligacje skarbowe"); },
    group: "longterm",
    icon: "Landmark",
    color: "#eab308",
    hint: "EDO, ROS, ROD, TOS, DOS",
  },
  // v2.4.0: ogólne konto emerytalne (poza Polską IKE/IKZE/PPK nic nie mówią)
  retirement: {
    get label() { return t("acc.type.retirement", "Konto emerytalne"); },
    group: "retirement",
    icon: "Shield",
    color: "#06b6d4",
  },
};

const ACCOUNT_GROUPS = {
  liquid: {
    get label() { return t("acc.group.cash", "Gotówka dostępna"); },
    get subtitle() { return t("acc.groupSub.cash", "Płynne, dostępne od ręki"); },
    icon: "Wallet",
    color: "#3b82f6",
    priority: 1,
  },
  invest: {
    get label() { return t("acc.group.invest", "Inwestycje"); },
    get subtitle() { return t("acc.groupSub.invest", "Płynne, ale nie od ręki"); },
    icon: "TrendingUp",
    color: "#8b5cf6",
    priority: 2,
  },
  retirement: {
    get label() { return t("acc.group.retirement", "Emerytura długoterminowa"); },
    get subtitle() { return t("acc.groupSub.retirement", "Zamknięte do emerytury"); },
    icon: "Shield",
    color: "#06b6d4",
    priority: 3,
  },
  longterm: {
    get label() { return t("acc.group.longterm", "Majątek długoterminowy"); },
    get subtitle() { return t("acc.groupSub.longterm", "Obligacje, nieruchomości"); },
    icon: "Landmark",
    color: "#eab308",
    priority: 4,
  },
};

// Helper functions
function getAccountType(type) {
  return ACCOUNT_TYPES[type] || ACCOUNT_TYPES.checking;
}

function groupAccountsByCategory(accounts) {
  const groups = { liquid: [], invest: [], retirement: [], longterm: [] };
  if (!Array.isArray(accounts)) return groups;
  accounts.forEach(a => {
    const t = getAccountType(a.type);
    const grp = t.group || "liquid";
    if (groups[grp]) groups[grp].push(a);
  });
  return groups;
}

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
 * Saldo "efektywne" konta w JEGO walucie natywnej (v1.5.0):
 * - dla typów liquid/retirement/longterm = a.balance (źródło prawdy = transakcje)
 * - dla typu invest = suma valuePLN portfolio pozycji powiązanych z tym kontem,
 *   bo balance konta invest jest aktualizowany OSOBNO (Inwestycje → wpisz qty/cenę)
 *   - transakcje na konto invest są pomijane w aktualizacji balance.
 *
 * UWAGA: portfolio[].valuePLN jest już w PLN. Konta invest zawsze "natywnie w PLN"
 * tutaj — bo wycena pozycji idzie przez PLN. Dla innych typów zwraca raw balance
 * w account.currency (do konwersji użyj `getAccountBalancePLN`).
 */
function getEffectiveBalance(account, portfolio) {
  if (!account || account.type !== "invest") return Number(account?.balance) || 0;
  const baseBalance = Number(account.balance) || 0;
  if (!Array.isArray(portfolio) || portfolio.length === 0) return baseBalance;
  const linked = portfolio.filter(p => p && p.linkedAccId === account.id);
  if (linked.length === 0) return baseBalance;
  return linked.reduce((s, p) => s + positionValues(p).valuePLN, 0);
}

/**
 * Saldo konta przeliczone na PLN (v1.5.0). Używane do sumowania w sumByGroup
 * i wszystkich agregacjach majątku/cyklu.
 *
 * Konta invest mają już valuePLN w portfolio → bez konwersji.
 * Konta liquid/retirement/longterm — jeśli account.currency != PLN, konwertuj
 * przez NBP rate (sync, z cache w fx.js). Brak currency = PLN (backward compat).
 */
function getAccountBalancePLN(account, portfolio) {
  if (!account) return 0;
  const raw = getEffectiveBalance(account, portfolio);
  // Invest: valuePLN już w PLN
  if (account.type === "invest") return raw;
  const cur = (account.currency || "PLN").toUpperCase();
  if (cur === "PLN") return raw;
  return convertToPLN(raw, cur);
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

function sumByGroup(accounts, portfolio = null) {
  const grouped = groupAccountsByCategory(accounts);
  const sums = {};
  Object.keys(grouped).forEach(g => {
    sums[g] = grouped[g].reduce((s, a) => s + getAccountBalancePLN(a, portfolio), 0);
  });
  sums.total = sums.liquid + sums.invest + sums.retirement + sums.longterm;
  return sums;
}

export {
  positionValues,
  ACCOUNT_TYPES, ACCOUNT_GROUPS,
  getAccountType,
  groupAccountsByCategory, sumByGroup,
  getEffectiveBalance,
  getAccountBalancePLN,
  txAmountInAccountCurrency,
};

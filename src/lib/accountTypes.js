/**
 * Typy kont - rozbudowane o polski system emerytalny i długoterminowy majątek.
 * 
 * Grupy:
 * - liquid       = gotówka dostępna "jutro" (checking, savings)
 * - invest       = inwestycje płynne (brokerage, krypto)
 * - retirement   = emerytura długoterminowa (PPK, IKE, IKZE)
 * - longterm     = inne długoterminowe (obligacje, nieruchomości)
 */

const ACCOUNT_TYPES = {
  checking: {
    label: "Konto osobiste",
    group: "liquid",
    icon: "Wallet",
    color: "#3b82f6",
  },
  savings: {
    label: "Oszczędności",
    group: "liquid",
    icon: "PiggyBank",
    color: "#10b981",
  },
  invest: {
    label: "Inwestycje",
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
    label: "Obligacje skarbowe",
    group: "longterm",
    icon: "Landmark",
    color: "#eab308",
    hint: "EDO, ROS, ROD, TOS, DOS",
  },
};

const ACCOUNT_GROUPS = {
  liquid: {
    label: "Gotówka dostępna",
    subtitle: "Płynne, dostępne od ręki",
    icon: "Wallet",
    color: "#3b82f6",
    priority: 1,
  },
  invest: {
    label: "Inwestycje",
    subtitle: "Płynne, ale nie od ręki",
    icon: "TrendingUp",
    color: "#8b5cf6",
    priority: 2,
  },
  retirement: {
    label: "Emerytura długoterminowa",
    subtitle: "Zamknięte do emerytury",
    icon: "Shield",
    color: "#06b6d4",
    priority: 3,
  },
  longterm: {
    label: "Majątek długoterminowy",
    subtitle: "Obligacje, nieruchomości",
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
 * Saldo "efektywne" konta:
 * - dla typów liquid/retirement/longterm = a.balance (źródło prawdy = transakcje)
 * - dla typu invest = suma valuePLN portfolio pozycji powiązanych z tym kontem,
 *   bo balance konta invest jest aktualizowany OSOBNO (Inwestycje → wpisz qty/cenę)
 *   - transakcje na konto invest są pomijane w aktualizacji balance.
 *
 * Jeśli portfolio[] nie zostanie podane, fallback do a.balance dla wszystkich.
 * Jeśli invest account nie ma żadnych pozycji portfolio - fallback do a.balance.
 */
function getEffectiveBalance(account, portfolio) {
  if (!account || account.type !== "invest") return Number(account?.balance) || 0;
  const baseBalance = Number(account.balance) || 0;
  if (!Array.isArray(portfolio) || portfolio.length === 0) return baseBalance;
  const linked = portfolio.filter(p => p && p.linkedAccId === account.id);
  if (linked.length === 0) return baseBalance;
  return linked.reduce((s, p) => s + (Number(p.valuePLN) || 0), 0);
}

function sumByGroup(accounts, portfolio = null) {
  const grouped = groupAccountsByCategory(accounts);
  const sums = {};
  Object.keys(grouped).forEach(g => {
    sums[g] = grouped[g].reduce((s, a) => s + getEffectiveBalance(a, portfolio), 0);
  });
  sums.total = sums.liquid + sums.invest + sums.retirement + sums.longterm;
  return sums;
}

export {
  ACCOUNT_TYPES, ACCOUNT_GROUPS,
  getAccountType,
  groupAccountsByCategory, sumByGroup,
  getEffectiveBalance,
};

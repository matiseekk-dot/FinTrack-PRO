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

function getAccountGroup(type) {
  const t = getAccountType(type);
  return ACCOUNT_GROUPS[t.group] || ACCOUNT_GROUPS.liquid;
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

function sumByGroup(accounts) {
  const grouped = groupAccountsByCategory(accounts);
  const sums = {};
  Object.keys(grouped).forEach(g => {
    sums[g] = grouped[g].reduce((s, a) => s + (Number(a.balance) || 0), 0);
  });
  sums.total = sums.liquid + sums.invest + sums.retirement + sums.longterm;
  return sums;
}

// Czy typ konta jest retirement/longterm (nie powinien liczyć się do "monthly cash flow")?
function isLongTerm(type) {
  const t = getAccountType(type);
  return t.group === "retirement" || t.group === "longterm";
}

export {
  ACCOUNT_TYPES, ACCOUNT_GROUPS,
  getAccountType, getAccountGroup,
  groupAccountsByCategory, sumByGroup,
  isLongTerm,
};

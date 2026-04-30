/**
 * Hobby - moduł trakowania wydatków i przychodów na hobby. Czysto finansowy.
 *
 * Filozofia:
 * - Każde hobby = bucket reguł matchujących transakcje.
 * - Reguły: lista kategorii ORAZ/LUB lista keywordów w description.
 * - Match jest OR-em obu (jeśli kategorie OR keyword → trafia do hobby).
 * - Tx może być w wielu hobby naraz (rzadko, ale OK).
 * - Pomijamy transfery (cat === "inne").
 *
 * v1.3.2: Dodane wsparcie dla income transactions (sprzedaż winyli, gier, książek,
 * zwroty). Funkcja `txMatchesHobby` nie filtruje już po znaku amount — caller decyduje
 * przez `getHobbyExpenses` / `getHobbyIncome`. Stary `getHobbyTransactions` zachowany
 * dla backward compat (zwraca tylko expenses jak wcześniej).
 *
 * Schemat hobby (bez zmian):
 * {
 *   id:           number
 *   name:         string
 *   color:        hex
 *   icon:         string (lucide name, optional)
 *   categories:   ["muzyka", "rozrywka"]   // dowolne kategorie
 *   keywords:     ["winyl", "ghost"]        // case-insensitive substring match w desc
 *   yearlyTarget: number | null              // soft-cap: jeśli >0, pokazuje progres
 *   archived:     boolean
 *   createdAt:    ISO string
 * }
 */

const DEFAULT_HOBBY_COLORS = [
  "#ec4899", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#3b82f6", "#f97316", "#14b8a6",
];

function pickHobbyColor(existingHobbies) {
  const used = new Set((existingHobbies || []).map(h => h.color));
  for (const c of DEFAULT_HOBBY_COLORS) {
    if (!used.has(c)) return c;
  }
  return DEFAULT_HOBBY_COLORS[Math.floor(Math.random() * DEFAULT_HOBBY_COLORS.length)];
}

/**
 * Sprawdza czy transakcja "pasuje" do hobby (po kategoriach LUB keywordach).
 * v1.3.2: NIE filtruje po amount sign — caller decyduje przez wrappery
 * `getHobbyExpenses` / `getHobbyIncome`.
 */
function txMatchesHobby(tx, hobby) {
  if (!tx || !hobby) return false;
  if (tx.cat === "inne") return false;     // transfery zawsze pomijamy
  const cats = Array.isArray(hobby.categories) ? hobby.categories : [];
  const keywords = Array.isArray(hobby.keywords) ? hobby.keywords : [];

  if (cats.length === 0 && keywords.length === 0) return false;

  if (cats.includes(tx.cat)) return true;
  if (keywords.length > 0) {
    const desc = (tx.desc || "").toLowerCase();
    for (const kw of keywords) {
      const k = (kw || "").toLowerCase().trim();
      if (k && desc.includes(k)) return true;
    }
  }
  return false;
}

/**
 * Wszystkie tx pasujące do hobby (zarówno wydatki jak przychody, posortowane).
 * v1.3.2: nowa funkcja zwracająca obie strony.
 */
function getAllHobbyTransactions(transactions, hobby) {
  if (!Array.isArray(transactions) || !hobby) return [];
  return transactions
    .filter(t => txMatchesHobby(t, hobby))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/**
 * Tylko wydatki hobby (amount < 0), posortowane po dacie malejąco.
 */
function getHobbyExpenses(transactions, hobby) {
  return getAllHobbyTransactions(transactions, hobby).filter(t => t.amount < 0);
}

/**
 * Tylko przychody z hobby (amount > 0) - sprzedaż winyli, zwroty, itp.
 * v1.3.2: nowa funkcja.
 */
function getHobbyIncome(transactions, hobby) {
  return getAllHobbyTransactions(transactions, hobby).filter(t => t.amount > 0);
}

/**
 * Statystyki hobby - rozszerzone o income i netto.
 * Zwraca:
 * - thisCycle / thisYear / allTime  - WYDATKI (jak przed v1.3.2, backward compat)
 * - incomeThisCycle / incomeThisYear / incomeAllTime  - PRZYCHODY
 * - nettoThisCycle / nettoThisYear / nettoAllTime  - NETTO (income - expense)
 *   Ujemne netto = hobby kosztuje, dodatnie netto = hobby zarabia.
 * - byCategory, byMerchant - tylko wydatki (zachowane dla "Top sklepy")
 * - byIncomeCategory, byIncomeMerchant - tylko przychody (NEW)
 * - yoyTrend - tylko wydatki (jak przed v1.3.2)
 * - yoyIncomeTrend - przychody (NEW)
 */
function getHobbyStats(transactions, hobby, opts = {}) {
  const { cycleTxs, year } = opts;
  const expenseTxs = getHobbyExpenses(transactions, hobby);
  const incomeTxs  = getHobbyIncome(transactions, hobby);

  if (expenseTxs.length === 0 && incomeTxs.length === 0) {
    return {
      total: 0, count: 0,
      thisCycle: 0, thisMonth: 0, thisQuarter: 0, thisYear: 0, allTime: 0,
      incomeThisCycle: 0, incomeThisMonth: 0, incomeThisYear: 0, incomeAllTime: 0,
      nettoThisCycle: 0, nettoThisYear: 0, nettoAllTime: 0,
      byCategory: {}, byMerchant: {},
      byIncomeCategory: {}, byIncomeMerchant: {},
      yoyTrend: [], yoyIncomeTrend: [],
    };
  }

  const now = new Date();
  const yyyy = String(year || now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ymPrefix = `${yyyy}-${mm}`;
  const currentQ = Math.floor(now.getMonth() / 3); // 0..3
  const qStart = currentQ * 3;
  const qMonths = [qStart, qStart + 1, qStart + 2].map(m => String(m + 1).padStart(2, "0"));

  // ─── WYDATKI ─────────────────────────────────────────────────────
  let thisCycle = 0;
  if (Array.isArray(cycleTxs)) {
    const cycleIdSet = new Set(cycleTxs.map(t => t.id));
    thisCycle = expenseTxs.filter(t => cycleIdSet.has(t.id))
                   .reduce((s, t) => s + Math.abs(t.amount), 0);
  }
  const thisMonth = expenseTxs.filter(t => (t.date || "").startsWith(ymPrefix))
                       .reduce((s, t) => s + Math.abs(t.amount), 0);
  const thisQuarter = expenseTxs.filter(t => {
    const d = t.date || "";
    if (!d.startsWith(yyyy)) return false;
    return qMonths.some(m => d.startsWith(`${yyyy}-${m}`));
  }).reduce((s, t) => s + Math.abs(t.amount), 0);
  const thisYear = expenseTxs.filter(t => (t.date || "").startsWith(yyyy))
                      .reduce((s, t) => s + Math.abs(t.amount), 0);
  const allTime  = expenseTxs.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCategory = {};
  const byMerchant = {};
  for (const t of expenseTxs) {
    const a = Math.abs(t.amount);
    byCategory[t.cat] = (byCategory[t.cat] || 0) + a;
    const m = (t.desc || "").trim() || "(bez opisu)";
    byMerchant[m] = (byMerchant[m] || 0) + a;
  }

  const yearMap = {};
  for (const t of expenseTxs) {
    const yr = (t.date || "").slice(0, 4);
    if (!yr) continue;
    yearMap[yr] = (yearMap[yr] || 0) + Math.abs(t.amount);
  }
  const yoyTrend = Object.entries(yearMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([y, total]) => ({ year: parseInt(y, 10), total: Math.round(total) }));

  // ─── PRZYCHODY (v1.3.2) ──────────────────────────────────────────
  let incomeThisCycle = 0;
  if (Array.isArray(cycleTxs)) {
    const cycleIdSet = new Set(cycleTxs.map(t => t.id));
    incomeThisCycle = incomeTxs.filter(t => cycleIdSet.has(t.id))
                       .reduce((s, t) => s + t.amount, 0);
  }
  const incomeThisMonth = incomeTxs.filter(t => (t.date || "").startsWith(ymPrefix))
                       .reduce((s, t) => s + t.amount, 0);
  const incomeThisYear = incomeTxs.filter(t => (t.date || "").startsWith(yyyy))
                       .reduce((s, t) => s + t.amount, 0);
  const incomeAllTime  = incomeTxs.reduce((s, t) => s + t.amount, 0);

  const byIncomeCategory = {};
  const byIncomeMerchant = {};
  for (const t of incomeTxs) {
    byIncomeCategory[t.cat] = (byIncomeCategory[t.cat] || 0) + t.amount;
    const m = (t.desc || "").trim() || "(bez opisu)";
    byIncomeMerchant[m] = (byIncomeMerchant[m] || 0) + t.amount;
  }

  const incomeYearMap = {};
  for (const t of incomeTxs) {
    const yr = (t.date || "").slice(0, 4);
    if (!yr) continue;
    incomeYearMap[yr] = (incomeYearMap[yr] || 0) + t.amount;
  }
  const yoyIncomeTrend = Object.entries(incomeYearMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([y, total]) => ({ year: parseInt(y, 10), total: Math.round(total) }));

  return {
    // Wydatki (backward compat keys)
    total: allTime, count: expenseTxs.length,
    thisCycle:   Math.round(thisCycle),
    thisMonth:   Math.round(thisMonth),
    thisQuarter: Math.round(thisQuarter),
    thisYear:    Math.round(thisYear),
    allTime:     Math.round(allTime),
    byCategory, byMerchant,
    yoyTrend,
    // Przychody (v1.3.2)
    incomeThisCycle: Math.round(incomeThisCycle),
    incomeThisMonth: Math.round(incomeThisMonth),
    incomeThisYear:  Math.round(incomeThisYear),
    incomeAllTime:   Math.round(incomeAllTime),
    incomeCount:     incomeTxs.length,
    byIncomeCategory, byIncomeMerchant,
    yoyIncomeTrend,
    // Netto (v1.3.2)
    nettoThisCycle: Math.round(incomeThisCycle - thisCycle),
    nettoThisYear:  Math.round(incomeThisYear  - thisYear),
    nettoAllTime:   Math.round(incomeAllTime   - allTime),
  };
}

export {
  DEFAULT_HOBBY_COLORS,
  pickHobbyColor,
  getAllHobbyTransactions,
  getHobbyStats,
};

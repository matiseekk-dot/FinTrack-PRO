/**
 * Hobby - moduł trakowania wydatków na hobby. Czysto finansowy.
 *
 * Filozofia:
 * - Każde hobby = bucket reguł matchujących transakcje.
 * - Reguły: lista kategorii ORAZ/LUB lista keywordów w description.
 * - Match jest OR-em obu (jeśli kategorie OR keyword → trafia do hobby).
 * - Tx może być w wielu hobby naraz (rzadko, ale OK).
 * - Pomijamy przychody i transfery (cat === "inne").
 *
 * Schemat hobby:
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
 */
function txMatchesHobby(tx, hobby) {
  if (!tx || !hobby) return false;
  if (tx.amount >= 0) return false;        // tylko wydatki
  if (tx.cat === "inne") return false;     // pomijamy transfery
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
 * Wszystkie tx pasujące do hobby (filtered, posortowane po dacie malejąco).
 */
function getHobbyTransactions(transactions, hobby) {
  if (!Array.isArray(transactions) || !hobby) return [];
  return transactions
    .filter(t => txMatchesHobby(t, hobby))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/**
 * Statystyki hobby:
 * - thisCycle: w bieżącym cyklu rozliczeniowym (cycleTxs zawężone)
 * - thisYear: rok bieżący
 * - allTime: total
 * - byCategory, byMerchant
 * - yoyTrend: array {year, total} od najstarszego
 */
function getHobbyStats(transactions, hobby, opts = {}) {
  const { cycleTxs, year } = opts;
  const txs = getHobbyTransactions(transactions, hobby);
  if (txs.length === 0) {
    return {
      total: 0, count: 0,
      thisCycle: 0, thisYear: 0, allTime: 0,
      byCategory: {}, byMerchant: {},
      yoyTrend: [],
    };
  }

  const yyyy = String(year || new Date().getFullYear());
  let thisCycle = 0;
  if (Array.isArray(cycleTxs)) {
    const cycleIdSet = new Set(cycleTxs.map(t => t.id));
    thisCycle = txs.filter(t => cycleIdSet.has(t.id))
                   .reduce((s, t) => s + Math.abs(t.amount), 0);
  }

  const thisYear = txs.filter(t => (t.date || "").startsWith(yyyy))
                      .reduce((s, t) => s + Math.abs(t.amount), 0);
  const allTime  = txs.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCategory = {};
  const byMerchant = {};
  for (const t of txs) {
    const a = Math.abs(t.amount);
    byCategory[t.cat] = (byCategory[t.cat] || 0) + a;
    const m = (t.desc || "").trim() || "(bez opisu)";
    byMerchant[m] = (byMerchant[m] || 0) + a;
  }

  // Trend YoY
  const yearMap = {};
  for (const t of txs) {
    const yr = (t.date || "").slice(0, 4);
    if (!yr) continue;
    yearMap[yr] = (yearMap[yr] || 0) + Math.abs(t.amount);
  }
  const yoyTrend = Object.entries(yearMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([y, total]) => ({ year: parseInt(y, 10), total: Math.round(total) }));

  return {
    total: allTime, count: txs.length,
    thisCycle: Math.round(thisCycle),
    thisYear: Math.round(thisYear),
    allTime: Math.round(allTime),
    byCategory, byMerchant,
    yoyTrend,
  };
}

export {
  DEFAULT_HOBBY_COLORS,
  pickHobbyColor,
  getHobbyTransactions,
  getHobbyStats,
};

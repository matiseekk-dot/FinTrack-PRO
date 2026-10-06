// Przenoszenie starych wpisów do modułu Hobby i subskrypcje: dawne wydatki osobiste
// (ukryte od 2.6.0) i wpisy łapane przez stare „kolekcje” z FinTracka (Netflix, kino…).
//
// Wpisy grupujemy po opisie, zgadujemy kategorię i — gdy płatności powtarzają się
// co miesiąc / rok — proponujemy subskrypcję. Nic nie zmienia się bez potwierdzenia.

import { getModule, isCapitalFlow } from "./modules.js";
import { txMatchesHobby } from "./hobby.js";
import { txAmountForDisplay } from "./fx.js";
import { addCycle, daysUntil } from "./subscriptions.js";

const RULES = [
  { kind: "streaming", cat: "subskrypcje", re: /netflix|hbo|\bmax\b|disney|prime video|amazon prime|canal\+|skyshowtime|player\.pl|polsat box|youtube premium|viaplay|apple tv/i },
  { kind: "music",     cat: "subskrypcje", re: /spotify|tidal|deezer|apple music|youtube music/i },
  { kind: "ai",        cat: "subskrypcje", re: /chatgpt|openai|claude|anthropic|midjourney|copilot|gemini|perplexity|notion|canva|adobe/i },
  { kind: "gaming",    cat: "gry",         re: /ps plus|playstation|xbox|game ?pass|steam|nintendo|ea play|epic games|\bgry?\b|\bgame/i },
  { kind: "fitness",   cat: "sport",       re: /siłown|silown|\bgym\b|fitness|multisport|medicover sport|basen|crossfit|sport/i },
  { kind: null,        cat: "kino",        re: /kino|cinema|helios|multikino|cinema city|\bfilm/i },
  { kind: null,        cat: "wydarzenia",  re: /koncert|festiwal|festival|bilet|ticket|eventim|ebilet|going\.|stand-?up|teatr|mecz/i },
  { kind: null,        cat: "muzyka",      re: /muzyk|płyt|plyt|winyl|vinyl/i },
];

function guess(desc) {
  return RULES.find(r => r.re.test(desc || "")) || null;
}

// „Netflix 03/2025”, „NETFLIX.COM” i „Netflix” to ta sama grupa
function groupKey(desc) {
  return (desc || "").toLowerCase().replace(/\.(com|pl|net)\b/g, "").replace(/[0-9/.,:#*-]+/g, " ").replace(/\s+/g, " ").trim() || "—";
}

/** Czy wpisy grupy to cykliczna płatność — i jaka byłaby subskrypcja. */
function detectRecurring(txs, today) {
  const months = new Set(txs.map(tx => tx.date.slice(0, 7)));
  if (txs.length < 2 || months.size < 2) return null;
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(-daysUntil(sorted[i - 1].date, sorted[i].date));
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  const cycle = median >= 300 ? "year" : median >= 20 ? "month" : median >= 5 ? "week" : null;
  if (!cycle) return null;
  const last = sorted[sorted.length - 1];
  const sinceLast = -daysUntil(last.date, today);
  // Dawno nieopłacana — pewnie anulowana; nie proponujemy
  if (sinceLast > (cycle === "year" ? 400 : cycle === "month" ? 45 : 14)) return null;
  const fx = last.origCurrency && last.origAmount != null;
  return {
    cycle,
    amount: Math.abs(fx ? last.origAmount : last.amount),
    currency: fx ? last.origCurrency : "PLN",
    nextDate: addCycle(last.date, cycle),
  };
}

/**
 * Grupy wpisów, które można przenieść: wydatki uznane za osobiste albo należące do
 * starych kolekcji (poza tymi z katalogu). onlyHobbyId — tylko wpisy jednej kolekcji.
 */
function moveCandidates(transactions, hobbies, today, onlyHobbyId = null, excludeIds = new Set()) {
  const only = onlyHobbyId != null ? hobbies.find(h => h.id === onlyHobbyId) : null;
  const groups = new Map();
  for (const tx of transactions) {
    if (!tx || !tx.date || tx.amount >= 0 || tx.cat === "inne" || isCapitalFlow(tx)) continue;
    if (tx.collectionItemId != null || tx.subscriptionId != null || tx.tripId != null || excludeIds.has(tx.id)) continue;
    const mod = getModule(tx, hobbies);
    if (mod !== "personal" && mod !== "collections") continue;
    if (only && !txMatchesHobby(tx, only)) continue;
    const key = groupKey(tx.desc);
    const g = groups.get(key) || { key, txs: [], total: 0, labels: {}, collections: new Set(), personal: false };
    g.txs.push(tx);
    g.total += -txAmountForDisplay(tx);
    g.labels[tx.desc] = (g.labels[tx.desc] || 0) + 1;
    if (mod === "personal") g.personal = true;
    else hobbies.forEach(h => { if (txMatchesHobby(tx, h)) g.collections.add(h.id); });
    groups.set(key, g);
  }
  return [...groups.values()].map(g => {
    const label = Object.entries(g.labels).sort((a, b) => b[1] - a[1])[0][0] || "—";
    const rule = guess(label);
    const recurring = detectRecurring(g.txs, today);
    return {
      key: g.key, label, txs: g.txs, count: g.txs.length, total: g.total,
      lastDate: g.txs.reduce((m, tx) => tx.date > m ? tx.date : m, ""),
      personal: g.personal, collectionIds: [...g.collections],
      cat: recurring ? "subskrypcje" : (rule ? rule.cat : "rozrywka"),
      kind: (rule && rule.kind) || "other",
      recurring,
    };
  }).sort((a, b) => (b.recurring ? 1 : 0) - (a.recurring ? 1 : 0) || b.count - a.count || b.total - a.total);
}

export { moveCandidates, guess as guessHobby };

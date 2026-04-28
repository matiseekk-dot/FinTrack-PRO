// Generator personalizowanych insightów finansowych
// Zamiast pokazywać liczby, pokazuje "historie"

import { fmt } from "../utils.js";

// Kategorie pomijane w insightach - user nie ma na nie bezpośredniego wpływu
// (rachunki, podatki, inwestycje są "fixed cost" - insighty o nich są bezużyteczne)
const INSIGHT_IGNORED_CATS = ["rachunki", "rząd", "inwestycje", "inne"];

// Helper: grupa transakcji per kategoria (z pominięciem stałych)
function groupByCategory(transactions) {
  const map = {};
  transactions.forEach(t => {
    if (t.amount >= 0) return;
    if (INSIGHT_IGNORED_CATS.includes(t.cat)) return;
    if (!map[t.cat]) map[t.cat] = { total: 0, count: 0, cat: t.cat };
    map[t.cat].total += Math.abs(t.amount);
    map[t.cat].count++;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// Helper: grupa per merchant (desc)
function groupByMerchant(transactions) {
  const map = {};
  transactions.forEach(t => {
    if (t.amount >= 0 || !t.desc) return;
    if (INSIGHT_IGNORED_CATS.includes(t.cat)) return;
    const key = t.desc.toLowerCase().trim();
    if (!map[key]) map[key] = { name: t.desc, total: 0, count: 0 };
    map[key].total += Math.abs(t.amount);
    map[key].count++;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// Helper: miesiąc bieżący vs poprzedni
// v1.2.11: gdy cycleDay > 1, używamy cyklu rozliczeniowego zamiast kalendarzowego.
// Dla userów z cycleDay=1 (default) zachowanie identyczne jak wcześniej.
function splitByMonth(transactions, cycleDay = 1) {
  const now = new Date();

  if (cycleDay <= 1) {
    // Standardowe miesiące kalendarzowe
    const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    return {
      current: transactions.filter(t => t.date?.startsWith(curYM)),
      previous: transactions.filter(t => t.date?.startsWith(prevYM)),
    };
  }

  // Cykl rozliczeniowy: jeśli dziś >= cycleDay, jesteśmy w cyklu który zaczął się
  // cycleDay tego miesiąca; inaczej w cyklu który zaczął się cycleDay poprzedniego miesiąca.
  const today = now.getDate();
  let curStartY, curStartM, curEndY, curEndM;
  if (today >= cycleDay) {
    curStartY = now.getFullYear();
    curStartM = now.getMonth();
    curEndY = curStartM === 11 ? curStartY + 1 : curStartY;
    curEndM = curStartM === 11 ? 0 : curStartM + 1;
  } else {
    curStartY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    curStartM = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    curEndY = now.getFullYear();
    curEndM = now.getMonth();
  }
  const pad = (n) => String(n).padStart(2, "0");
  const curStart = `${curStartY}-${pad(curStartM+1)}-${pad(cycleDay)}`;
  const curEnd   = `${curEndY}-${pad(curEndM+1)}-${pad(cycleDay-1)}`;
  // Poprzedni cykl: miesiąc wcześniej
  const prevStartY = curStartM === 0 ? curStartY - 1 : curStartY;
  const prevStartM = curStartM === 0 ? 11 : curStartM - 1;
  const prevEnd    = `${curStartY}-${pad(curStartM+1)}-${pad(cycleDay-1)}`;
  const prevStart  = `${prevStartY}-${pad(prevStartM+1)}-${pad(cycleDay)}`;

  return {
    current:  transactions.filter(t => t.date >= curStart  && t.date <= curEnd),
    previous: transactions.filter(t => t.date >= prevStart && t.date <= prevEnd),
  };
}

// Helper: transakcje per dzień tygodnia
function spendByWeekday(transactions) {
  const byDay = [0, 0, 0, 0, 0, 0, 0]; // nd, pn, wt, śr, cz, pt, sb
  const countByDay = [0, 0, 0, 0, 0, 0, 0];
  transactions.forEach(t => {
    if (t.amount >= 0 || t.cat === "inne") return;
    const d = new Date(t.date);
    if (isNaN(d)) return;
    const dow = d.getDay();
    byDay[dow] += Math.abs(t.amount);
    countByDay[dow]++;
  });
  return { spending: byDay, counts: countByDay };
}

// Główny generator — zwraca TOP 3 insight'y dla Dashboardu
import { generateRetirementInsights } from "./retirementCalc.js";

function generateInsights(transactions, budgets = [], accounts = [], cycleDay = 1) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const insights = [];
  const { current: curTx, previous: prevTx } = splitByMonth(transactions, cycleDay);

  if (curTx.length < 3) return []; // za mało danych

  // 1. Top kategoria
  const cats = groupByCategory(curTx);
  if (cats.length > 0) {
    const top = cats[0];
    const total = cats.reduce((s, c) => s + c.total, 0);
    const pct = total > 0 ? Math.round((top.total / total) * 100) : 0;
    insights.push({
      type: "top_category",
      priority: 8,
      icon: "📊",
      title: `${capitalizeCat(top.cat)} to Twoja największa kategoria`,
      desc: `${fmt(top.total)} w tym miesiącu — ${pct}% wszystkich wydatków`,
      color: "#3b82f6",
    });
  }

  // 2. Top merchant
  const merchants = groupByMerchant(curTx);
  if (merchants.length > 0 && merchants[0].count >= 3) {
    const top = merchants[0];
    const avgPerVisit = top.count > 0 ? top.total / top.count : 0;
    insights.push({
      type: "top_merchant",
      priority: 9,
      icon: "🎯",
      title: `${top.name} — ${top.count}x w tym miesiącu`,
      desc: `Razem ${fmt(top.total)} · średnio ${fmt(avgPerVisit)} za wizytę`,
      color: "#8b5cf6",
    });
  }

  // 3. Month vs month comparison
  if (prevTx.length >= 3) {
    const curExp = curTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevExp = prevTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s, t) => s + Math.abs(t.amount), 0);
    if (prevExp > 0 && curExp > 0) {
      const diff = curExp - prevExp;
      const pctDiff = (diff / prevExp) * 100;
      if (Math.abs(pctDiff) >= 10) {
        insights.push({
          type: "month_comparison",
          priority: 7,
          icon: diff > 0 ? "📈" : "📉",
          title: diff > 0
            ? `Wydajesz ${Math.round(pctDiff)}% więcej niż w zeszłym miesiącu`
            : `Wydajesz ${Math.round(-pctDiff)}% mniej niż w zeszłym miesiącu`,
          desc: diff > 0
            ? `+${fmt(diff)} · sprawdź na co`
            : `Oszczędziłeś ${fmt(-diff)} · świetna robota!`,
          color: diff > 0 ? "#ef4444" : "#10b981",
        });
      }
    }
  }

  // 4. Weekend vs week day spending
  const byDay = spendByWeekday(curTx);
  const weekdaySpend = byDay.spending[1] + byDay.spending[2] + byDay.spending[3] + byDay.spending[4] + byDay.spending[5];
  const weekendSpend = byDay.spending[0] + byDay.spending[6];
  const weekdayCount = byDay.counts[1] + byDay.counts[2] + byDay.counts[3] + byDay.counts[4] + byDay.counts[5];
  const weekendCount = byDay.counts[0] + byDay.counts[6];

  if (weekdayCount >= 5 && weekendCount >= 2) {
    const avgWeekday = weekdaySpend / 5;
    const avgWeekend = weekendSpend / 2;
    if (avgWeekend > avgWeekday * 1.3) {
      const pctMore = Math.round(((avgWeekend - avgWeekday) / avgWeekday) * 100);
      insights.push({
        type: "weekend_spending",
        priority: 5,
        icon: "🎉",
        title: `Wydajesz ${pctMore}% więcej w weekendy`,
        desc: `Średnio ${fmt(avgWeekend)}/dzień vs ${fmt(avgWeekday)} w tygodniu`,
        color: "#f59e0b",
      });
    }
  }

  // 5. Yearly projection dla top kategorii
  if (cats.length > 0 && curTx.length >= 10) {
    const top = cats[0];
    const yearlyProjection = top.total * 12;
    if (yearlyProjection >= 2000) {
      insights.push({
        type: "yearly_projection",
        priority: 6,
        icon: "💰",
        title: `W tym tempie wydasz ${fmt(yearlyProjection)} rocznie na ${capitalizeCat(top.cat)}`,
        desc: `To równowartość ${estimateEquivalent(yearlyProjection)}`,
        color: "#8b5cf6",
      });
    }
  }

  // 6. Unusual transaction (large outlier)
  const recentTx = curTx.filter(t => t.amount < 0 && t.cat !== "inne");
  if (recentTx.length >= 5) {
    const amounts = recentTx.map(t => Math.abs(t.amount));
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const largest = Math.max(...amounts);
    if (largest >= avg * 4 && largest >= 200) {
      const outlier = recentTx.find(t => Math.abs(t.amount) === largest);
      if (outlier) {
        insights.push({
          type: "unusual",
          priority: 4,
          icon: "⚡",
          title: `Największy wydatek: ${outlier.desc}`,
          desc: `${fmt(largest)} — ${Math.round(largest / avg)}x więcej niż średnia`,
          color: "#ef4444",
        });
      }
    }
  }

  // Dodaj retirement insights
  const retirementIns = generateRetirementInsights(accounts);
  insights.push(...retirementIns);

  // Sortuj po priorytecie i zwróć top 3
  return insights.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

function capitalizeCat(cat) {
  if (!cat) return "";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function estimateEquivalent(amount) {
  if (amount >= 15000) return `wakacji all-inclusive na 2 osoby`;
  if (amount >= 8000) return `nowego MacBooka Air`;
  if (amount >= 5000) return `iPhone 15`;
  if (amount >= 3000) return `Apple Watch Ultra`;
  if (amount >= 2000) return `weekend w Krakowie dla 2 osób`;
  return `pełnego baku diesla 50 razy`;
}

export { generateInsights };

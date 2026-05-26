// Generator personalizowanych insightów finansowych dla Dashboardu.
// Zamiast pokazywać liczby, pokazuje "historie".
//
// v1.3.9: Rozbudowa puli (6 → 13 reguł) + variety mechanism z dziennym seedem.
// Wcześniej apka pokazywała te same 3 insighty codziennie bo z 6 reguł 3-4 zawsze
// trafiały dla stabilnej sytuacji finansowej, sort po stałym `priority` i slice(0, 3).

import { fmt } from "../utils.js";
import { generateRetirementInsights } from "./retirementCalc.js";
import { getTripSpending, groupTrips } from "./trips.js";

const INSIGHT_IGNORED_CATS = ["rachunki", "rząd", "inwestycje", "inne"];

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

function splitByMonth(transactions, cycleDay = 1) {
  const now = new Date();

  if (cycleDay <= 1) {
    const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
    return {
      current: transactions.filter(t => t.date?.startsWith(curYM)),
      previous: transactions.filter(t => t.date?.startsWith(prevYM)),
    };
  }

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
  const prevStartY = curStartM === 0 ? curStartY - 1 : curStartY;
  const prevStartM = curStartM === 0 ? 11 : curStartM - 1;
  const prevEnd    = `${curStartY}-${pad(curStartM+1)}-${pad(cycleDay-1)}`;
  const prevStart  = `${prevStartY}-${pad(prevStartM+1)}-${pad(cycleDay)}`;

  return {
    current:  transactions.filter(t => t.date >= curStart  && t.date <= curEnd),
    previous: transactions.filter(t => t.date >= prevStart && t.date <= prevEnd),
  };
}

function spendByWeekday(transactions) {
  const byDay = [0, 0, 0, 0, 0, 0, 0];
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

function generateInsights(transactions, budgets = [], accounts = [], cycleDay = 1, trips = []) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  const { current: curTx, previous: prevTx } = splitByMonth(transactions, cycleDay);
  if (curTx.length < 3) return [];

  const critical = [];        // priorytet, zawsze pokazane (alarmy, deficyt)
  const informational = [];   // losowane z dziennym seedem

  const cats = groupByCategory(curTx);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const merchants = groupByMerchant(curTx);

  // ═══ CRITICAL ═══

  // R1: Anomalia pojedynczej transakcji
  const recentTx = curTx.filter(t => t.amount < 0 && t.cat !== "inne");
  if (recentTx.length >= 5) {
    const amounts = recentTx.map(t => Math.abs(t.amount));
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const largest = Math.max(...amounts);
    if (largest >= avg * 4 && largest >= 200) {
      const outlier = recentTx.find(t => Math.abs(t.amount) === largest);
      if (outlier) {
        critical.push({
          type: "unusual",
          icon: "⚡",
          title: `Największy wydatek: ${outlier.desc}`,
          desc: `${fmt(largest)} — ${Math.round(largest / avg)}x więcej niż średnia`,
          color: "#ef4444",
        });
      }
    }
  }

  // ═══ INFORMATIONAL — losowane ═══

  // I1: Top kategoria
  if (cats.length > 0) {
    const top = cats[0];
    const pct = total > 0 ? Math.round((top.total / total) * 100) : 0;
    informational.push({
      type: "top_category",
      icon: "📊",
      title: `${capitalizeCat(top.cat)} to Twoja największa kategoria`,
      desc: `${fmt(top.total)} w tym miesiącu — ${pct}% wszystkich wydatków`,
      color: "#3b82f6",
    });
  }

  // I2: Top merchant (wymaga >=3 wizyty)
  if (merchants.length > 0 && merchants[0].count >= 3) {
    const top = merchants[0];
    const avgPerVisit = top.count > 0 ? top.total / top.count : 0;
    informational.push({
      type: "top_merchant",
      icon: "🎯",
      title: `${top.name} — ${top.count}x w tym miesiącu`,
      desc: `Razem ${fmt(top.total)} · średnio ${fmt(avgPerVisit)} za wizytę`,
      color: "#8b5cf6",
    });
  }

  // I3: Month vs month
  if (prevTx.length >= 3) {
    const curExp = curTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevExp = prevTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s, t) => s + Math.abs(t.amount), 0);
    if (prevExp > 0 && curExp > 0) {
      const diff = curExp - prevExp;
      const pctDiff = (diff / prevExp) * 100;
      if (Math.abs(pctDiff) >= 10) {
        informational.push({
          type: "month_comparison",
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

  // I4: Weekend vs week
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
      informational.push({
        type: "weekend_spending",
        icon: "🎉",
        title: `Wydajesz ${pctMore}% więcej w weekendy`,
        desc: `Średnio ${fmt(avgWeekend)}/dzień vs ${fmt(avgWeekday)} w tygodniu`,
        color: "#f59e0b",
      });
    } else if (avgWeekend < avgWeekday * 0.5) {
      informational.push({
        type: "weekend_low",
        icon: "📅",
        title: "Mało wydajesz w weekendy",
        desc: `Średnio ${fmt(avgWeekend)}/dzień — typowy weekend low-cost`,
        color: "#10b981",
      });
    }
  }

  // I5: Yearly projection top kategorii
  if (cats.length > 0 && curTx.length >= 10) {
    const top = cats[0];
    const yearlyProjection = top.total * 12;
    if (yearlyProjection >= 2000) {
      informational.push({
        type: "yearly_projection",
        icon: "💰",
        title: `W tym tempie wydasz ${fmt(yearlyProjection)} rocznie na ${capitalizeCat(top.cat)}`,
        desc: `To równowartość ${estimateEquivalent(yearlyProjection)}`,
        color: "#8b5cf6",
      });
    }
  }

  // I6: Druga kategoria - jeśli też duża
  if (cats.length >= 2) {
    const second = cats[1];
    const pct = total > 0 ? Math.round((second.total / total) * 100) : 0;
    if (pct >= 15 && second.total >= 500) {
      informational.push({
        type: "second_category",
        icon: "📂",
        title: `Druga największa: ${capitalizeCat(second.cat)} — ${fmt(second.total)}`,
        desc: `${pct}% wydatków · ${second.count} ${second.count === 1 ? "transakcja" : "transakcji"}`,
        color: "#6366f1",
      });
    }
  }

  // I7: Liczba transakcji - wzorce konsumenckie
  const txCount = recentTx.length;
  if (txCount >= 30) {
    const avgDaily = total / Math.max(1, txCount);
    informational.push({
      type: "tx_count_high",
      icon: "🔢",
      title: `${txCount} transakcji w tym miesiącu`,
      desc: `Średnio ${fmt(avgDaily)} na transakcję — dużo małych zakupów`,
      color: "#06b6d4",
    });
  } else if (txCount <= 8 && total >= 1000) {
    informational.push({
      type: "tx_count_low",
      icon: "📦",
      title: `Tylko ${txCount} transakcji ale ${fmt(total)}`,
      desc: `Pojedyncze duże wydatki dominują nad codziennym konsumowaniem`,
      color: "#a855f7",
    });
  }

  // I8: Najczęstszy dzień tygodnia
  const dowNames = ["Niedziele", "Poniedziałki", "Wtorki", "Środy", "Czwartki", "Piątki", "Soboty"];
  if (txCount >= 10) {
    const dowSums = byDay.spending.slice();
    const maxDow = dowSums.indexOf(Math.max(...dowSums));
    const maxSum = dowSums[maxDow];
    const totalDow = dowSums.reduce((s, v) => s + v, 0);
    if (totalDow > 0 && maxSum / totalDow > 0.30) {
      const pct = Math.round((maxSum / totalDow) * 100);
      informational.push({
        type: "top_dow",
        icon: "📆",
        title: `${dowNames[maxDow]} = ${pct}% wydatków`,
        desc: `Średnio ${fmt(maxSum)} każdego ${dowNames[maxDow].toLowerCase().slice(0, -1)}`,
        color: "#f59e0b",
      });
    }
  }

  // I9: Drugi merchant (lojalność)
  if (merchants.length >= 2 && merchants[1].count >= 2) {
    const second = merchants[1];
    informational.push({
      type: "merchant_loyalty",
      icon: "🛒",
      title: `${second.name} — ${second.count}x odwiedzin`,
      desc: `Razem ${fmt(second.total)} · stały klient`,
      color: "#ec4899",
    });
  }

  // I10: Stała kwota tygodniowa
  const weekTotal = weekdaySpend + weekendSpend;
  if (weekTotal > 0 && txCount >= 7) {
    const avgWeek = weekTotal / Math.max(1, txCount / 7);
    if (avgWeek >= 200) {
      informational.push({
        type: "weekly_avg",
        icon: "💸",
        title: `Średnio ${fmt(avgWeek)} tygodniowo`,
        desc: `Stabilny rytm wydatków przez cały miesiąc`,
        color: "#14b8a6",
      });
    }
  }

  // I11: Zmiana top kategorii vs poprzedni miesiąc
  if (cats.length > 0 && prevTx.length >= 5) {
    const prevCats = groupByCategory(prevTx);
    if (prevCats.length > 0 && prevCats[0].cat !== cats[0].cat) {
      informational.push({
        type: "category_shift",
        icon: "🔀",
        title: `Top kategoria się zmieniła`,
        desc: `Z "${capitalizeCat(prevCats[0].cat)}" na "${capitalizeCat(cats[0].cat)}" w tym miesiącu`,
        color: "#06b6d4",
      });
    }
  }

  // I12: Średnia wartość transakcji
  if (txCount >= 5) {
    const avg = total / txCount;
    if (avg >= 100) {
      informational.push({
        type: "avg_tx",
        icon: "🎫",
        title: `Średnio ${fmt(avg)} za transakcję`,
        desc: `${txCount} transakcji w tym cyklu, suma ${fmt(total)}`,
        color: "#3b82f6",
      });
    }
  }

  // ═══ TRIP / WAKACJE (v1.5.1) ═══
  // Wakacje to nowy game-changer kategoria insightów. Reguły pokazują się tylko
  // gdy user ma >=1 wyjazd. Aktywny wyjazd ma osobny critical alert dla budgetu.

  if (Array.isArray(trips) && trips.length > 0 && transactions.length > 0) {
    const todayISO = new Date().toISOString().slice(0, 10);
    const yearStr = String(new Date().getFullYear());

    // Grupy wyjazdów dla bieżącej daty
    const tripGroups = groupTrips(trips, todayISO);

    // R-trip-1 (CRITICAL): aktywny wyjazd przekroczył budżet
    for (const trip of tripGroups.active) {
      if (!trip.budget || trip.budget <= 0) continue;
      const sp = getTripSpending(transactions, trip.id);
      const pct = (sp.total / trip.budget) * 100;
      if (pct >= 100) {
        critical.push({
          type: "trip_over_budget",
          icon: "🚨",
          title: `${trip.name}: ${Math.round(pct)}% budżetu`,
          desc: `${fmt(sp.total)} z ${fmt(trip.budget)} — przekroczone o ${fmt(sp.total - trip.budget)}`,
          color: "#ef4444",
        });
        break; // jeden trip critical wystarczy
      } else if (pct >= 85) {
        critical.push({
          type: "trip_near_budget",
          icon: "⚠️",
          title: `${trip.name}: blisko budżetu (${Math.round(pct)}%)`,
          desc: `Zostało ${fmt(trip.budget - sp.total)} z ${fmt(trip.budget)}`,
          color: "#f59e0b",
        });
        break;
      }
    }

    // R-trip-2 (INFO): aktywny wyjazd "stan na dziś"
    if (tripGroups.active.length > 0) {
      const trip = tripGroups.active[0];
      const sp = getTripSpending(transactions, trip.id);
      // Liczymy ile dni minęło wyjazdu (z bufforem)
      const tripStart = new Date(trip.dateFrom + "T00:00:00");
      const today = new Date(todayISO + "T00:00:00");
      const daysElapsed = Math.max(1, Math.round((today - tripStart) / 86400000) + 1);
      const avgDaily = sp.total / daysElapsed;

      if (sp.total > 0) {
        const desc = trip.budget > 0
          ? `${fmt(sp.total)} z ${fmt(trip.budget)} (${Math.round((sp.total / trip.budget) * 100)}%) · ~${fmt(avgDaily)}/dzień`
          : `${fmt(sp.total)} · ~${fmt(avgDaily)}/dzień`;
        informational.push({
          type: "trip_active",
          icon: "🏖️",
          title: `Aktywny wyjazd: ${trip.name}`,
          desc,
          color: trip.color || "#06b6d4",
        });
      }
    }

    // R-trip-3 (INFO): suma wszystkich wyjazdów w roku + % od total wydatków rocznych
    const yearTrips = trips.filter(t =>
      (t.dateFrom || "").startsWith(yearStr) || (t.dateTo || "").startsWith(yearStr)
    );
    if (yearTrips.length >= 1) {
      const yearTripIds = new Set(yearTrips.map(t => t.id));
      const yearTripSpent = transactions
        .filter(t => t.tripId != null && yearTripIds.has(t.tripId) &&
                     t.amount < 0 && t.cat !== "inne" && (t.date || "").startsWith(yearStr))
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      if (yearTripSpent > 0) {
        const yearAllExp = transactions
          .filter(t => t.amount < 0 && t.cat !== "inne" && (t.date || "").startsWith(yearStr))
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        const pctOfYear = yearAllExp > 0 ? (yearTripSpent / yearAllExp) * 100 : 0;
        const tripsWord = yearTrips.length === 1 ? "wyjazd"
                       : yearTrips.length < 5 ? "wyjazdy" : "wyjazdów";
        informational.push({
          type: "trips_year_total",
          icon: "✈️",
          title: `${yearTrips.length} ${tripsWord} w ${yearStr}: ${fmt(yearTripSpent)}`,
          desc: pctOfYear >= 1
            ? `${Math.round(pctOfYear)}% twoich rocznych wydatków`
            : `Mała część rocznych wydatków`,
          color: "#0ea5e9",
        });
      }
    }

    // R-trip-4 (INFO): najdroższy wyjazd roku (gdy >= 2 trips w roku, żeby było co porównać)
    if (yearTrips.length >= 2) {
      const tripCosts = yearTrips.map(t => ({
        trip: t,
        spent: getTripSpending(transactions, t.id).total,
      })).filter(x => x.spent > 0);

      if (tripCosts.length >= 2) {
        tripCosts.sort((a, b) => b.spent - a.spent);
        const top = tripCosts[0];
        const avgRest = tripCosts.slice(1).reduce((s, x) => s + x.spent, 0) / (tripCosts.length - 1);
        if (top.spent >= avgRest * 1.2) {
          const overPct = avgRest > 0 ? Math.round(((top.spent - avgRest) / avgRest) * 100) : 0;
          informational.push({
            type: "trip_most_expensive",
            icon: "💎",
            title: `${top.trip.name} — najdroższy wyjazd roku`,
            desc: `${fmt(top.spent)} · ${overPct}% więcej niż średni pozostały`,
            color: top.trip.color || "#8b5cf6",
          });
        }
      }
    }

    // R-trip-5 (INFO): nadchodzący wyjazd (do 14 dni)
    if (tripGroups.upcoming.length > 0) {
      const next = tripGroups.upcoming[0];
      const tripStart = new Date(next.dateFrom + "T00:00:00");
      const today = new Date(todayISO + "T00:00:00");
      const daysToGo = Math.round((tripStart - today) / 86400000);
      if (daysToGo >= 0 && daysToGo <= 14) {
        const sp = getTripSpending(transactions, next.id); // pre-trip expenses (lot, hotel)
        const preExpDesc = sp.total > 0
          ? `Pre-wyjazd: ${fmt(sp.total)} ${next.budget > 0 ? `z ${fmt(next.budget)} budżetu` : ""}`
          : (next.budget > 0 ? `Budżet ${fmt(next.budget)} czeka` : "Czeka cię nowy wyjazd");
        informational.push({
          type: "trip_upcoming",
          icon: "🛫",
          title: daysToGo === 0
            ? `${next.name} startuje dziś!`
            : `${next.name} za ${daysToGo} ${daysToGo === 1 ? "dzień" : daysToGo < 5 ? "dni" : "dni"}`,
          desc: preExpDesc,
          color: next.color || "#10b981",
        });
      }
    }
  }

  // ═══ MERGE + VARIETY ═══
  // Daily seed - inny dzień = inny zestaw informational. Critical zawsze pierwsze.
  const today = new Date();
  const epochDays = Math.floor(today.getTime() / 86400000);
  const seed = epochDays + (cycleDay * 7);

  // Linear congruential shuffle (deterministic)
  const shuffled = [...informational];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const r = ((seed * (i + 1) * 1103515245 + 12345) >>> 0) % (i + 1);
    [shuffled[r], shuffled[i]] = [shuffled[i], shuffled[r]];
  }

  // Slot 1-2: critical (max 2). Slot 3+: informational. Total 3.
  const final = [
    ...critical.slice(0, 2),
    ...shuffled.slice(0, 3 - Math.min(2, critical.length)),
  ];

  // Dodaj retirement insights (nie wpływają na variety, są kontekstowe)
  const retirementIns = generateRetirementInsights(accounts);

  // Sort - retirement insights mają już swoje priority, dorzucamy je tylko jeśli zostało miejsce
  if (retirementIns.length > 0 && final.length < 3) {
    final.push(...retirementIns.slice(0, 3 - final.length));
  }

  return final.slice(0, 3);
}

export { generateInsights };

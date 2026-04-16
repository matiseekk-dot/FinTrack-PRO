import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft, ChevronRight,
  Home, List, PiggyBank, BarChart2, Settings, ArrowUpRight, ArrowDownLeft,
  CreditCard, Briefcase, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Eye, EyeOff, Edit2, Trash2, Check,
  Bell, BellOff, CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
  ClipboardList, RefreshCw, AlarmClock, Copy
} from "lucide-react";
import { Card, Badge } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel, buildHistData } from "../utils.js";
import { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats, INITIAL_TEMPLATES } from "../constants.js";
import { DailyReminder } from "../components/DailyReminder.jsx";
import { RecurringReminder, MiniComparison } from "../components/SharedWidgets.jsx";

const EXPENSE_TYPES = {
  investment: ["inwestycje"],
  fixed:      ["rachunki","zakupy"],
  uncontrollable: ["rzad","rząd"],   // podatki, kredyty — user nie moze ograniczyc
  variable:   ["jedzenie","transport","zdrowie"],
  lifestyle:  ["kawiarnia","rozrywka","muzyka","ubrania","prezenty","alkohol","bukmacher","inne"],
};
// Kategorie ktore user NIE moze kontrolowac — nie dawaj rekomendacji
const UNCONTROLLABLE_CATS = ["rząd","rzad","inwestycje","rachunki"];
// Sprecyzuj: rachunki sa "fixed" ale czesciowo kontrolowalne (subskrypcje tak, kredyt nie)
// Na potrzeby rekomendacji: tylko lifestyle i variable sa "controlable"
const isControllable = (cat) => {
  return ["kawiarnia","rozrywka","muzyka","ubrania","prezenty","alkohol",
          "bukmacher","jedzenie","transport","zakupy"].includes(cat);
};
const getExpenseType = (cat) => {
  for (const [type, cats] of Object.entries(EXPENSE_TYPES)) {
    if (cats.includes(cat)) return type;
  }
  return "variable";
};
// Compute "recurring" expense — removes one-time outliers for burn rate
// Excludes: taxes (rząd), investments, and single transactions > 4x median daily
const getRecurringExpense = (transactions, month, cycleDay) => {
  const skipCats = ["rząd","rzad","inwestycje","inne","przychód","sprzedaż","dodatkowe","bukmacherka"];
  const tx = cycleTxs(transactions, month, cycleDay)
    .filter(t => t.amount < 0 && !skipCats.includes(t.cat));

  // Group by day to find daily totals
  const dayMap = {};
  tx.forEach(t => { dayMap[t.date] = (dayMap[t.date]||0) + Math.abs(t.amount); });
  const dayVals = Object.values(dayMap).sort((a,b)=>a-b);
  if (dayVals.length === 0) return { recurring: 0, oneTime: 0, skipTotal: 0 };

  // Median daily spend
  const median = dayVals[Math.floor(dayVals.length / 2)] || 1;
  const threshold = Math.max(median * 4, 500); // single day >4x median = one-time

  let recurring = 0, oneTime = 0;
  Object.entries(dayMap).forEach(([, v]) => {
    if (v > threshold) oneTime += v;
    else recurring += v;
  });
  const skipTotal = cycleTxs(transactions, month, cycleDay)
    .filter(t => t.amount < 0 && skipCats.includes(t.cat))
    .reduce((s,t) => s + Math.abs(t.amount), 0);

  return { recurring, oneTime, skipTotal };
};


// ── FINANCIAL SCORE ──────────────────────────────────────────────
function FinancialScore({ income, expense, transactions, month, cycleDay, elapsedDays }) {
  const savingsRate = income > 0 ? (income - expense) / income * 100 : 0;
  let scoreS = savingsRate > 20 ? 30 : savingsRate > 10 ? 20 : savingsRate > 0 ? 10 : 0;

  // Stability: std deviation of daily spend
  const prev3 = [-3,-2,-1].map(o => {
    const m = ((month + 12 + o) % 12);
    return cycleTxs(transactions, m, cycleDay)
      .filter(t => t.amount < 0 && getExpenseType(t.cat) !== "investment" && t.cat !== "inne")
      .reduce((s,t) => s + Math.abs(t.amount), 0);
  }).filter(v => v > 100); // only count months with real data
  const avg3 = prev3.length >= 2 ? prev3.reduce((s,v) => s+v, 0) / prev3.length : 0;
  const trend = avg3 > 0 ? expense / avg3 : 1; // neutral if no history
  let scoreT = avg3 === 0 ? 10 : trend < 0.85 ? 20 : trend < 1.15 ? 10 : 0;

  // Daily variance
  const dayMap = {};
  const curTx = cycleTxs(transactions, month, cycleDay)
    .filter(t => t.amount < 0 && getExpenseType(t.cat) !== "investment" && t.cat !== "inne");
  curTx.forEach(t => { const d = t.date; dayMap[d] = (dayMap[d]||0) + Math.abs(t.amount); });
  const dayVals = Object.values(dayMap);
  const dayAvg = dayVals.length ? dayVals.reduce((s,v)=>s+v,0)/dayVals.length : 0;
  const dayStd = dayVals.length > 1
    ? Math.sqrt(dayVals.map(v=>(v-dayAvg)**2).reduce((s,v)=>s+v,0)/dayVals.length) : 0;
  const cv = dayAvg > 0 ? dayStd / dayAvg : 0;
  let scoreV = cv < 0.5 ? 20 : cv < 1.0 ? 10 : 0;

  // Expense ratio
  const realExp = expense;
  const expRatio = income > 0 ? realExp / income : 1;
  let scoreE = expRatio < 0.7 ? 30 : expRatio < 0.9 ? 20 : expRatio < 1.0 ? 10 : 0;

  const score = Math.round(scoreS + scoreT + scoreV + scoreE);
  const ring  = score >= 75 ? "#10b981" : score >= 55 ? "#f59e0b" : score >= 35 ? "#f97316" : "#ef4444";
  // Konkretne komunikaty — co dokładnie jest nie tak
  const label = score >= 90 ? "Doskonale 🟢" :
                score >= 75 ? "Dobrze 🟢" :
                score >= 55 ? "Uwaga 🟡" :
                score >= 35 ? "Do poprawy 🟠" : "Krytyczne 🔴";

  // Diagnoza — pierwsza rzecz do naprawy
  const sub = (() => {
    if (expRatio >= 1.0)  return "Wydajesz więcej niż zarabiasz";
    if (savingsRate < 10) return `Oszczędzasz tylko ${savingsRate.toFixed(0)}% — cel to min. 15%`;
    if (avg3 > 0 && trend > 1.15) return `Wydatki rosną — o ${((trend-1)*100).toFixed(0)}% vs poprzednie mies.`;
    if (cv > 1.0)         return "Duże skoki wydatków dzień do dnia";
    if (expRatio > 0.85)  return `Wydano ${(expRatio*100).toFixed(0)}% przychodów — powyżej normy`;
    if (score >= 75)      return "Finanse pod kontrolą";
    return "Jedna kategoria do poprawy";
  })();

  const r = 28, circ = 2 * Math.PI * r;
  const dash = circ * score / 100;

  // Detect unusual month: uncontrollable costs > 40% of expense
  const uncontrolTotal = expense > 0
    ? (["rząd","rzad","rachunki"].reduce((s, cat) => {
        const tx = cycleTxs(transactions, month, cycleDay)
          .filter(t => t.cat === cat && t.amount < 0);
        return s + tx.reduce((ss,t) => ss + Math.abs(t.amount), 0);
      }, 0))
    : 0;
  const isUnusualMonth = expense > 0 && uncontrolTotal / expense > 0.35;

  return (
    <Card style={{ padding: "14px 16px" }}>
      {isUnusualMonth && (
        <div style={{ background: "#0d1f35", border: "1px solid #2563eb33",
          borderRadius: 8, padding: "7px 10px", marginBottom: 10,
          fontSize: 11, color: "#60a5fa" }}>
          Ten miesiac zawiera koszty jednorazowe (podatki / rachunki).
          Wskazniki nie odzwierciedlaja normalnych nawykow.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r={r} fill="none" stroke="#1a2744" strokeWidth="6"/>
            <circle cx="36" cy="36" r={r} fill="none" stroke={ring} strokeWidth="6"
              strokeDasharray={circ} strokeDashoffset={circ - dash}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color: ring, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 8, color: "#475569", fontWeight: 600 }}>/ 100</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: ring, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>{sub}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { lbl: "Oszczędności", val: savingsRate >= 0 ? savingsRate.toFixed(0)+"%" : "deficit",
                ok: savingsRate >= 15, tip: savingsRate < 15 ? "cel: 15%+" : "" },
              { lbl: "Trend wydatków", val: avg3 === 0 ? "brak danych" :
                                    trend < 1 ? "▼"+(Math.min(999,((1-trend)*100)).toFixed(0))+"% vs śr."
                                              : "▲"+(Math.min(999,((trend-1)*100)).toFixed(0))+"% vs śr.",
                                ok: avg3 === 0 || trend <= 1.05 },
              { lbl: "Wydano z przych.", val: (expRatio*100).toFixed(0)+"%", ok: expRatio < 0.85,
                tip: expRatio >= 0.85 ? "norma: <85%" : "" },
            ].map(({lbl,val,ok,tip}) => (
              <div key={lbl} style={{ background: "#060b14", borderRadius: 6,
                padding: "3px 8px", fontSize: 10 }}>
                <span style={{ color: "#475569" }}>{lbl}: </span>
                <span style={{ color: ok ? "#10b981" : "#f59e0b", fontWeight: 700 }}>{val}</span>
                {tip && <span style={{ color: "#334155" }}> ({tip})</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

// ── INSIGHTS ENGINE ───────────────────────────────────────────────
function Insights({ transactions, month, cycleDay, income, expense, catData }) {
  const insights = useMemo(() => {
    const list = [];
    const curTx = cycleTxs(transactions, month, cycleDay).filter(t => t.cat !== "inne");
    const prev3 = [-3,-2,-1].map(o => {
      const m = ((month + 12 + o) % 12);
      return cycleTxs(transactions, m, cycleDay)
        .filter(t => t.amount < 0 && t.cat !== "inne")
        .reduce((s,t) => s + Math.abs(t.amount), 0);
    }).filter(v => v > 200); // only real months with data
    const avg3 = prev3.length >= 2 ? prev3.reduce((s,v)=>s+v,0)/prev3.length : 0;

    // Reguła A — jednorazowy duzy wydatek
    if (catData.length > 0) {
      const top = catData[0];
      const topPct = expense > 0 ? top.val / expense * 100 : 0;
      const topCount = curTx.filter(t => t.cat === top.cat && t.amount < 0).length;
      if (topPct > 35 && topCount <= 3) {
        list.push({ type: "info", icon: "💡",
          title: top.label + " = " + topPct.toFixed(0) + "% wydatkow",
          sub: "Jednorazowy koszt — nie odzwierciedla normalnego miesiaca." });
      }
    }

    // Reguła B — anomalia dzienna
    const dayMap = {};
    curTx.filter(t => t.amount < 0).forEach(t => {
      dayMap[t.date] = (dayMap[t.date]||0) + Math.abs(t.amount);
    });
    const dayEntries = Object.entries(dayMap).sort((a,b)=>b[1]-a[1]);
    if (dayEntries.length > 2) {
      const avgDay = Object.values(dayMap).reduce((s,v)=>s+v,0) / Object.values(dayMap).length;
      const [maxDate, maxVal] = dayEntries[0];
      if (maxVal > avgDay * 3) {
        list.push({ type: "warning", icon: "!",
          title: maxDate.slice(5).replace("-",".") + " — " + fmt(maxVal),
          sub: (maxVal/avgDay).toFixed(1) + "x powyzej zwyklego dnia wydatkow." });
      }
    }

    // Reguła C — trend vs 3M
    if (avg3 > 0) {
      const diff = (expense - avg3) / avg3 * 100;
      if (diff > 20) {
        const topCatName = catData[0] ? catData[0].label : "";
        list.push({ type: "warning", icon: "↑",
          title: "Wydatki +" + diff.toFixed(0) + "% vs srednia 3M",
          sub: "Glownie przez: " + topCatName + "." });
      } else if (diff < -15) {
        list.push({ type: "positive", icon: "↓",
          title: "Wydatki -" + Math.abs(diff).toFixed(0) + "% vs srednia 3M",
          sub: "Dobry miesiac — ponizej sredniej." });
      }
    }

    // Reguła D — lifestyle rosnie
    const lifestyleCur  = curTx.filter(t => t.amount < 0 && getExpenseType(t.cat) === "lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
    const lifestylePrev = cycleTxs(transactions, (month+11)%12, cycleDay)
      .filter(t => t.amount < 0 && getExpenseType(t.cat) === "lifestyle")
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    if (lifestylePrev > 0 && lifestyleCur > lifestylePrev * 1.2) {
      list.push({ type: "warning", icon: "↑",
        title: "Lifestyle +" + (((lifestyleCur/lifestylePrev)-1)*100).toFixed(0) + "% vs poprzedni mies.",
        sub: "Przejrzyj subskrypcje i restauracje." });
    }

    // Reguła E — stopa oszczednosci
    const savingsRate = income > 0 ? (income - expense) / income * 100 : 0;
    if (savingsRate < 0 && income > 0) {
      // Detect if deficit is from uncontrollable costs
      const uncontrolExp = (catData || [])
        .filter(c => UNCONTROLLABLE_CATS.includes(c.cat))
        .reduce((s,c) => s + c.val, 0);
      const isStructural = uncontrolExp > Math.abs(income - expense) * 0.5;
      if (isStructural) {
        list.push({ type: "info", icon: "💡",
          title: "Deficyt z kosztu jednorazowego",
          sub: "Bez niego bilans bylby dodatni. Nie wymaga zmian w nawykach." });
      } else {
        list.push({ type: "alert", icon: "⚠",
          title: "Wydajesz wiecej niz zarabiasz",
          sub: "Deficyt: " + fmt(Math.abs(income - expense)) + " zl. Ogranicz wydatki kontrolowalne." });
      }
    } else if (savingsRate < 10 && income > 0) {
      const gap = income * 0.15 - (income - expense);
      list.push({ type: "alert", icon: "⚠",
        title: "Niska stopa oszczednosci: " + savingsRate.toFixed(0) + "%",
        sub: "Cel min. 15% → brakuje " + fmt(Math.max(0,gap)) + " zl/mies." });
    }

    // Deficyt wyjaśnienie
    if (income < expense && catData.length > 0) {
      const deficit = expense - income;
      const top = catData[0];
      const pct = (top.val / deficit * 100).toFixed(0);
      list.push({ type: "alert", icon: "−",
        title: "Deficyt " + fmt(deficit) + " — glownie: " + top.label,
        sub: top.label + " odpowiada za " + pct + "% deficytu." });
    }

    return list.slice(0, 4);
  }, [transactions, month, cycleDay, income, expense, catData]);

  if (insights.length === 0) return null;

  const typeStyle = {
    alert:    { bg: "#1a0808", border: "#ef444444", icon: "#ef4444" },
    warning:  { bg: "#1a1208", border: "#f59e0b44", icon: "#f59e0b" },
    info:     { bg: "#0d1628", border: "#3b82f644", icon: "#60a5fa" },
    positive: { bg: "#0a1e12", border: "#10b98144", icon: "#10b981" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em" }}>Insighty</div>
      {insights.map((ins, i) => {
        const s = typeStyle[ins.type] || typeStyle.info;
        return (
          <div key={i} style={{ background: s.bg, border: "1px solid " + s.border,
            borderRadius: 12, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.icon,
              width: 22, textAlign: "center", flexShrink: 0 }}>{ins.icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{ins.title}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{ins.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── EXPENSE TYPES BREAKDOWN ──────────────────────────────────────
function ExpenseTypesBreakdown({ monthTx, income }) {
  const fixed      = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="fixed").reduce((s,t)=>s+Math.abs(t.amount),0);
  const variable   = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="variable").reduce((s,t)=>s+Math.abs(t.amount),0);
  const lifestyle  = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
  const investment = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="investment").reduce((s,t)=>s+Math.abs(t.amount),0);
  const total = fixed + variable + lifestyle;

  const types = [
    { lbl: "Stale",     val: fixed,      color: "#3b82f6", norm: 50 },
    { lbl: "Zmienne",   val: variable,   color: "#f59e0b", norm: 30 },
    { lbl: "Lifestyle", val: lifestyle,  color: "#ec4899", norm: 20 },
  ];

  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12 }}>Struktura wydatkow</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {types.map(({ lbl, val, color, norm }) => {
          const pct    = total > 0 ? val / total * 100 : 0;
          const pctInc = income > 0 ? val / income * 100 : 0;
          const over   = pctInc > norm;
          return (
            <div key={lbl}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{lbl}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: over ? "#f59e0b" : "#475569" }}>
                    {pctInc.toFixed(0)}% doch. {over ? "↑" : ""}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12,
                    fontWeight: 700, color }}>{fmtShort(val)} zl</span>
                </div>
              </div>
              <div style={{ background: "#060b14", borderRadius: 4, height: 6 }}>
                <div style={{ width: pct + "%", height: "100%", borderRadius: 4,
                  background: color, opacity: over ? 1 : 0.7, transition: "width 0.5s" }}/>
              </div>
            </div>
          );
        })}
      </div>

      {investment > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1a2744",
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700 }}>Inwestycje</div>
            <div style={{ fontSize: 10, color: "#475569" }}>Nie sa wydatkiem — to alokacja majatku</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14,
              fontWeight: 700, color: "#8b5cf6" }}>{fmtShort(investment)} zl</div>
            <div style={{ fontSize: 10, color: "#475569" }}>
              {income > 0 ? (investment/income*100).toFixed(0) : 0}% dochodu
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: "#334155", textAlign: "center" }}>
        Normy: Stale &lt;50% · Zmienne &lt;30% · Lifestyle &lt;20%
      </div>
    </Card>
  );
};

// ── FORECAST ─────────────────────────────────────────────────────
function ForecastWidget({ income, expense, daysLeft, elapsedDays, transactions, month, cycleDay }) {
  if (elapsedDays < 3 || income === 0) return null;
  if (daysLeft === 0) return (
    <Card style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "#475569", textAlign: "center" }}>Okres zakończony</div>
    </Card>
  );
  const totalDays = Math.max(1, elapsedDays + daysLeft);

  // Use recurring expense (without one-time outliers) for burn rate
  const { recurring: recurExpF, oneTime: oneTimeExpF, skipTotal: skipExpF } =
    getRecurringExpense(transactions, month, cycleDay);
  const alreadyPaidFixed = skipExpF + oneTimeExpF; // one-time costs already paid
  const burnRate = elapsedDays > 0 ? recurExpF / elapsedDays : 0;
  if (!isFinite(burnRate)) return null;
  if (burnRate === 0 && recurExpF === 0) return null;

  // Weekly recurring burn rates for opt/pes
  const skipCatsF = ["rząd","rzad","inwestycje","inne"];
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeekAgo = new Date(); twoWeekAgo.setDate(twoWeekAgo.getDate() - 14);
  const toISO = d => d.toISOString().split("T")[0];
  const curTx = cycleTxs(transactions, month, cycleDay)
    .filter(t => t.amount < 0 && !skipCatsF.includes(t.cat));
  // daily map for weekly calc (also excluding outliers)
  const dayMapW = {};
  curTx.forEach(t => { dayMapW[t.date] = (dayMapW[t.date]||0) + Math.abs(t.amount); });
  const medianW = Object.values(dayMapW).sort((a,b)=>a-b)[Math.floor(Object.values(dayMapW).length/2)] || 1;
  const threshW = Math.max(medianW * 4, 500);
  const thisWkExp = curTx.filter(t => t.date >= toISO(weekAgo) && Math.abs(t.amount) <= threshW)
    .reduce((s,t)=>s+Math.abs(t.amount),0);
  const prevWkExp = curTx.filter(t => t.date >= toISO(twoWeekAgo) && t.date < toISO(weekAgo) && Math.abs(t.amount) <= threshW)
    .reduce((s,t)=>s+Math.abs(t.amount),0);

  const burnOpt = prevWkExp > 0 && thisWkExp < prevWkExp ? thisWkExp / 7 : burnRate * 0.8;
  const burnPes = thisWkExp > 0 && thisWkExp / 7 > burnRate ? thisWkExp / 7 : burnRate * 1.3;

  // Forecast = income - one-time already paid - projected recurring
  const projBase = income - alreadyPaidFixed - burnRate * totalDays;
  const projOpt  = income - alreadyPaidFixed - burnOpt  * totalDays;
  const projPes  = income - alreadyPaidFixed - burnPes  * totalDays;

  const col = v => v >= 0 ? "#10b981" : "#ef4444";
  const sign = v => v >= 0 ? "+" : "";

  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 10 }}>Prognoza konca cyklu</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { lbl: "Pesymist.", val: projPes, sub: "jezeli wiecej" },
          { lbl: "Realist.",  val: projBase, sub: "przy obecnym tempie" },
          { lbl: "Optymist.", val: projOpt, sub: "jezeli mniej" },
        ].map(({ lbl, val, sub }) => (
          <div key={lbl} style={{ background: "#060b14", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{lbl}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
              fontWeight: 700, color: col(val) }}>{sign(val)}{fmtShort(val)} zl</div>
            <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#475569", textAlign: "center" }}>
        Codzienny: {fmt(burnRate)}/dzien · jednorazowe: {fmtShort(alreadyPaidFixed)} zl poza prognoza
      </div>
    </Card>
  );
};

// ── RECOMMENDATIONS ───────────────────────────────────────────────
function Recommendations({ income, expense, catData, monthTx, safeToSpend, daysLeft }) {
  const recs = useMemo(() => {
    const list = [];
    const savingsRate = income > 0 ? (income - expense) / income * 100 : 0;
    const lifestyle = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
    const lifestyleNorm = income * 0.20;

    if (safeToSpend <= 0 && income > 0) {
      // Only recommend cutting CONTROLLABLE categories
      const topControllable = catData.find(c => isControllable(c.cat));
      if (topControllable) {
        list.push({ emoji: "✂", text: "Ogranicz " + topControllable.label + " — to " +
          (topControllable.val / expense * 100).toFixed(0) + "% wydatkow." });
      } else {
        // Deficit from uncontrollable costs — explain context
        const topCat = catData[0];
        if (topCat) {
          list.push({ emoji: "💡", text: topCat.label + " to koszt stalowy — deficyt wynika z wyjatkowego wydatku, nie nawyku." });
        }
      }
      if (daysLeft > 0) {
        const maxDaily = Math.max(0, safeToSpend / daysLeft);
        list.push({ emoji: "📉", text: "Cel: max " + fmt(maxDaily) + " zl/dzien przez " + daysLeft + " dni." });
      }
    } else if (savingsRate < 0 && income > 0) {
      // Don't repeat "you're in deficit" if already shown above
      // Just show max daily spend
    } else if (savingsRate < 15 && income > 0) {
      const gap = income * 0.15 - (income - expense);
      list.push({ emoji: "💰", text: "Oszczedzasz " + savingsRate.toFixed(0) + "% dochodu. Cel 15% = brakuje " + fmt(Math.max(0,gap)) + " zl." });
    }

    if (lifestyle > lifestyleNorm && income > 0) {
      list.push({ emoji: "🎯", text: "Lifestyle " + (lifestyle/income*100).toFixed(0) + "% dochodu. Norma <20% — ogranicz o " + fmt(lifestyle - lifestyleNorm) + " zl." });
    }

    const topInvest = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat)==="investment").reduce((s,t)=>s+Math.abs(t.amount),0);
    if (topInvest === 0 && income > 2000) {
      list.push({ emoji: "📈", text: "Brak inwestycji w tym cyklu. Rozważ automat. przelew w dniu wyplaty." });
    }

    if (list.length === 0) {
      list.push({ emoji: "✓", text: "Na dobrej drodze. Utrzymaj tempo — cel miesięczny realny." });
    }

    return list.slice(0, 3);
  }, [income, expense, catData, monthTx, safeToSpend, daysLeft]);

  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12 }}>Rekomendacje</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recs.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{r.emoji}</span>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.4 }}>{r.text}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

function Dashboard({ accounts, transactions, setTransactions, payments, paid = {}, month, setMonth, onAddTx, cycleDay = 1, budgets = [], onRefresh }) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const pullStartY = useRef(0);
  const PULL_THRESHOLD = 65;

  const handleTouchStart = (e) => { pullStartY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => {
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0 && window.scrollY === 0) setPullY(Math.min(dy * 0.4, PULL_THRESHOLD));
  };
  const handleTouchEnd   = () => {
    if (pullY >= PULL_THRESHOLD) {
      setPulling(true);
      if (onRefresh) onRefresh();
      setTimeout(() => { setPulling(false); setPullY(0); }, 1200);
    } else {
      setPullY(0);
    }
  };
  const histData = useMemo(() => buildHistData(transactions, cycleDay), [transactions, cycleDay]);
  const [hideBalance, setHideBalance] = useState(false);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const savings = accounts.filter(a => a.type === "savings").reduce((s, a) => s + a.balance, 0);
  const invest = accounts.filter(a => a.type === "invest").reduce((s, a) => s + a.balance, 0);

  const monthTx = cycleTxs(transactions, month, cycleDay);
  const cycleLabel = fmtCycleLabel(month, cycleDay);
  const income = monthTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
  const balance = income - expense;

  const catData = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.amount < 0 && t.cat !== "inne").forEach(t => {
      map[t.cat] = (map[t.cat] || 0) + Math.abs(t.amount);
    });
    return Object.entries(map).map(([cat, val]) => ({
      cat, val, ...getCat(cat)
    })).sort((a,b) => b.val - a.val);
  }, [monthTx]);

  const incomeData = useMemo(() => {
    // Group by desc (source name) for better breakdown
    const map = {};
    monthTx.filter(t => t.amount > 0 && t.cat !== "inne").forEach(t => {
      const key = t.desc || t.cat;
      if (!map[key]) map[key] = { val: 0, cat: t.cat };
      map[key].val += t.amount;
    });
    return Object.entries(map).map(([desc, d]) => ({
      cat: d.cat, val: d.val, desc,
      ...getCat(d.cat),
      label: desc, // show desc as label
    })).sort((a,b) => b.val - a.val);
  }, [monthTx]);

  const topCats = catData.slice(0, 5);
  const [catTab, setCatTab] = useState("expense"); // "expense" | "income"

  //    Balance widget: days left + daily budget                               
  const today = new Date();
  const todayISO = today.toISOString().split("T")[0];
  const [cycStartStr, cycEndStr] = getCycleRange(month, cycleDay);
  const cycStart = new Date(cycStartStr);
  const cycEnd   = new Date(cycEndStr);
  const totalCycDays = Math.max(1, Math.round((cycEnd - cycStart) / 86400000) + 1);
  const elapsedCycDays = Math.max(1, Math.min(totalCycDays, Math.round((today - cycStart) / 86400000) + 1));
  const daysLeft    = Math.max(0, Math.round((cycEnd - today) / 86400000));
  const { recurring: recurringExp, oneTime: oneTimeExp } = getRecurringExpense(transactions, month, cycleDay);
  const dailySpend  = elapsedCycDays > 0 ? recurringExp / elapsedCycDays : 0;
  const oneTimeNote = oneTimeExp > 200;
  const monthPct    = (elapsedCycDays / totalCycDays) * 100;
  const spendPct    = income > 0 ? (expense / income) * 100 : 0;

  //    Safe to spend: balance minus upcoming unpaid bills this cycle           
  const monthKey = cycEndStr.slice(0, 7); // e.g. "2026-04"
  const upcomingBills = (payments || []).filter(p => {
    if (!p.trackPaid) return false;
    if (p.freq === "weekly" || p.freq === "daily") return false;
    if (paid && paid[`${p.id}_${monthKey}`]) return false; // already paid
    if (p.freq === "bimonthly") {
      const startM = p.startMonth || 0;
      const m = parseInt(monthKey.slice(5)) - 1;
      if (Math.abs(m - startM) % 2 !== 0) return false;
    }
    // Due date in this cycle and still in the future
    const dueISO = `${monthKey}-${String(p.dueDay || 1).padStart(2, "0")}`;
    return dueISO >= todayISO;
  });
  const upcomingTotal = upcomingBills.reduce((s, p) => s + Math.abs(p.amount), 0);
  const safeToSpend = Math.max(0, balance - upcomingTotal);
  const safePerDay  = daysLeft > 0 ? safeToSpend / daysLeft : 0;
  const dailyBudget = safePerDay; // use safe-to-spend as the daily budget

  // Empty state — brak transakcji
  if (transactions.length === 0) return (
    <div
      style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 14,
        transform: `translateY(${pullY}px)`, transition: pullY === 0 ? "transform 0.3s ease" : "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div style={{ paddingTop: 24, textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>👋</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>Zacznij śledzić finanse</div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 28 }}>
          Dodaj pierwszą transakcję żeby zobaczyć analizę, wykresy i raporty.
        </div>
        <button onClick={onAddTx} style={{
          background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none",
          borderRadius: 14, padding: "14px 28px", color: "white",
          fontWeight: 800, fontSize: 15, cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          boxShadow: "0 0 24px #7c3aed44",
        }}>
          + Dodaj pierwszą transakcję
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {[
          { emoji: "💸", title: "Transakcje", desc: "Zapisuj wydatki i przychody w kilka sekund", action: onAddTx, btn: "Dodaj transakcję" },
          { emoji: "📋", title: "Płatności cykliczne", desc: "Czynsz, prąd, subskrypcje — nigdy nie zapomnisz o terminie", action: null, btn: null },
          { emoji: "🎯", title: "Cele oszczędnościowe", desc: "Odkładaj na wakacje, nowy telefon czy poduszkę finansową", action: null, btn: null },
        ].map(({ emoji, title, desc, action, btn }) => (
          <div key={title} style={{
            background: "#0a1120", borderRadius: 16, padding: "16px",
            border: "1px solid #1a2744", display: "flex", gap: 14, alignItems: "flex-start",
          }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>{emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 16,
        transform: `translateY(${pullY}px)`, transition: pullY === 0 ? "transform 0.3s ease" : "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullY > 10 || pulling) && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          zIndex: 50, background: "#1e3a5f", borderRadius: 20, padding: "6px 16px",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 700, color: "#60a5fa",
          fontFamily: "'Space Grotesk', sans-serif",
          boxShadow: "0 4px 16px #00000066",
        }}>
          <span style={{ animation: pulling ? "spin 0.8s linear infinite" : "none",
            display: "inline-block" }}>↻</span>
          {pulling ? "Odświeżam…" : pullY >= PULL_THRESHOLD ? "Puść aby odświeżyć" : "Pociągnij w dół"}
        </div>
      )}
      {/* ALERTY BUDŻETU */}
      {(() => {
        if (!budgets || budgets.length === 0) return null;
        const overBudgets = budgets.filter(b => {
          const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
          return spent >= b.limit * 0.8; // alert od 80% limitu
        }).map(b => {
          const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
          return { ...b, spent, over: spent - b.limit };
        });
        if (overBudgets.length === 0) return null;
        return (
          <div style={{ marginBottom: 14 }}>
            {overBudgets.map(b => {
              const cat = getCat(b.cat);
              const Icon = cat.icon;
              const isOver = b.spent > b.limit;
              return (
                <div key={b.cat} style={{
                  background: isOver ? "linear-gradient(135deg,#1a0808,#200e0e)" : "linear-gradient(135deg,#1a1200,#221a00)",
                  border: `1px solid ${isOver ? "#7f1d1d" : "#78350f"}`,
                  borderRadius: 14, padding: "11px 14px", marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ background: isOver ? "#ef444422" : "#f59e0b22", borderRadius: 10, padding: 7, flexShrink: 0 }}>
                    <Icon size={14} color={isOver ? "#ef4444" : "#f59e0b"}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isOver ? "#fca5a5" : "#fcd34d" }}>
                      {isOver ? "🔴 Limit przekroczony" : "🟡 Zbliżasz się do limitu"} · {cat.label}
                    </div>
                    <div style={{ fontSize: 11, color: isOver ? "#7f1d1d" : "#92400e", marginTop: 1 }}>
                      {isOver
                        ? `Wydano ${fmt(b.spent)} z ${fmt(b.limit)} · +${fmt(b.over)} ponad limit`
                        : `Wydano ${fmt(b.spent)} z ${fmt(b.limit)} · ${((b.spent/b.limit)*100).toFixed(0)}% limitu`
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* PROGNOZA MIESIĘCZNA */}
      {(() => {
        const today = new Date();
        const dayOfMonth = today.getDate();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        if (dayOfMonth < 3) return null; // za mało danych
        const monthExp = monthTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
        const monthInc = monthTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
        const dailyExp = monthExp / dayOfMonth;
        const forecastExp = Math.round(dailyExp * daysInMonth);
        const forecastBalance = Math.round(monthInc - forecastExp);
        const pct = Math.round(dayOfMonth / daysInMonth * 100);
        const isGood = forecastBalance > 0;
        return (
          <div style={{
            background: "linear-gradient(135deg,#0a0f1e,#0d1628)",
            border: "1px solid #1e3a5f44",
            borderRadius: 14, padding: "12px 16px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              📈 Prognoza na koniec miesiąca · {pct}% miesiąca minęło
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>Szacowane wydatki</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{fmt(forecastExp)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>Prognozowany bilans</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: isGood ? "#10b981" : "#ef4444" }}>
                  {isGood ? "+" : "−"}{fmt(Math.abs(forecastBalance))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, background: "#060b14", borderRadius: 6, height: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#1e40af,#3b82f6)", borderRadius: 6 }}/>
            </div>
          </div>
        );
      })()}

      {/* TODAY WIDGET — bilans dnia */}
      {(() => {
        const todayTx = transactions.filter(t => t.date === todayISO && t.cat !== "inne");
        const todayExp = todayTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
        const todayInc = todayTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
        const todayBalance = todayInc - todayExp;
        const txCount = todayTx.length;
        if (txCount === 0) return null;
        const isPositive = todayBalance >= 0;
        return (
          <div style={{
            background: isPositive
              ? "linear-gradient(135deg, #0a1e12, #052e16)"
              : "linear-gradient(135deg, #1a0808, #200e0e)",
            border: `1px solid ${isPositive ? "#16a34a33" : "#7f1d1d33"}`,
            borderRadius: 16,
            padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
                Dziś · {txCount} {txCount === 1 ? "transakcja" : txCount < 5 ? "transakcje" : "transakcji"}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700,
                  color: isPositive ? "#10b981" : "#ef4444" }}>
                  {isPositive ? "+" : "−"}{fmt(Math.abs(todayBalance))}
                </span>
                {todayExp > 0 && todayInc > 0 && (
                  <span style={{ fontSize: 11, color: "#334155" }}>
                    ({fmt(todayInc)} − {fmt(todayExp)})
                  </span>
                )}
              </div>
            </div>
            <button onClick={onAddTx} style={{
              background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none",
              borderRadius: 10, padding: "8px 14px", color: "white",
              fontWeight: 700, fontSize: 12, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              + Dodaj
            </button>
          </div>
        );
      })()}

      {/* Recurring Reminder */}
      <RecurringReminder payments={payments||[]} paid={paid||{}} transactions={transactions} setTransactions={setTransactions} accounts={accounts}/>
      {/* Daily Reminder */}
      <DailyReminder transactions={transactions} onAddTx={onAddTx}/>

      {/* Financial Score */}
      <FinancialScore income={income} expense={expense} transactions={transactions}
        month={month} cycleDay={cycleDay} elapsedDays={elapsedCycDays}/>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Całkowity Majątek</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 500, color: hideBalance ? "#1a2744" : "#e2e8f0", transition: "color 0.3s", letterSpacing: "-0.03em" }}>
              {hideBalance ? "●●●●●●" : fmt(totalBalance)}
            </span>
            <button onClick={() => setHideBalance(h => !h)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}>
              {hideBalance ? <Eye size={16}/> : <EyeOff size={16}/>}
            </button>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Oszczędności</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#10b981" }}>{fmt(savings)}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Inwestycje</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#8b5cf6" }}>{fmt(invest)}</div>
        </div>
      </div>

      {/* Month selector + summary — swipe enabled */}
      <Card
        onTouchStart={e => { const x = e.touches[0].clientX; e.currentTarget._tx = x; }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - (e.currentTarget._tx || 0);
          if (dx > 50)  setMonth(m => Math.max(0, m-1));
          if (dx < -50) setMonth(m => Math.min(11, m+1));
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => setMonth(m => Math.max(0, m-1))} style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#94a3b8" }}><ChevronLeft size={14}/></button>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{cycleDay > 1 ? fmtCycleLabel(month, cycleDay) : MONTH_NAMES[month] + " " + new Date().getFullYear()}</span>
          <button onClick={() => setMonth(m => Math.min(11, m+1))} style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#94a3b8" }}><ChevronRight size={14}/></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[
            { label: "Przychody", val: income, color: "#10b981", Icon: ArrowDownLeft },
            { label: "Wydatki",   val: expense, color: "#ef4444", Icon: ArrowUpRight },
            { label: "Bilans",    val: balance, color: balance >= 0 ? "#10b981" : "#ef4444", Icon: balance >= 0 ? TrendingUp : TrendingDown },
          ].map(({ label, val, color, Icon }) => (
            <div key={label} style={{ background: "#060b14", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <Icon size={12} color={color}/>
                <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 500, color }}>{fmtShort(val)} zł</div>
            </div>
          ))}
        </div>
        {/* Histogram */}
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={histData} barGap={4}>
            <XAxis dataKey="m" tick={{ fill: "#475569", fontSize: 12, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false}/>
            <Tooltip
              contentStyle={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 13 }}
              cursor={{ fill: "#ffffff08" }}
              formatter={(v, n) => [fmt(v), n === "income" ? "Przychody" : "Wydatki"]}
            />
            <Bar dataKey="income" fill="#10b98144" radius={[4,4,0,0]}/>
            <Bar dataKey="expense" fill="#ef444444" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Balance widget */}
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 12 }}>
          Stan na dzis · {daysLeft} dni do konca cyklu
        </div>

        {/* SAFE TO SPEND — main number */}
        <div style={{
          background: safeToSpend > 0 ? "linear-gradient(135deg,#0a1e12,#052e16)" : "linear-gradient(135deg,#1a0808,#200e0e)",
          border: "1px solid " + (safeToSpend > 0 ? "#16a34a44" : "#7f1d1d44"),
          borderRadius: 14, padding: "14px 16px", marginBottom: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", marginBottom: 4 }}>
                Mozesz jeszcze wydac
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700,
                color: safeToSpend > 0 ? "#10b981" : "#ef4444", letterSpacing: "-0.02em" }}>
                {fmt(safeToSpend)}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                {safePerDay > 0
                  ? fmt(safePerDay) + "/dzien przez " + daysLeft + " dni"
                  : "Budzet wyczerpany"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Bilans</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700,
                color: balance >= 0 ? "#94a3b8" : "#ef4444" }}>
                {balance >= 0 ? "+" : ""}{fmtShort(balance)} zl
              </div>
              {upcomingTotal > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Zaplanowane</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                    fontWeight: 700, color: "#f59e0b" }}>
                    -{fmtShort(upcomingTotal)} zl
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming bills breakdown */}
          {upcomingBills.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10,
              borderTop: "1px solid #16a34a22", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {upcomingBills.slice(0, 4).map(p => (
                <div key={p.id} style={{ background: "#060b14", borderRadius: 6,
                  padding: "3px 8px", fontSize: 10, color: "#94a3b8" }}>
                  {p.name} <span style={{ color: "#f59e0b", fontFamily: "'DM Mono', monospace" }}>
                    {fmt(Math.abs(p.amount))}
                  </span>
                </div>
              ))}
              {upcomingBills.length > 4 && (
                <div style={{ background: "#060b14", borderRadius: 6, padding: "3px 8px",
                  fontSize: 10, color: "#475569" }}>
                  +{upcomingBills.length - 4} wiecej
                </div>
              )}
            </div>
          )}
        </div>

        {/* Daily row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Srednia dzienna{oneTimeNote ? " *" : ""}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700,
              color: dailySpend <= safePerDay ? "#10b981" : dailySpend <= safePerDay * 1.2 ? "#f59e0b" : "#ef4444" }}>
              {fmt(dailySpend)}
            </div>
          </div>
          <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Mozesz dziennie</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>
              {fmt(safePerDay)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: "#060b14", borderRadius: 6, height: 6, overflow: "hidden" }}>
          <div style={{ width: Math.min(100, spendPct) + "%", height: "100%", borderRadius: 6,
            background: spendPct > 100 ? "#ef4444" : spendPct > 80 ? "#f59e0b" : "#10b981",
            transition: "width 0.6s" }}/>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: "#334155" }}>
          <span>Wydano {spendPct.toFixed(0)}% przychodow</span>
          <span>{fmt(income - expense)} bilans</span>
        </div>
      </Card>



      {/* Porownanie M/M */}
      <MiniComparison transactions={transactions} month={month} cycleDay={cycleDay}/>

      {/* Forecast */}
      <ForecastWidget income={income} expense={expense} daysLeft={daysLeft}
        elapsedDays={elapsedCycDays} transactions={transactions} month={month} cycleDay={cycleDay}/>

      {/* Insights */}
      <Insights transactions={transactions} month={month} cycleDay={cycleDay}
        income={income} expense={expense} catData={catData}/>

      {/* Category breakdown   wydatki & wp ywy */}
      <Card style={{ padding: "18px 18px 14px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["expense","📉 Wydatki"],["income","📈 Wpływy"]].map(([t,l]) => (
            <button key={t} onClick={() => setCatTab(t)} style={{
              flex: 1, padding: "7px 0", borderRadius: 10, cursor: "pointer",
              fontWeight: 700, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif",
              background: catTab === t ? (t === "expense" ? "#2d0a0a" : "#0a1e12") : "#060b14",
              border: `1px solid ${catTab === t ? (t === "expense" ? "#ef4444" : "#10b981") : "#1a2744"}`,
              color: catTab === t ? (t === "expense" ? "#ef4444" : "#10b981") : "#475569",
            }}>{l}</button>
          ))}
        </div>
        {catTab === "expense" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topCats.length === 0 && <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: 16 }}>Brak wydatków</div>}
            {(() => {
              const essential = topCats.filter(c => getCat(c.cat).group === "essential");
              const lifestyle  = topCats.filter(c => getCat(c.cat).group !== "essential");
              const essentialTotal = essential.reduce((s,c) => s + c.val, 0);
              const lifestyleTotal = lifestyle.reduce((s,c) => s + c.val, 0);
              const renderRow = ({ cat, val, label, color, icon: Icon }) => {
                const pct = expense > 0 ? (val / expense) * 100 : 0;
                return (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ background: color+"22", border: `1px solid ${color}44`, borderRadius: 8, padding: 5, display: "flex" }}><Icon size={13} color={color}/></div>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color }}>{fmt(val)}</span>
                    </div>
                    <div style={{ background: "#1a2744", borderRadius: 4, height: 4 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }}/>
                    </div>
                  </div>
                );
              };
              return (
                <>
                  {essential.length > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Konieczne</span>
                        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>{fmt(essentialTotal)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: lifestyle.length ? 14 : 0 }}>
                        {essential.map(renderRow)}
                      </div>
                    </>
                  )}
                  {lifestyle.length > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: essential.length ? 4 : 0 }}>
                        <span style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>Dodatkowe</span>
                        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "'DM Mono', monospace" }}>{fmt(lifestyleTotal)}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {lifestyle.map(renderRow)}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {catTab === "income" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incomeData.length === 0 && <div style={{ color: "#334155", fontSize: 12, textAlign: "center", padding: 16 }}>Brak wpływów</div>}
            {incomeData.map(({ cat, val, label, color, icon: Icon }) => {
              const pct = income > 0 ? (val / income) * 100 : 0;
              return (
                <div key={cat}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ background: color+"22", border: `1px solid ${color}44`, borderRadius: 8, padding: 5, display: "flex" }}><Icon size={13} color={color}/></div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                    </div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: color }}>{fmt(val)}</span>
                  </div>
                  <div style={{ background: "#1a2744", borderRadius: 4, height: 4 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bukmacher P&L */}
      {(() => {
        const bukTx = monthTx.filter(t => t.cat === "bukmacher" || t.cat === "bukmacherka");
        const stake  = bukTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
        const wins   = bukTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
        const pnl    = wins - stake;
        const roi    = stake > 0 ? (pnl / stake * 100) : 0;
        if (stake === 0 && wins === 0) return null;
        return (
          <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 12 }}>Bukmacher · biezacy cykl</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Wplacono", val: stake,  color: "#ef4444" },
                { label: "Wygrane",  val: wins,   color: "#10b981" },
                { label: "P&L",      val: pnl,    color: pnl >= 0 ? "#10b981" : "#ef4444" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color }}>
                    {pnl >= 0 && label === "P&L" ? "+" : ""}{fmt(Math.abs(val))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: roi >= 0 ? "#10b981" : "#ef4444",
              fontWeight: 700, textAlign: "center" }}>
              ROI {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
              <span style={{ color: "#334155", fontWeight: 400 }}> · {bukTx.length} transakcji</span>
            </div>
          </Card>
        );
      })()}

      {/* Expense type breakdown */}
      <ExpenseTypesBreakdown monthTx={monthTx} income={income}/>

      {/* Recommendations */}
      <Recommendations income={income} expense={expense} catData={catData}
        monthTx={monthTx} safeToSpend={safeToSpend} daysLeft={daysLeft}/>

      {/* Pie chart */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>Struktura majątku</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PieChart width={120} height={120}>
            <Pie data={accounts.map(a => ({ name: a.name, value: a.balance }))} cx={55} cy={55} innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={2} stroke="#060b14">
              {accounts.map((a, i) => <Cell key={i} fill={a.color}/>)}
            </Pie>
          </PieChart>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            {accounts.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: a.color }}/>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{a.name}</span>
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: a.color }}>
                  {((a.balance / totalBalance) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Account balance history (simple) */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>Historia sald</div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={histData}>
            <XAxis dataKey="m" tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, fontSize: 13 }}
              formatter={(v, n) => [fmt(Math.abs(v)), n === "balance" ? "Bilans" : n]}/>
            <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }}/>
            <Line type="monotone" dataKey="income"  stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center" }}>
          {[["#10b981","Bilans"],["#3b82f6","Przychody"]].map(([c,l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 12, height: 3, background: c, borderRadius: 2 }}/>
              <span style={{ fontSize: 10, color: "#475569" }}>{l}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent transactions */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>Ostatnie transakcje</div>
        {transactions.slice(0, 5).map(tx => {
          const cat = getCat(tx.cat);
          const Icon = cat.icon;
          return (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #0f1a2e" }}>
              <div style={{ background: cat.color + "22", border: `1px solid ${cat.color}33`, borderRadius: 10, padding: 8, flexShrink: 0 }}>
                <Icon size={14} color={cat.color}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{tx.date} · {cat.label}</div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: tx.amount > 0 ? "#10b981" : "#ef4444", flexShrink: 0 }}>
                {tx.amount > 0 ? "+" : "−"}{fmt(Math.abs(tx.amount))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};


export { Dashboard };

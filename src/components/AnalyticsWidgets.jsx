import { useMemo, useState } from "react";
import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, ArrowUpRight, ArrowDownLeft,
  CreditCard, ShoppingBag, Utensils, Zap, Coffee, Building,
  Gift, DollarSign, Flame, AlertCircle, Scissors, Target, LineChart as LineChartIcon,
  Lightbulb, Minus
} from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { fmt, fmtShort, cycleTxs, getCycleRange } from "../utils.js";
import { getCat, MONTHS, MONTH_NAMES, BASE_CATEGORIES } from "../constants.js";
import { t } from "../i18n.js";


// v1.2.7: klasyfikacja zsynchronizowana z BASE_CATEGORIES (constants.js).
// "inne" usunięte z lifestyle - to transfer/skip, nie wydatek.
// v1.2.10: user-defined override - custom cat z polem `expenseType` ma priorytet nad
// fallback. Custom kategoria "Kredyt Dom" z expenseType="fixed" trafia do Stałych
// zamiast Variable.
const EXPENSE_TYPES = {
  investment:     ["inwestycje"],
  fixed:          ["rachunki", "transport"],          // regularnie miesięcznie, niezbędne
  uncontrollable: ["rzad", "rząd"],                   // podatki/ZUS - nie da się ograniczyć
  variable:       ["jedzenie", "zdrowie", "zakupy"],  // potrzebne ale można przyciąć
  lifestyle:      ["kawiarnia", "rozrywka", "muzyka", "ubrania", "prezenty", "alkohol", "bukmacher"],
  // "inne" → skip (transfer, nie wydatek - traktowany w monthTx.filter cat !== "inne")
};
const UNCONTROLLABLE_CATS = ["rząd", "rzad", "inwestycje", "rachunki"];
const isControllable = (cat) => {
  return ["kawiarnia", "rozrywka", "muzyka", "ubrania", "prezenty", "alkohol",
          "bukmacher", "jedzenie", "zakupy"].includes(cat);
};
// allCats opcjonalne - gdy podane, pozwala na user-defined override przez expenseType
// pole na custom kategorii. Bez allCats fallback do hardcoded mapowania.
const getExpenseType = (cat, allCats = null) => {
  if (cat === "inne") return null;  // skip transfer
  // 1. Sprawdź user-defined override (custom cat z expenseType)
  if (Array.isArray(allCats)) {
    const custom = allCats.find(c => c.id === cat);
    if (custom?.expenseType) {
      return custom.expenseType;  // "fixed" | "variable" | "lifestyle"
    }
  }
  // 2. Hardcoded mapowanie dla BASE_CATEGORIES
  for (const [type, cats] of Object.entries(EXPENSE_TYPES)) {
    if (cats.includes(cat)) return type;
  }
  // 3. Fallback dla nieznanych
  return "variable";
};

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
    if (expRatio >= 1.0)  return t("score.spendOver", "Wydajesz więcej niż zarabiasz");
    if (savingsRate < 10) return `${t("score.savingsLow", "Oszczędzasz tylko")} ${savingsRate.toFixed(0)}% — ${t("score.target15", "cel to min. 15%")}`;
    if (avg3 > 0 && trend > 1.15) return `${t("score.expGrowing", "Wydatki rosną — o")} ${((trend-1)*100).toFixed(0)}% ${t("score.vsPrevMonths", "vs poprzednie mies.")}`;
    if (cv > 1.0)         return t("score.bigSwings", "Duże skoki wydatków dzień do dnia");
    if (expRatio > 0.85)  return `${t("score.spentOf", "Wydano")} ${(expRatio*100).toFixed(0)}% ${t("score.aboveNorm", "przychodów — powyżej normy")}`;
    if (score >= 75)      return t("score.healthy", "Finanse pod kontrolą");
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
    <div style={{ background: "linear-gradient(135deg,#0a1022,#0d1628)", border: "1px solid #1e3a5f55", borderRadius: 18, padding: "16px 18px" }}>
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
              { lbl: t("stat.savings", "Oszczędności"), val: savingsRate >= 0 ? savingsRate.toFixed(0)+"%" : "deficit",
                ok: savingsRate >= 15, tip: savingsRate < 15 ? "cel: 15%+" : "" },
              { lbl: t("stat.expTrend", "Trend wydatków"), val: avg3 === 0 ? t("stat.noData", "brak danych") :
                                    trend < 1 ? "▼"+(Math.min(999,((1-trend)*100)).toFixed(0))+"% " + t("stat.vsAvg", "vs śr.")
                                              : "▲"+(Math.min(999,((trend-1)*100)).toFixed(0))+"% " + t("stat.vsAvg", "vs śr."),
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
    </div>
  );
};

function Insights({ transactions, month, cycleDay, income, expense, catData, allCats = null }) {
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
    const lifestyleCur  = curTx.filter(t => t.amount < 0 && getExpenseType(t.cat, allCats) === "lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
    const lifestylePrev = cycleTxs(transactions, (month+11)%12, cycleDay)
      .filter(t => t.amount < 0 && getExpenseType(t.cat, allCats) === "lifestyle")
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

function ExpenseTypesBreakdown({ monthTx, income, allCats = null }) {
  const [expanded, setExpanded] = useState(null); // "fixed" | "variable" | "lifestyle" | null

  const fixed      = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="fixed").reduce((s,t)=>s+Math.abs(t.amount),0);
  const variable   = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="variable").reduce((s,t)=>s+Math.abs(t.amount),0);
  const lifestyle  = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
  const investment = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="investment").reduce((s,t)=>s+Math.abs(t.amount),0);
  const total = fixed + variable + lifestyle;

  // Breakdown per kategoria w obrębie typu - rozwinięcie pokaże co się kryje pod "Stałe" itd.
  const breakdownByType = (typeId) => {
    const map = {};
    monthTx
      .filter(t => t.amount < 0 && getExpenseType(t.cat, allCats) === typeId)
      .forEach(t => { map[t.cat] = (map[t.cat] || 0) + Math.abs(t.amount); });
    return Object.entries(map)
      .map(([cat, val]) => ({ cat, val, info: getCat(cat, allCats || []) }))
      .sort((a, b) => b.val - a.val);
  };

  const types = [
    { id: "fixed",     lbl: t("exptype.fixed", "Stałe"),     val: fixed,      color: "#3b82f6", norm: 50 },
    { id: "variable",  lbl: "Zmienne",   val: variable,   color: "#f59e0b", norm: 30 },
    { id: "lifestyle", lbl: "Lifestyle", val: lifestyle,  color: "#ec4899", norm: 20 },
  ];

  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12 }}>Struktura wydatkow</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {types.map(({ id, lbl, val, color, norm }) => {
          const pct    = total > 0 ? val / total * 100 : 0;
          const pctInc = income > 0 ? val / income * 100 : 0;
          const over   = pctInc > norm;
          const isOpen = expanded === id;
          const breakdown = isOpen ? breakdownByType(id) : null;

          return (
            <div key={id}>
              <div onClick={() => val > 0 && setExpanded(isOpen ? null : id)}
                style={{ cursor: val > 0 ? "pointer" : "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0",
                    display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {val > 0 && <span style={{ fontSize: 9, color: "#475569" }}>{isOpen ? "▼" : "▶"}</span>}
                    {lbl}
                  </span>
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

              {/* Expanded - lista kategorii pod tym typem */}
              {isOpen && breakdown && breakdown.length > 0 && (
                <div style={{
                  marginTop: 8, marginLeft: 12, padding: "8px 12px",
                  background: "#060b14", border: "1px solid #1a2744", borderRadius: 8,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  {breakdown.map(({ cat, val: catVal, info }) => {
                    const Icon = info.icon;
                    const catPct = val > 0 ? (catVal / val * 100) : 0;
                    return (
                      <div key={cat} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        fontSize: 11,
                      }}>
                        <div style={{
                          background: info.color + "22", borderRadius: 6, padding: 4,
                          flexShrink: 0,
                        }}>
                          {Icon && <Icon size={11} color={info.color}/>}
                        </div>
                        <span style={{ color: "#cbd5e1", fontWeight: 500, flex: 1 }}>
                          {info.label}
                        </span>
                        <span style={{ color: "#475569", fontSize: 10 }}>
                          {catPct.toFixed(0)}%
                        </span>
                        <span style={{
                          fontFamily: "'DM Mono', monospace", fontWeight: 700,
                          color: info.color, minWidth: 70, textAlign: "right",
                        }}>
                          {fmt(catVal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {investment > 0 && (
        // v1.2.10: Inwestycje jako pełnoprawna sekcja z paskiem (jak Stałe/Zmienne/Lifestyle).
        // Wcześniej był to mały dodatek na dole, mylące. Teraz fioletowy pasek + ikona +
        // procent dochodu, ale wyraźnie zaznaczone że to NIE jest wydatek.
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "2px dashed #1a2744" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 13 }}>▸ Inwestycje</span>
              <span style={{ fontSize: 9, color: "#64748b", background: "#1a2744",
                padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.05em" }}>
                alokacja
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#8b5cf6" }}>
                {income > 0 ? (investment/income*100).toFixed(0) : 0}% dochodu
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14,
                fontWeight: 700, color: "#a855f7" }}>{fmt(investment)}</span>
            </div>
          </div>
          {income > 0 && (
            <div style={{ background: "#0f1825", borderRadius: 5, height: 6, overflow: "hidden" }}>
              <div style={{
                width: Math.min(100, (investment / income) * 100) + "%", height: "100%",
                background: "linear-gradient(90deg, #6d28d9, #a855f7)", borderRadius: 5,
              }}/>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", lineHeight: 1.4 }}>
            {t("invest.note", "Nie liczone jako wydatek — to przeniesienie kapitału, nie konsumpcja.")}
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: "#334155", textAlign: "center" }}>
        {t("exptype.norms", "Normy: Stałe <50% · Zmienne <30% · Lifestyle <20%")}
        {total > 0 && <span style={{ color: "#475569" }}> · {t("exptype.clickToExpand", "kliknij sekcję żeby rozwinąć")}</span>}
      </div>
    </Card>
  );
};

// === INCOME TYPES BREAKDOWN ===
// Grupuje przychody w kategorie: pensja / dorabianie / wygrane.
// Pokazuje wskaźnik dywersyfikacji - ile % przychodów z największego źródła.
// Jeśli >85% z jednego = ryzyko (utrata pracy = utrata wszystkich przychodów).
const INCOME_TYPES = {
  main:     ["przychód", "wynagrodzenie"],   // główne źródło
  side:     ["dodatkowe", "sprzedaż"],        // dorabianie / sprzedaż
  gambling: ["bukmacherka"],                  // niestabilne, volatile
};
const getIncomeType = (cat) => {
  for (const [type, cats] of Object.entries(INCOME_TYPES)) {
    if (cats.includes(cat)) return type;
  }
  return "side"; // fallback: nieznana kat. przychodu = traktuj jako boczne
};

function IncomeTypesBreakdown({ transactions = [], month: parentMonth = 0, cycleDay = 1 }) {
  // v1.3.2: usunięta lokalna nawigacja po miesiącach (strzałki + button "Dziś").
  // Powód: duplikacja z głównym tab switcher Analizy (Bieżący/Okresy) wyżej.
  // User i tak nie wraca do starych cykli z tego widget'u, a UI był zaśmiecony.
  // Widget zawsze pokazuje cykl bieżący przekazany z parent (month).
  const monthTx = useMemo(
    () => cycleTxs(transactions, parentMonth, cycleDay),
    [transactions, parentMonth, cycleDay]
  );
  const incomeTx = monthTx.filter(t => t.amount > 0 && t.cat !== "inne");

  const main     = incomeTx.filter(t => getIncomeType(t.cat) === "main").reduce((s,t) => s + t.amount, 0);
  const side     = incomeTx.filter(t => getIncomeType(t.cat) === "side").reduce((s,t) => s + t.amount, 0);
  const gambling = incomeTx.filter(t => getIncomeType(t.cat) === "gambling").reduce((s,t) => s + t.amount, 0);
  const total    = main + side + gambling;

  const types = [
    { lbl: "Pensja",      val: main,     color: "#10b981" },
    { lbl: "Dorabianie",  val: side,     color: "#0891b2" },
    { lbl: "Wygrane",     val: gambling, color: "#f59e0b" },
  ].filter(t => t.val > 0);

  const mainMerchants = {};
  incomeTx.filter(t => getIncomeType(t.cat) === "main").forEach(t => {
    const k = (t.desc || "").trim() || "(bez opisu)";
    mainMerchants[k] = (mainMerchants[k] || 0) + t.amount;
  });
  const sortedMerchants = Object.entries(mainMerchants).sort((a,b) => b[1] - a[1]);
  const topMain = sortedMerchants[0];

  const monthLabel = MONTH_NAMES[parentMonth] || "—";

  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em" }}>{t("income.structure", "Struktura przychodów")} · {monthLabel}</div>
      </div>

      {total <= 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.4 }}>💸</div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {t("income.empty", "Brak przychodów w")} {monthLabel.toLowerCase()}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {types.map(({ lbl, val, color }) => {
              const pct = (val / total) * 100;
              return (
                <div key={lbl}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{lbl}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#475569" }}>
                        {pct.toFixed(0)}%
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12,
                        fontWeight: 700, color }}>{fmtShort(val)} zl</span>
                    </div>
                  </div>
                  <div style={{ background: "#060b14", borderRadius: 4, height: 6 }}>
                    <div style={{ width: pct + "%", height: "100%", borderRadius: 4,
                      background: color, opacity: 0.85, transition: "width 0.5s" }}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* v1.2.7: zawsze rozwijana lista wszystkich źródeł pensji.
              Wcześniej pokazywało tylko top 1 z procentem - mało pomocne gdy masz 7 źródeł. */}
          {main > 0 && sortedMerchants.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1a2744" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                {t("income.salarySources", "Źródła pensji")} ({sortedMerchants.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sortedMerchants.slice(0, 8).map(([name, val]) => {
                  const pct = main > 0 ? (val / main * 100) : 0;
                  return (
                    <div key={name} style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", fontSize: 11 }}>
                      <span style={{ color: "#cbd5e1", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
                        {name}
                      </span>
                      <span style={{ color: "#64748b", fontFamily: "'DM Mono', monospace",
                        fontSize: 10, marginRight: 8 }}>
                        {pct.toFixed(0)}%
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: "#10b981",
                        minWidth: 70, textAlign: "right" }}>
                        {fmt(val)}
                      </span>
                    </div>
                  );
                })}
                {sortedMerchants.length > 8 && (
                  <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 4 }}>
                    + {sortedMerchants.length - 8} {t("income.more", "więcej")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* v1.2.10: usunięty concentration alert. IncomeTypesBreakdown jest renderowany
              tylko w widoku Bieżący (cykl rozliczeniowy). 1 wypłata w cyklu to NORMA, nie
              "concentration risk". Diversyfikacji ma sens dla rocznego widoku, nie dla
              jednego cyklu. Jeśli ktoś chce sprawdzić czy nie jest za bardzo zależny od
              1 źródła — patrzy na widok Okresy → Rok. */}

          <div style={{ marginTop: 8, fontSize: 10, color: "#334155", textAlign: "center" }}>
            Razem: {fmt(total)} · {types.length} {types.length === 1 ? "źródło" : "źródła"}
          </div>
        </>
      )}
    </Card>
  );
};

function Recommendations({ income, expense, catData, monthTx, safeToSpend, daysLeft, allCats = null }) {
  const recs = useMemo(() => {
    const list = [];
    const savingsRate = income > 0 ? (income - expense) / income * 100 : 0;
    const lifestyle = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="lifestyle").reduce((s,t)=>s+Math.abs(t.amount),0);
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

    const topInvest = monthTx.filter(t=>t.amount<0&&getExpenseType(t.cat, allCats)==="investment").reduce((s,t)=>s+Math.abs(t.amount),0);
    if (topInvest === 0 && income > 2000) {
      list.push({ emoji: "📈", text: t("rec.noInvest", "Brak inwestycji w tym cyklu. Rozważ automat. przelew w dniu wyplaty.") });
    }

    if (list.length === 0) {
      list.push({ emoji: "✓", text: t("rec.onTrack", "Na dobrej drodze. Utrzymaj tempo — cel miesięczny realny.") });
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

export { FinancialScore, Insights, ExpenseTypesBreakdown, IncomeTypesBreakdown, Recommendations };

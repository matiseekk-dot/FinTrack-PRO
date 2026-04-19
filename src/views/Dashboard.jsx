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
import { t, getLang } from "../i18n.js";

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







function Dashboard({ accounts, transactions, setTransactions, payments, paid = {}, month, setMonth, onAddTx, cycleDay = 1, budgets = [], allCats = [], onRefresh }) {
  const getLocalCat = (id) => {
    const found = allCats.find(c => c.id === id) || allCats.find(c => c.id === id);
    if (found) return { ...found, icon: (typeof found.icon === "function") ? found.icon : Wallet, label: found.label ? found.label.charAt(0).toUpperCase() + found.label.slice(1) : found.label };
    return getCat(id);
  };
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

  // Memoized aggregations - jedna pętla per kategoria, zamiast 3x .filter.reduce
  const accountSums = useMemo(() => {
    let total = 0, savings = 0, invest = 0;
    for (const a of accounts) {
      total += a.balance;
      if (a.type === "savings") savings += a.balance;
      else if (a.type === "invest") invest += a.balance;
    }
    return { total, savings, invest };
  }, [accounts]);
  const totalBalance = accountSums.total;
  const savings = accountSums.savings;
  const invest = accountSums.invest;

  const cycleSums = useMemo(() => {
    const monthTx = cycleTxs(transactions, month, cycleDay);
    let income = 0, expense = 0;
    for (const t of monthTx) {
      if (t.cat === "inne") continue;
      if (t.amount > 0) income += t.amount;
      else expense += Math.abs(t.amount);
    }
    return { monthTx, income, expense, balance: income - expense };
  }, [transactions, month, cycleDay]);
  const monthTx = cycleSums.monthTx;
  const income = cycleSums.income;
  const expense = cycleSums.expense;
  const balance = cycleSums.balance;
  const cycleLabel = fmtCycleLabel(month, cycleDay);

  const catData = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.amount < 0 && t.cat !== "inne").forEach(t => {
      map[t.cat] = (map[t.cat] || 0) + Math.abs(t.amount);
    });
    return Object.entries(map).map(([cat, val]) => ({
      cat, val, ...getLocalCat(cat)
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
      ...getLocalCat(d.cat),
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
      style={{ padding: "0 16px 100px", display: "flex", flexDirection: "column", gap: 12,
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
          <span style={{ animation: pulling ? "spin 0.8s linear infinite" : "none", display: "inline-block" }}>↻</span>
          {pulling ? "Odświeżam…" : pullY >= PULL_THRESHOLD ? "Puść aby odświeżyć" : "Pociągnij w dół"}
        </div>
      )}

      {/* ═══ HERO: BILANS DNIA ═══ */}
      {(() => {
        const todayTx = transactions.filter(t => t.date === todayISO && t.cat !== "inne");
        const todayExp = todayTx.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
        const todayInc = todayTx.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
        const todayBal = todayInc - todayExp;
        const n = todayTx.length;
        const isPos = todayBal >= 0;
        const DAYS_PL = ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"];
        const today = new Date();
        const dayName = t(`day.${today.getDay()}`);
        const dateStr = today.toLocaleDateString(getLang() === "en" ? "en-US" : "pl-PL", { day: "numeric", month: "long" });
        return (
          <div style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 2 }}>
                  {dayName}, {dateStr}
                </div>
                {n === 0 ? (
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#334155", marginTop: 4 }}>
                    {t("dash.noTransactions")}
                  </div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 700,
                      color: isPos ? "#10b981" : "#ef4444", letterSpacing: "-0.03em" }}>
                      {isPos ? "+" : "−"}{fmt(Math.abs(todayBal))}
                    </span>
                    <span style={{ fontSize: 11, color: "#475569", marginLeft: 8 }}>
                      {n} {n === 1 ? "transakcja" : n < 5 ? "transakcje" : "transakcji"}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={onAddTx} style={{
                background: "linear-gradient(135deg,#1e40af,#7c3aed)",
                border: "none", borderRadius: 14, padding: "12px 18px",
                color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: "0 4px 16px #1e40af44",
              }}>+ Dodaj</button>
            </div>
            {n > 0 && (todayExp > 0 || todayInc > 0) && (
              <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e3a5f44" }}>
                {todayInc > 0 && <div>
                  <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Wpłynęło</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: "#10b981" }}>+{fmt(todayInc)}</div>
                </div>}
                {todayExp > 0 && <div>
                  <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{t("dash.spent")}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: "#ef4444" }}>−{fmt(todayExp)}</div>
                </div>}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ PILNE: płatności dziś + alerty budżetu ═══ */}
      <RecurringReminder payments={payments||[]} paid={paid||{}} transactions={transactions} setTransactions={setTransactions} accounts={accounts}/>
      {(() => {
        if (!budgets || budgets.length === 0) return null;
        const alerts = budgets.filter(b => {
          const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
          return spent >= b.limit * 0.85;
        }).map(b => {
          const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
          return { ...b, spent, over: spent - b.limit, pct: Math.min(110, Math.round(spent/b.limit*100)) };
        });
        if (alerts.length === 0) return null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map(b => {
              const cat = getLocalCat(b.cat);
              const Icon = cat.icon;
              const isOver = b.spent > b.limit;
              return (
                <div key={b.cat} style={{
                  background: "linear-gradient(135deg,#0d1628,#111827)",
                  border: `1px solid ${isOver ? "#7f1d1d55" : "#78350f55"}`,
                  borderRadius: 14, padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ background: (isOver ? "#ef4444" : "#f59e0b") + "20", borderRadius: 10, padding: 7, flexShrink: 0 }}>
                    <Icon size={14} color={isOver ? "#ef4444" : "#f59e0b"}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isOver ? "#fca5a5" : "#fcd34d" }}>
                        {isOver ? "⚠️ " : "🔔 "}{cat.label}
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: isOver ? "#ef4444" : "#f59e0b" }}>{b.pct}%</span>
                    </div>
                    <div style={{ background: "#060b14", borderRadius: 4, height: 3, overflow: "hidden", marginTop: 6 }}>
                      <div style={{ width: `${b.pct}%`, height: "100%", borderRadius: 4,
                        background: isOver ? "linear-gradient(90deg,#ef4444,#f97316)" : "linear-gradient(90deg,#f59e0b,#fbbf24)" }}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ═══ MAJĄTEK ═══ */}
      <div style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{t("dash.totalWealth")}</div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700,
              color: hideBalance ? "#1a2744" : "#e2e8f0", letterSpacing: "-0.03em" }}>
              {hideBalance ? "●●●●●" : fmt(totalBalance)}
            </span>
          </div>
          <button onClick={() => setHideBalance(h => !h)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#334155", marginTop: 4 }}>
            {hideBalance ? <Eye size={16}/> : <EyeOff size={16}/>}
          </button>
        </div>
        {!hideBalance && (
          <div style={{ display: "flex", gap: 20, marginTop: 14, paddingTop: 14, borderTop: "1px solid #1e3a5f44" }}>
            <div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{t("dash.savings")}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: "#10b981" }}>{fmt(savings)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{t("dash.investments")}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: "#8b5cf6" }}>{fmt(invest)}</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{t("dash.cycleBalance")}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: balance >= 0 ? "#10b981" : "#ef4444" }}>{balance >= 0 ? "+" : "−"}{fmt(Math.abs(balance))}</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MIESIĄC ═══ */}
      <div
        style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}
        onTouchStart={e => { const x = e.touches[0].clientX; e.currentTarget._tx = x; }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - (e.currentTarget._tx || 0);
          if (dx > 50) setMonth(m => Math.max(0, m-1));
          if (dx < -50) setMonth(m => Math.min(11, m+1));
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={() => setMonth(m => Math.max(0, m-1))} style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#94a3b8" }}><ChevronLeft size={14}/></button>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{cycleDay > 1 ? fmtCycleLabel(month, cycleDay) : MONTH_NAMES[month] + " " + new Date().getFullYear()}</span>
          <button onClick={() => setMonth(m => Math.min(11, m+1))} style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "#94a3b8" }}><ChevronRight size={14}/></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { label: t("dash.income"), val: income, color: "#10b981", Icon: ArrowDownLeft },
            { label: t("dash.expenses"), val: expense, color: "#ef4444", Icon: ArrowUpRight },
            { label: t("dash.balance"), val: balance, color: balance >= 0 ? "#10b981" : "#ef4444", Icon: balance >= 0 ? TrendingUp : TrendingDown },
          ].map(({ label, val, color, Icon }) => (
            <div key={label} style={{ background: "#060b14", borderRadius: 12, padding: "10px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                <Icon size={11} color={color}/>
                <span style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color }}>{fmtShort(val)} zł</div>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={histData} barGap={3}>
            <XAxis dataKey="m" tick={{ fill: "#334155", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12 }}
              cursor={{ fill: "#ffffff06" }}
              formatter={(v, n) => [fmt(v), n === "income" ? t("dash.income") : t("dash.expenses")]}/>
            <Bar dataKey="income" fill="#10b98133" radius={[3,3,0,0]}/>
            <Bar dataKey="expense" fill="#ef444433" radius={[3,3,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ═══ ILE MOŻESZ WYDAĆ ═══ */}
      <div style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}>
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          Stan na dziś · {daysLeft} dni do końca cyklu
        </div>
        <div style={{
          background: safeToSpend > 0 ? "linear-gradient(135deg,#0a1e12,#052e16)" : "linear-gradient(135deg,#1a0808,#200e0e)",
          border: `1px solid ${safeToSpend > 0 ? "#16a34a33" : "#7f1d1d33"}`,
          borderRadius: 14, padding: "14px 16px", marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            {t("dash.canStillSpend")}
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700,
            color: safeToSpend > 0 ? "#10b981" : "#ef4444", letterSpacing: "-0.02em" }}>
            {safeToSpend <= 0 ? "0,00 zł" : fmt(safeToSpend)}
          </div>
          {safeToSpend <= 0 && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{t("dash.budgetExhausted")}</div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: "#060b14", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{t("dash.dailyAvg")}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: "#f97316" }}>{fmt(dailySpend)} zł</div>
          </div>
          <div style={{ background: "#060b14", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{t("dash.dailyBudget")}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: safePerDay > 0 ? "#10b981" : "#ef4444" }}>{safePerDay > 0 ? fmt(safePerDay) : "0,00"} zł</div>
          </div>
        </div>
      </div>

      {/* ═══ PROGNOZA ═══ */}
      {(() => {
        const today = new Date();
        const dom = today.getDate();
        const dim = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        if (dom < 4) return null;
        const mExp = monthTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
        const mInc = monthTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
        const fExp = Math.round(mExp / dom * dim);
        const fBal = Math.round(mInc - fExp);
        const pct = Math.round(dom / dim * 100);
        const isGood = fBal > 0;
        return (
          <div style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{t("dash.forecast")}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700,
                  color: isGood ? "#10b981" : "#ef4444" }}>
                  {isGood ? "+" : "−"}{fmt(Math.abs(fBal))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{t("dash.estSpending")}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#ef4444" }}>~{fmt(fExp)}</div>
              </div>
            </div>
            <div style={{ background: "#060b14", borderRadius: 6, height: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%",
                background: isGood ? "linear-gradient(90deg,#1e40af,#3b82f6)" : "linear-gradient(90deg,#7f1d1d,#ef4444)",
                borderRadius: 6, transition: "width 1s ease" }}/>
            </div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>{pct}% miesiąca minęło</div>
          </div>
        );
      })()}

      {/* Power user storage warning */}
      <StorageWarning transactions={transactions} setTransactions={setTransactions}/>

      {/* ═══ INSIGHTS ═══ */}
      <InsightsCard transactions={transactions} budgets={budgets}/>

      {/* ═══ OSTATNIE TRANSAKCJE ═══ */}
      <div style={{ background: "linear-gradient(135deg,#0d1628,#111827)", border: "1px solid #1e3a5f66", borderRadius: 20, padding: "18px 20px" }}>
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
          {t("dash.recentTx")}
        </div>
        {transactions.slice(0, 5).map((tx, idx) => {
          const cat = getLocalCat(tx.cat);
          const Icon = cat.icon;
          return (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 12,
              padding: "9px 0", borderBottom: idx < 4 ? "1px solid #0f1a2e" : "none" }}>
              <div style={{ background: cat.color + "22", border: `1px solid ${cat.color}33`, borderRadius: 10, padding: 7, flexShrink: 0 }}>
                <Icon size={13} color={cat.color}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>{tx.date} · {cat.label}</div>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600,
                color: tx.amount > 0 ? "#10b981" : "#ef4444", flexShrink: 0 }}>
                {tx.amount > 0 ? "+" : "−"}{fmt(Math.abs(tx.amount))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ STREAK ═══ */}
      <DailyReminder transactions={transactions} onAddTx={onAddTx}/>

    </div>
  );
};


export { Dashboard };
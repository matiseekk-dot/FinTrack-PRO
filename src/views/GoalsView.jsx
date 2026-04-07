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
import { useToast } from "../hooks/useToast.js";
const BudgetView = ({ transactions, budgets, setBudgets, month, cycleDay = 1 }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ cat: "jedzenie", limit: "" });

  const monthTx = cycleTxs(transactions, month, cycleDay);

  const addBudget = () => {
    if (!form.limit) return;
    setBudgets(b => {
      const exists = b.findIndex(x => x.cat === form.cat);
      if (exists >= 0) { const n = [...b]; n[exists] = { ...n[exists], limit: parseFloat(form.limit) }; return n; }
      return [...b, { cat: form.cat, limit: parseFloat(form.limit), color: getCat(form.cat).color }];
    });
    setModal(false);
  };

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => {
    const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((ss, t) => ss + Math.abs(t.amount), 0);
    return s + spent;
  }, 0);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 8, paddingBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {cycleDay > 1 ? `Cykl ${fmtCycleLabel(month, cycleDay)}` : `Budżet · ${MONTH_NAMES[month]}`}
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 500, marginTop: 2 }}>
            <span style={{ color: "#ef4444" }}>{fmt(totalSpent)}</span>
            <span style={{ color: "#334155", fontSize: 14 }}> / {fmt(totalBudget)}</span>
          </div>
        </div>
        <button onClick={() => setModal(true)} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
          <PlusCircle size={13}/> Limit
        </button>
      </div>

      {/* Overall progress */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: "#64748b" }}>Wykorzystano</span>
          <span style={{ fontFamily: "'DM Mono', monospace", color: totalSpent/totalBudget > 0.9 ? "#ef4444" : "#10b981" }}>
            {totalBudget > 0 ? ((totalSpent/totalBudget)*100).toFixed(0) : 0}%
          </span>
        </div>
        <div style={{ background: "#060b14", borderRadius: 8, height: 10, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, totalBudget > 0 ? (totalSpent/totalBudget)*100 : 0)}%`, height: "100%", background: totalSpent/totalBudget > 0.9 ? "linear-gradient(90deg,#ef4444,#f97316)" : "linear-gradient(90deg,#1d4ed8,#3b82f6)", borderRadius: 8, transition: "width 0.8s ease" }}/>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#475569", fontFamily: "'DM Mono', monospace" }}>
          <span>{fmt(totalSpent)} wydano</span>
          <span>{fmt(totalBudget - totalSpent)} pozostało</span>
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {budgets.map(b => {
          const cat = getCat(b.cat);
          const Icon = cat.icon;
          const spent = monthTx.filter(t => t.cat === b.cat && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
          const pct = Math.min(100, b.limit > 0 ? (spent / b.limit) * 100 : 0);
          const over = spent > b.limit;
          return (
            <Card key={b.cat} style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: cat.color + "22", borderRadius: 10, padding: 7 }}>
                    <Icon size={14} color={cat.color}/>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{cat.label}</div>
                    <div style={{ fontSize: 11, color: "#475569", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                      {fmt(spent)} / {fmt(b.limit)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color: over ? "#ef4444" : cat.color }}>{pct.toFixed(0)}%</div>
                  {over && <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }}>+{fmt(spent - b.limit)} ponad limit</div>}
                </div>
              </div>
              <div style={{ background: "#060b14", borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: over ? "#ef4444" : `linear-gradient(90deg, ${cat.color}aa, ${cat.color})`, borderRadius: 6, transition: "width 0.8s ease" }}/>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Ustaw limit budżetu">
        <Select label="Kategoria" value={form.cat} onChange={e => setForm(f => ({...f, cat: e.target.value}))}>
          {CATEGORIES.filter(c => c.id !== "przychód" && c.id !== "inne").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <Input label="Limit miesięczny (zł)" type="number" value={form.limit} onChange={e => setForm(f => ({...f, limit: e.target.value}))} placeholder="np. 1500"/>
        <button onClick={addBudget} style={{ width: "100%", background: "linear-gradient(135deg, #1e40af, #3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          Zapisz limit
        </button>
      </Modal>
    </div>
  );
};


const RecurringReminder = ({ payments, transactions, setTransactions, accounts }) => {
  const today     = new Date();
  const todayStr  = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon..7=Sun
  const dayOfMonth = today.getDate();
  const [dismissed, setDismissed] = useState({});

  // Find recurring payments due today (weekly by weekday, monthly by day)
  const dueToday = payments.filter(p => {
    if (dismissed[p.id]) return false;
    if (p.freq === "daily") return true;
    if (p.freq === "weekly") return p.dayOfWeek === dayOfWeek;
    if (p.freq === "monthly" || p.freq === "bimonthly") return (p.dueDay || p.dayOfMonth || 1) === dayOfMonth;
    return false;
  });

  // Check which ones already have a transaction today
  const notYetAdded = dueToday.filter(p =>
    !transactions.some(t => t.desc === p.name && t.date === todayStr && t.amount === p.amount)
  );

  if (notYetAdded.length === 0) return null;

  const addNow = (p) => {
    setTransactions(tx => [{ id: Date.now(), date: todayStr, desc: p.name, amount: p.amount, cat: p.cat, acc: p.acc }, ...tx]);
    setDismissed(d => ({ ...d, [p.id]: true }));
  };

  const dismiss = (id) => setDismissed(d => ({ ...d, [id]: true }));

  return (
    <div style={{ marginBottom: 14 }}>
      {notYetAdded.map(p => (
        <div key={p.id} style={{
          background: "linear-gradient(135deg,#1a1208,#221a08)",
          border: "1px solid #78350f",
          borderRadius: 14, padding: "12px 14px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ background: "#f59e0b22", borderRadius: 10, padding: 8, flexShrink: 0 }}>
            <RefreshCw size={15} color="#f59e0b"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fcd34d" }}>
              🔔 {p.name}
            </div>
            <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
              Dzisiejsza płatność · {fmt(Math.abs(p.amount))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => addNow(p)} style={{
              background: "#f59e0b", border: "none", borderRadius: 8,
              padding: "6px 12px", cursor: "pointer", color: "#1a0a00",
              fontSize: 12, fontWeight: 700 }}>+ Dodaj</button>
            <button onClick={() => dismiss(p.id)} style={{
              background: "none", border: "1px solid #78350f44", borderRadius: 8,
              padding: "6px 8px", cursor: "pointer", color: "#92400e",
              fontSize: 11 }}>Pomiń</button>
          </div>
        </div>
      ))}
    </div>
  );
};

//    WEEKLY SUMMARY + FORECAST                                                  
const MiniComparison = ({ transactions, month, cycleDay }) => {
  const prevMonth = month > 0 ? month - 1 : 11;
  const curTx  = cycleTxs(transactions, month, cycleDay);
  const prevTx = cycleTxs(transactions, prevMonth, cycleDay);

  const curExp  = curTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
  const prevExp = prevTx.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
  const curInc  = curTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
  const prevInc = prevTx.filter(t => t.amount > 0 && t.cat !== "inne").reduce((s,t) => s + t.amount, 0);

  const expDiff = prevExp > 0 ? ((curExp - prevExp) / prevExp * 100) : 0;
  const incDiff = prevInc > 0 ? ((curInc - prevInc) / prevInc * 100) : 0;

  const rows = [
    { label: "Wydatki",   cur: curExp,  diff: expDiff,  bad: expDiff > 0 },
    { label: "Przychody", cur: curInc,  diff: incDiff,  bad: incDiff < 0 },
  ];

  return (
    <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12 }}>
        vs {MONTH_NAMES[prevMonth]}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map(({ label, cur, diff, bad }) => (
          <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{fmtShort(cur)} zł</div>
            {Math.abs(diff) > 0.5 && (
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3,
                color: bad ? "#ef4444" : "#10b981" }}>
                {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(0)}%
              </div>
            )}
            {Math.abs(diff) <= 0.5 && (
              <div style={{ fontSize: 11, color: "#334155", marginTop: 3 }}>bez zmian</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

//    GOALS VIEW                                                                 
//    FORECAST TAB COMPONENT                                                    
const ForecastTab = () => {
  const [monthly,  setMonthly]  = useState(1000);
  const [years,    setYears]    = useState(10);
  const [rate,     setRate]     = useState(7);
  const [startAmt, setStartAmt] = useState(0);

  const months  = years * 12;
  const r       = rate / 100 / 12;
  const fvStart = startAmt * Math.pow(1 + r, months);
  const fvMthly = r > 0 ? monthly * ((Math.pow(1 + r, months) - 1) / r) : monthly * months;
  const total    = fvStart + fvMthly;
  const invested = startAmt + monthly * months;
  const profit   = total - invested;

  const chartData = Array.from({ length: years + 1 }, (_, i) => {
    const m  = i * 12;
    const fS = startAmt * Math.pow(1 + r, m);
    const fM = r > 0 ? monthly * ((Math.pow(1 + r, m) - 1) / r) : monthly * m;
    return { rok: i === 0 ? "Teraz" : `${i}r`, wartość: Math.round(fS + fM), wpłacono: Math.round(startAmt + monthly * m) };
  });

  const Slider = ({ label, value, onChange, min, max, step, fmtFn, color }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color }}>
          {fmtFn ? fmtFn(value) : value}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: color || "#3b82f6", cursor: "pointer" }}/>
    </div>
  );

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Parametry</div>
        <Slider label="Miesięczna wpłata" value={monthly} onChange={setMonthly} min={100} max={10000} step={100} fmtFn={v => fmt(v)} color="#3b82f6"/>
        <Slider label="Czas oszczędzania" value={years} onChange={setYears} min={1} max={40} step={1} fmtFn={v => `${v} lat`} color="#8b5cf6"/>
        <Slider label="Roczna stopa zwrotu" value={rate} onChange={setRate} min={0} max={20} step={0.5} fmtFn={v => `${v}%`} color="#10b981"/>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 6 }}>Kwota startowa</div>
          <input type="number" value={startAmt} onChange={e => setStartAmt(parseFloat(e.target.value)||0)}
            style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744", borderRadius: 8,
              padding: "10px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
        </div>
      </Card>

      <Card style={{ marginBottom: 14, background: "linear-gradient(135deg,#0d1e35,#0a1628)" }}>
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
            Po {years} latach będziesz mieć
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 32, fontWeight: 700, color: "#60a5fa" }}>
            {fmt(total)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Wpłacono",    val: invested, color: "#94a3b8" },
            { label: "Zysk z %",   val: profit,   color: "#10b981" },
            { label: "Miesięcznie", val: monthly,  color: "#f59e0b" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color }}>{fmt(val)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Wzrost w czasie</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gWart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gWpl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" stopOpacity={0.3}/>
                <stop offset="100%" stopColor="#475569" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="rok" tick={{ fill: "#475569", fontSize: 13 }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, fontSize: 13 }}
              formatter={(v, n) => [fmt(v), n === "wartość" ? "Wartość" : "Wpłacono"]}/>
            <Area type="monotone" dataKey="wpłacono" stroke="#475569" strokeWidth={1.5} fill="url(#gWpl)"/>
            <Area type="monotone" dataKey="wartość"  stroke="#3b82f6" strokeWidth={2}   fill="url(#gWart)"/>
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center" }}>
          {[["#3b82f6","Wartość portfela"],["#475569","Wpłacono"]].map(([c,l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 12, height: 3, background: c, borderRadius: 2 }}/>
              <span style={{ fontSize: 10, color: "#475569" }}>{l}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const GoalsView = ({ goals, setGoals, accounts, budgets, setBudgets, transactions, month, cycleDay = 1, vacationArchive = [], setVacationArchive }) => {
  const { toast, showToast } = useToast();
  const [modal,       setModal]       = useState(false);
  const [limitModal,  setLimitModal]  = useState(false);
  const [activeTab,   setActiveTab]   = useState("goals");
  const [vacation, setVacation]       = useState(
    JSON.parse(localStorage.getItem("ft_vacation") || "null") || {
      name: "", dest: "", dateFrom: "", dateTo: "", budget: "",
      categories: ["zakupy","jedzenie","transport","rozrywka","zdrowie"],
      pinnedTxIds: [],
    }
  );
  const saveVacation = (v) => {
    setVacation(v);
    localStorage.setItem("ft_vacation", JSON.stringify(v));
  };
  // Pre-trip filter   at component level (no hooks inside JSX)
  const [expandedVacId, setExpandedVacId] = useState(null);
  const [candidateFrom, setCandidateFrom] = useState(() => {
    const stored = JSON.parse(localStorage.getItem("ft_vacation") || "null");
    if ((stored && stored.dateFrom)) {
      const d = new Date(stored.dateFrom);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0,10);
    }
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0,10);
  });
  const [candidateTo, setCandidateTo] = useState(() => {
    const stored = JSON.parse(localStorage.getItem("ft_vacation") || "null");
    return (stored && stored.dateFrom) || new Date().toISOString().slice(0,10);
  });
  const [editGoal,    setEditGoal]    = useState(null);
  const EMPTY_FORM = { name: "", target: "", saved: "", accId: 1, color: "#06b6d4", emoji: "💰" };
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [limitForm,   setLimitForm]   = useState({ cat: "bukmacher", limit: "" });

  //    Goals logic                                                            
  const openAdd  = () => { setEditGoal(null); setForm(EMPTY_FORM); setModal(true); };
  const openEdit = (goal) => {
    setEditGoal(goal);
    setForm({ name: goal.name, target: String(goal.target), saved: String(goal.saved), accId: goal.accId, color: goal.color, emoji: goal.emoji });
    setModal(true);
  };

  const saveGoal = () => {
    if (!form.name || !form.target) return;
    const item = { name: form.name, target: parseFloat(form.target), saved: parseFloat(form.saved||0), accId: parseInt(form.accId), color: form.color, emoji: form.emoji };
    if (editGoal) {
      setGoals(g => g.map(x => x.id === editGoal.id ? { ...x, ...item } : x));
      showToast("Cel zaktualizowany ✓");
    } else {
      setGoals(g => [...g, { id: Date.now(), ...item }]);
      showToast("Cel dodany ✓");
    }
    setModal(false);
  };
  const updateSaved = (id, delta) => setGoals(g => g.map(goal => goal.id === id ? { ...goal, saved: Math.max(0, goal.saved + delta) } : goal));
  const deleteGoal  = (id) => setGoals(g => g.filter(x => x.id !== id));
  const totalTarget = goals.reduce((s,g) => s + g.target, 0);
  const totalSaved  = goals.reduce((s,g) => s + g.saved, 0);

  //    Limits logic                                                           
  // budgets array: { cat, limit, color }
  const monthTx = cycleTxs(transactions, month, cycleDay).filter(t => t.amount < 0);

  const spentBycat = {};
  monthTx.forEach(t => { spentBycat[t.cat] = (spentBycat[t.cat]||0) + Math.abs(t.amount); });

  const addLimit = () => {
    if (!limitForm.cat || !limitForm.limit) return;
    const existing = budgets.find(b => b.cat === limitForm.cat);
    if (existing) {
      setBudgets(b => b.map(x => x.cat === limitForm.cat ? { ...x, limit: parseFloat(limitForm.limit) } : x));
    } else {
      setBudgets(b => [...b, { cat: limitForm.cat, limit: parseFloat(limitForm.limit), color: getCat(limitForm.cat).color }]);
    }
    setLimitForm({ cat: "bukmacher", limit: "" });
    setLimitModal(false);
  };
  const deleteLimit = (cat) => setBudgets(b => b.filter(x => x.cat !== cat));

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 6, paddingTop: 8, paddingBottom: 14 }}>
        {[["goals","🎯 Cele"],["limits","🚦 Limity"],["vacation","🏖️ Wakacje"]].map(([t,l]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            flex: 1, padding: "9px 0", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 12,
            fontFamily: "'Space Grotesk', sans-serif",
            background: activeTab === t ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#0f1825",
            border: `1px solid ${activeTab === t ? "#2563eb" : "#1a2744"}`,
            color: activeTab === t ? "white" : "#475569",
          }}>{l}</button>
        ))}
      </div>

      {/*    CELE    */}
      {activeTab === "goals" && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Cele oszczędnościowe</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, marginTop: 3 }}>
              <span style={{ color: "#10b981" }}>{fmt(totalSaved)}</span>
              <span style={{ color: "#334155", fontSize: 13 }}> / {fmt(totalTarget)}</span>
            </div>
          </div>
          <button onClick={openAdd} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
            <PlusCircle size={13}/> Cel
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>💰</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Brak celów oszczędnościowych</div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                Dodaj cel — wakacje, nowy telefon, poduszka finansowa. Śledź postęp i odkładaj systematycznie.
              </div>
              <button onClick={openAdd} style={{
                background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none",
                borderRadius: 12, padding: "12px 24px", color: "white",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>+ Dodaj pierwszy cel</button>
            </div>
          )}
          {goals.map(goal => {
            const pct  = Math.min(100, goal.target > 0 ? (goal.saved / goal.target * 100) : 0);
            const done = pct >= 100;
            const acc  = accounts.find(a => a.id === goal.accId);
            return (
              <Card key={goal.id} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 28, lineHeight: 1 }}>{goal.emoji}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{goal.name}</div>
                      {acc && <div style={{ fontSize: 11, color: acc.color, marginTop: 2 }}>{acc.name}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600, color: done ? "#10b981" : goal.color }}>{pct.toFixed(0)}%</div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                      <button onClick={() => openEdit(goal)} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 6, padding: "2px 8px", cursor: "pointer", color: "#60a5fa", fontSize: 10 }}>Edytuj</button>
                      <button onClick={() => deleteGoal(goal.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#334155" }}><Trash2 size={11}/></button>
                    </div>
                  </div>
                </div>
                <div style={{ background: "#060b14", borderRadius: 8, height: 8, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: done ? "linear-gradient(90deg,#059669,#10b981)" : `linear-gradient(90deg,${goal.color}99,${goal.color})`, borderRadius: 8, transition: "width 0.8s ease" }}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmt(goal.saved)}</span>
                    <span style={{ color: "#334155" }}> / {fmt(goal.target)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[100, 500, 1000].map(amt => (
                      <button key={amt} onClick={() => updateSaved(goal.id, amt)} style={{ background: "#0a1e12", border: "1px solid #14532d55", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#10b981", fontSize: 11, fontWeight: 700 }}>+{amt} zł</button>
                    ))}
                    <button onClick={() => updateSaved(goal.id, -100)} style={{ background: "#1a0808", border: "1px solid #7f1d1d44", borderRadius: 7, padding: "4px 8px", cursor: "pointer", color: "#f87171", fontSize: 11 }}>−100 zł</button>
                  </div>
                </div>
                {done
                  ? <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#10b981" }}>🎉 Cel osiągnięty!</div>
                  : <div style={{ marginTop: 8, fontSize: 11, color: "#334155", textAlign: "right" }}>brakuje {fmt(goal.target - goal.saved)}</div>
                }
              </Card>
            );
          })}
        </div>
      </>}

      {/*    LIMITY    */}
      {activeTab === "limits" && <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Limity miesięczne · {MONTH_NAMES[month]}</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 3 }}>Ustaw max kwotę na kategorię</div>
          </div>
          <button onClick={() => setLimitModal(true)} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
            <PlusCircle size={13}/> Limit
          </button>
        </div>

        {budgets.length === 0 && (
          <div style={{ background: "#0f1825", border: "1px solid #1a2744", borderRadius: 14, padding: "24px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>Brak limitów</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Kliknij + Limit aby dodać pierwszy</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {budgets.map(b => {
            const spent  = spentBycat[b.cat] || 0;
            const pct    = b.limit > 0 ? Math.min(100, spent / b.limit * 100) : 0;
            const over   = spent > b.limit;
            const warn   = !over && pct >= 80;
            const cat    = getCat(b.cat);
            const Icon   = cat.icon;
            const remain = b.limit - spent;

            return (
              <div key={b.cat} style={{
                background: over ? "linear-gradient(135deg,#1a0808,#200e0e)" : "#0f1825",
                border: `1px solid ${over ? "#7f1d1d" : warn ? "#78350f" : "#1a2744"}`,
                borderRadius: 14, padding: "14px 16px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ background: cat.color+"22", borderRadius: 10, padding: 8 }}>
                      <Icon size={14} color={cat.color}/>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{cat.label}</div>
                      <div style={{ fontSize: 11, marginTop: 2, color: over ? "#ef4444" : warn ? "#f59e0b" : "#475569" }}>
                        {over ? "! Przekroczono o " + fmt(spent - b.limit) : warn ? `🔶 Zostało tylko ${fmt(remain)}` : `Zostało ${fmt(remain)}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: over ? "#ef4444" : warn ? "#f59e0b" : "#e2e8f0" }}>
                      {fmt(spent)}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569" }}>/ {fmt(b.limit)}</div>
                    <button onClick={() => deleteLimit(b.cat)} style={{ background: "none", border: "none", cursor: "pointer", color: "#334155", marginTop: 2 }}><Trash2 size={11}/></button>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ background: "#060b14", borderRadius: 6, height: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", borderRadius: 6,
                    background: over ? "#ef4444" : warn ? "#f59e0b" : `linear-gradient(90deg,${cat.color}88,${cat.color})`,
                    transition: "width 0.6s ease",
                  }}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#334155" }}>
                  <span>0</span>
                  <span style={{ color: over ? "#ef4444" : "#475569", fontWeight: over ? 700 : 400 }}>{pct.toFixed(0)}%</span>
                  <span>{fmt(b.limit)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {/*    WAKACJE    */}
      {activeTab === "vacation" && (() => {
        // Spending: in-range by category + manually pinned
        const from    = vacation.dateFrom || "0000";
        const to      = vacation.dateTo   || "9999";
        const pinned  = vacation.pinnedTxIds || [];
        const vacTx   = transactions.filter(t =>
          t.amount < 0 && (
            (t.date >= from && t.date <= to && vacation.categories.includes(t.cat)) ||
            pinned.includes(t.id)
          )
        );
        // Separate: in-range vs pre-trip pinned
        const inRange  = vacTx.filter(t => t.date >= from && t.date <= to && vacation.categories.includes(t.cat));
        const preTrip  = vacTx.filter(t => pinned.includes(t.id) && !(t.date >= from && t.date <= to && vacation.categories.includes(t.cat)));
        const spent    = vacTx.reduce((s,t) => s + Math.abs(t.amount), 0);
        const preTripTotal = preTrip.reduce((s,t) => s + Math.abs(t.amount), 0);

        const togglePin = (txId) => {
          const curr = vacation.pinnedTxIds || [];
          saveVacation({...vacation,
            pinnedTxIds: curr.includes(txId) ? curr.filter(x => x !== txId) : [...curr, txId]
          });
        };

        // Candidates for pinning   filtered by date range set at component level
        const candidates = transactions
          .filter(t =>
            t.amount < 0 &&
            t.date >= candidateFrom &&
            t.date <= candidateTo &&
            !(t.date >= from && t.date <= to && vacation.categories.includes(t.cat))
          )
          .sort((a,b) => b.date.localeCompare(a.date));
        const budget = parseFloat(vacation.budget) || 0;
        const remaining = budget - spent;
        const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

        // Days calculation
        const today = new Date();
        const dFrom = vacation.dateFrom ? new Date(vacation.dateFrom) : null;
        const dTo   = vacation.dateTo   ? new Date(vacation.dateTo)   : null;
        const totalDays   = dFrom && dTo ? Math.max(1, Math.ceil((dTo - dFrom) / 86400000)) : 0;
        const daysPassed  = dFrom ? Math.max(0, Math.ceil((today - dFrom) / 86400000)) : 0;
        const daysLeft    = dTo   ? Math.max(0, Math.ceil((dTo - today)   / 86400000)) : 0;
        const dailyBudget = budget > 0 && totalDays > 0 ? budget / totalDays : 0;
        const dailyLeft   = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;
        const isActive    = dFrom && dTo && today >= dFrom && today <= dTo;

        const ALL_CATS = [...CATEGORIES];
        const vacCats  = ALL_CATS.filter(c => !["przychód","sprzedaż","dodatkowe","bukmacherka","inne","rząd","inwestycje","rachunki"].includes(c.id));

        return (
          <div>
            {/* Setup card */}
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>🏖️ Moje wakacje</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Nazwa</div>
                  <input value={vacation.name}
                    onChange={e => saveVacation({...vacation, name: e.target.value})}
                    placeholder="np. Grecja 2026"
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 15,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Destynacja</div>
                  <input value={vacation.dest}
                    onChange={e => saveVacation({...vacation, dest: e.target.value})}
                    placeholder="np. Ateny 🇬🇷"
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 15,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Data od</div>
                  <input type="date" value={vacation.dateFrom}
                    onChange={e => saveVacation({...vacation, dateFrom: e.target.value})}
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 15,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Data do</div>
                  <input type="date" value={vacation.dateTo}
                    onChange={e => saveVacation({...vacation, dateTo: e.target.value})}
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 15,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5 }}>Budżet (zł)</div>
                <input type="number" value={vacation.budget}
                  onChange={e => saveVacation({...vacation, budget: e.target.value})}
                  placeholder="np. 5000"
                  style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                    borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 16,
                    fontFamily: "'DM Mono', monospace", outline: "none" }}/>
              </div>
              {/* Category selector */}
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>Śledzone kategorie</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {vacCats.map(c => {
                    const on = vacation.categories.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => saveVacation({...vacation,
                        categories: on
                          ? vacation.categories.filter(x => x !== c.id)
                          : [...vacation.categories, c.id]
                      })} style={{
                        background: on ? c.color+"22" : "#060b14",
                        border: `1px solid ${on ? c.color+"66" : "#1a2744"}`,
                        borderRadius: 8, padding: "5px 10px", cursor: "pointer",
                        color: on ? c.color : "#334155", fontSize: 11, fontWeight: 600,
                      }}>{c.label}</button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Stats   only if budget set */}
            {budget > 0 && (
              <Card style={{ marginBottom: 14, background: isActive ? "linear-gradient(135deg,#0a1e12,#061610)" : undefined }}>
                {isActive && (
                  <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700,
                    textTransform: "uppercase", marginBottom: 10 }}>✈️ Trwa teraz!</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Wydano",     val: spent,     color: pct > 80 ? "#ef4444" : "#e2e8f0" },
                    { label: "Zostało",    val: remaining, color: remaining < 0 ? "#ef4444" : "#10b981" },
                    { label: "Dziennie",   val: dailyBudget, color: "#60a5fa", suffix: "/dzień" },
                    { label: "Dziś mogę",  val: dailyLeft,   color: dailyLeft < 0 ? "#ef4444" : "#f59e0b", suffix: "/dzień" },
                  ].map(({ label, val, color, suffix }) => (
                    <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700,
                        textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15,
                        fontWeight: 700, color }}>{fmt(Math.abs(val))}{suffix && <span style={{fontSize:10,color:"#475569"}}> {suffix}</span>}</div>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#475569" }}>Budżet: {fmt(budget)}</span>
                  <span style={{ color: pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#10b981",
                    fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{ background: "#060b14", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6,
                    background: pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#10b981",
                    transition: "width 0.6s" }}/>
                </div>
                {totalDays > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#334155", textAlign: "center" }}>
                    {totalDays} dni · {daysPassed} minęło · {daysLeft} zostało
                  </div>
                )}
              </Card>
            )}

            {/* Pre-trip pinned transactions */}
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                ✈️ Przed wyjazdem {preTripTotal > 0 && `· ${fmt(preTripTotal)}`}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}>
                Zaznacz transakcje które należą do wyjazdu (loty, ubezpieczenie, hotel...)
              </div>
              {/* Date range filter */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>Od</div>
                  <input type="date" value={candidateFrom}
                    onChange={e => setCandidateFrom(e.target.value)}
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "7px 10px", color: "#e2e8f0", fontSize: 14,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>Do</div>
                  <input type="date" value={candidateTo}
                    onChange={e => setCandidateTo(e.target.value)}
                    style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
                      borderRadius: 8, padding: "7px 10px", color: "#e2e8f0", fontSize: 14,
                      fontFamily: "'Space Grotesk', sans-serif", outline: "none" }}/>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>Szybko</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[[1,"1M"],[3,"3M"],[6,"6M"]].map(([m,l]) => {
                      const d = new Date(candidateTo || new Date());
                      d.setMonth(d.getMonth() - m);
                      const df = d.toISOString().slice(0,10);
                      return (
                        <button key={l} onClick={() => setCandidateFrom(df)}
                          style={{ background: candidateFrom === df ? "#1e3a5f" : "#060b14",
                            border: `1px solid ${candidateFrom === df ? "#2563eb" : "#1a2744"}`,
                            borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                            color: candidateFrom === df ? "#60a5fa" : "#475569",
                            fontSize: 11, fontWeight: 700 }}>{l}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {candidates.length === 0 && (
                <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: 8 }}>Brak transakcji do przypięcia</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {candidates.slice(0,20).map(t => {
                  const cat  = getCat(t.cat);
                  const Icon = cat.icon;
                  const on   = (vacation.pinnedTxIds||[]).includes(t.id);
                  return (
                    <div key={t.id} onClick={() => togglePin(t.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                      borderRadius: 10, cursor: "pointer",
                      background: on ? "#0a1e12" : "#060b14",
                      border: `1px solid ${on ? "#16a34a44" : "#1a2744"}`,
                    }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        background: on ? "#052e16" : "#0d1628",
                        border: `2px solid ${on ? "#16a34a" : "#1e3a5f"}`,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {on && <Check size={11} color="#10b981"/>}
                      </div>
                      <div style={{ background: cat.color+"22", borderRadius: 7, padding: 5, flexShrink: 0 }}>
                        <Icon size={11} color={cat.color}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: on ? "#86efac" : "#e2e8f0" }}>{t.desc}</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>{t.date} · {cat.label}</div>
                      </div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12,
                        color: on ? "#10b981" : "#ef4444", flexShrink: 0 }}>
                        {fmt(Math.abs(t.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* All vacation transactions */}
            {vacTx.length > 0 && (
              <Card>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                  Wszystkie ({vacTx.length}) · {fmt(spent)}
                </div>
                {vacTx.slice(0,10).map(t => {
                  const cat  = getCat(t.cat);
                  const Icon = cat.icon;
                  const isPinned = pinned.includes(t.id);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 0", borderBottom: "1px solid #0f1a2e" }}>
                      <div style={{ background: cat.color+"22", borderRadius: 8, padding: 6, flexShrink: 0 }}>
                        <Icon size={12} color={cat.color}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap" }}>{t.desc}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>
                          {t.date} {isPinned && <span style={{color:"#f59e0b"}}>· ✈️ przed</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                        color: "#ef4444", flexShrink: 0 }}>−{fmt(Math.abs(t.amount))}</div>
                    </div>
                  );
                })}
              </Card>
            )}

            {budget === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#334155", fontSize: 13 }}>
                Wpisz budżet powyżej żeby zobaczyć statystyki
              </div>
            )}

            {/* Archive actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  if (!vacation.name) { alert("Wpisz nazwę wyjazdu przed zapisem"); return; }
                  const entry = {
                    ...vacation,
                    id: Date.now(),
                    savedAt: new Date().toISOString().slice(0,10),
                    spent,
                    txCount: vacTx.length,
                  };
                  setVacationArchive(a => [entry, ...a]);
                  alert(`Zapisano "${vacation.name}" do archiwum!`);
                }}
                style={{ flex: 1, background: "linear-gradient(135deg,#1e40af,#3b82f6)",
                  border: "none", borderRadius: 12, padding: "12px 0",
                  color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif" }}>
                💾 Zapisz do archiwum
              </button>
              <button
                onClick={() => {
                  if (!window.confirm("Wyczyścić obecny wyjazd i zacząć nowy?")) return;
                  const empty = { name: "", dest: "", dateFrom: "", dateTo: "", budget: "",
                    categories: ["zakupy","jedzenie","transport","rozrywka","zdrowie"],
                    pinnedTxIds: [] };
                  saveVacation(empty);
                }}
                style={{ background: "#0d1628", border: "1px solid #1a2744",
                  borderRadius: 12, padding: "12px 14px",
                  color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                ✕ Nowy
              </button>
            </div>

            {/* Archive list */}
            {vacationArchive.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                  📚 Archiwum wyjazdów
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {vacationArchive.map(v => {
                    const bgt      = parseFloat(v.budget) || 0;
                    const pct      = bgt > 0 ? Math.min(100, (v.spent / bgt) * 100) : 0;
                    const isOpen   = expandedVacId === v.id;
                    const saved    = bgt - v.spent;
                    const totalDays = v.dateFrom && v.dateTo
                      ? Math.max(1, Math.ceil((new Date(v.dateTo) - new Date(v.dateFrom)) / 86400000))
                      : 0;

                    // Transactions that belonged to this vacation
                    const vFrom  = v.dateFrom || "0000";
                    const vTo    = v.dateTo   || "9999";
                    const vPins  = v.pinnedTxIds || [];
                    const vCats  = v.categories || [];
                    const vTxs   = transactions.filter(t =>
                      t.amount < 0 && (
                        (t.date >= vFrom && t.date <= vTo && vCats.includes(t.cat)) ||
                        vPins.includes(t.id)
                      )
                    ).sort((a,b) => b.date.localeCompare(a.date));

                    // Category breakdown
                    const catBreakdown = {};
                    vTxs.forEach(t => {
                      catBreakdown[t.cat] = (catBreakdown[t.cat] || 0) + Math.abs(t.amount);
                    });
                    const catRows = Object.entries(catBreakdown).sort((a,b) => b[1]-a[1]);

                    return (
                      <div key={v.id} style={{ background: "#0f1825", border: `1px solid ${isOpen ? "#2563eb44" : "#1a2744"}`,
                        borderRadius: 14, overflow: "hidden" }}>

                        {/* Header   always visible, click to expand */}
                        <div onClick={() => setExpandedVacId(isOpen ? null : v.id)}
                          style={{ padding: "14px 16px", cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                                {v.name}
                                {v.dest && <span style={{fontSize:12,color:"#64748b"}}>· {v.dest}</span>}
                                <span style={{ fontSize: 11, color: isOpen ? "#60a5fa" : "#334155" }}>{isOpen ? "▲" : "▼"}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                                {v.dateFrom && v.dateTo ? `${v.dateFrom} → ${v.dateTo}` : v.savedAt}
                                {totalDays > 0 && ` · ${totalDays} dni`}
                                {v.txCount > 0 && ` · ${v.txCount} transakcji`}
                              </div>
                            </div>
                            <button onClick={e => { e.stopPropagation();
                              if (window.confirm(`Usunąć "${v.name}" z archiwum?`))
                                setVacationArchive(a => a.filter(x => x.id !== v.id));
                            }} style={{ background: "none", border: "none", cursor: "pointer",
                              color: "#334155", padding: 4 }}><Trash2 size={13}/></button>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between",
                            fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                            <span style={{ color: "#94a3b8" }}>Budżet: <strong style={{color:"#e2e8f0"}}>{fmt(bgt)}</strong></span>
                            <span style={{ color: pct > 100 ? "#ef4444" : "#10b981" }}>
                              Wydano: <strong>{fmt(v.spent)}</strong> ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          {bgt > 0 && (
                            <div style={{ background: "#060b14", borderRadius: 4, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%",
                                background: pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#10b981",
                                borderRadius: 4 }}/>
                            </div>
                          )}
                        </div>

                        {/* Expanded details */}
                        {isOpen && (
                          <div style={{ borderTop: "1px solid #1a2744", padding: "14px 16px" }}>

                            {/* Summary grid */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                              {[
                                { label: "Budżet",    val: bgt,        color: "#e2e8f0" },
                                { label: "Wydano",    val: v.spent,    color: pct > 100 ? "#ef4444" : "#f59e0b" },
                                { label: saved >= 0 ? "Zaoszczędzono" : "Przekroczono",
                                  val: Math.abs(saved), color: saved >= 0 ? "#10b981" : "#ef4444" },
                              ].map(({ label, val, color }) => (
                                <div key={label} style={{ background: "#060b14", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700,
                                    textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13,
                                    fontWeight: 700, color }}>{fmt(val)}</div>
                                </div>
                              ))}
                            </div>

                            {/* Category breakdown */}
                            {catRows.length > 0 && (
                              <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 10, color: "#475569", fontWeight: 700,
                                  textTransform: "uppercase", marginBottom: 8 }}>Wydatki wg kategorii</div>
                                {catRows.map(([cat, val]) => {
                                  const c = getCat(cat);
                                  const Icon = c.icon;
                                  const p = v.spent > 0 ? (val / v.spent * 100) : 0;
                                  return (
                                    <div key={cat} style={{ marginBottom: 8 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between",
                                        alignItems: "center", marginBottom: 4 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <div style={{ background: c.color+"22", borderRadius: 6, padding: 4 }}>
                                            <Icon size={11} color={c.color}/>
                                          </div>
                                          <span style={{ fontSize: 13 }}>{c.label}</span>
                                        </div>
                                        <span style={{ fontFamily: "'DM Mono', monospace",
                                          fontSize: 12, color: c.color }}>{fmt(val)}</span>
                                      </div>
                                      <div style={{ background: "#060b14", borderRadius: 3, height: 3 }}>
                                        <div style={{ width: `${p}%`, height: "100%",
                                          background: c.color, borderRadius: 3, opacity: 0.7 }}/>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Transaction list */}
                            {vTxs.length > 0 && (
                              <div>
                                <div style={{ fontSize: 10, color: "#475569", fontWeight: 700,
                                  textTransform: "uppercase", marginBottom: 8 }}>
                                  Transakcje ({vTxs.length})
                                </div>
                                {vTxs.slice(0,12).map(t => {
                                  const cat = getCat(t.cat);
                                  const Icon = cat.icon;
                                  return (
                                    <div key={t.id} style={{ display: "flex", alignItems: "center",
                                      gap: 10, padding: "7px 0", borderBottom: "1px solid #0f1a2e" }}>
                                      <div style={{ background: cat.color+"22", borderRadius: 7, padding: 5, flexShrink: 0 }}>
                                        <Icon size={11} color={cat.color}/>
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, overflow: "hidden",
                                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</div>
                                        <div style={{ fontSize: 10, color: "#475569" }}>{t.date}</div>
                                      </div>
                                      <div style={{ fontFamily: "'DM Mono', monospace",
                                        fontSize: 12, color: "#ef4444", flexShrink: 0 }}>
                                        −{fmt(Math.abs(t.amount))}
                                      </div>
                                    </div>
                                  );
                                })}
                                {vTxs.length > 12 && (
                                  <div style={{ fontSize: 11, color: "#334155", textAlign: "center", padding: "8px 0" }}>
                                    +{vTxs.length - 12} więcej
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Modal   nowy cel */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
      <Modal open={modal} onClose={() => { setModal(false); setEditGoal(null); }} title={editGoal ? "Edytuj cel" : "Nowy cel"}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Emoji</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["💰","🎯","🏠","🚗","✈️","💍","📱","🎓","🏖️","💪","🌍","🏦","📈","🎸","🐕","👶","🏋️","🎮","🛋️","🌴"].map(e => (
              <button key={e} onClick={() => setForm(f => ({...f, emoji: e}))} style={{ fontSize: 22, background: form.emoji === e ? "#1e3a5f" : "#060b14", border: `1px solid ${form.emoji === e ? "#2563eb" : "#1a2744"}`, borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}>{e}</button>
            ))}
          </div>
        </div>
        <Input label="Nazwa celu" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="np. Wakacje letnie"/>
        <Input label="Cel (zł)" type="number" value={form.target} onChange={e => setForm(f => ({...f, target: e.target.value}))} placeholder="np. 8000"/>
        <Input label="Już odłożone (zł)" type="number" value={form.saved} onChange={e => setForm(f => ({...f, saved: e.target.value}))} placeholder="0"/>
        <Select label="Konto" value={form.accId} onChange={e => setForm(f => ({...f, accId: e.target.value}))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Kolor</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["#06b6d4","#10b981","#8b5cf6","#f59e0b","#ef4444","#ec4899","#3b82f6"].map(c => (
              <div key={c} onClick={() => setForm(f => ({...f, color: c}))} style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer", border: form.color === c ? "2px solid white" : "2px solid transparent" }}/>
            ))}
          </div>
        </div>
        <button onClick={saveGoal} style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          {editGoal ? "Zapisz zmiany" : "Dodaj cel"}
        </button>
      </Modal>

      {/* Modal   nowy limit */}
      <Modal open={limitModal} onClose={() => setLimitModal(false)} title="Nowy limit miesięczny">
        <Select label="Kategoria" value={limitForm.cat} onChange={e => setLimitForm(f => ({...f, cat: e.target.value}))}>
          {CATEGORIES.filter(c => !["przychód","inne","sprzedaż","dodatkowe","bukmacherka"].includes(c.id)).map(c =>
            <option key={c.id} value={c.id}>{c.label}</option>
          )}
        </Select>
        <Input label="Limit miesięczny (zł)" type="number" value={limitForm.limit}
          onChange={e => setLimitForm(f => ({...f, limit: e.target.value}))} placeholder="np. 200"/>
        <div style={{ marginBottom: 16, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Wydano w tym miesiącu: <span style={{ color: "#e2e8f0", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
              {fmt(spentBycat[limitForm.cat] || 0)}
            </span>
          </div>
        </div>
        <button onClick={addLimit} style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          Zapisz limit
        </button>
      </Modal>
    </div>
  );
};


export { GoalsView, RecurringReminder, MiniComparison };

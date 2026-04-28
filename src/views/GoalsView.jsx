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
import { fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel, buildHistData, todayLocal, dateToLocal } from "../utils.js";
import { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats, INITIAL_TEMPLATES } from "../constants.js";
import { getEffectiveBalance } from "../lib/accountTypes.js";
import { useToast } from "../hooks/useToast.js";
import { RecurringReminder, MiniComparison } from "../components/SharedWidgets.jsx";
function BudgetView({ transactions, budgets, setBudgets, month, cycleDay = 1 }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ cat: "jedzenie", limit: "" });

  const monthTx = cycleTxs(transactions, month, cycleDay);

  const addBudget = () => {
    if (!form.limit) return;
    setBudgets(b => {
      const exists = b.findIndex(x => x.cat === form.cat);
      if (exists >= 0) { const n = [...b]; n[exists] = { ...n[exists], limit: Math.max(0, parseFloat(String(form.limit).replace(",", ".")) || 0) }; return n; }
      return [...b, { cat: form.cat, limit: Math.max(0, parseFloat(String(form.limit).replace(",", ".")) || 0), color: getCat(form.cat).color }];
    });
    setModal(false);
  };

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  // Pre-compute spent per kategoria - jedna pętla O(N) zamiast O(N*M)
  const spentByCategory = useMemo(() => {
    const map = {};
    for (const t of monthTx) {
      if (t.amount < 0) {
        map[t.cat] = (map[t.cat] || 0) + Math.abs(t.amount);
      }
    }
    return map;
  }, [monthTx]);
  const totalSpent = budgets.reduce((s, b) => s + (spentByCategory[b.cat] || 0), 0);

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
        <button onClick={() => { setLimitForm({ cat: "bukmacher", limit: "" }); setModal(true); }} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
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
          const cat = getLocalCat(b.cat);
          const Icon = cat.icon;
          const spent = spentByCategory[b.cat] || 0;
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

      <Modal open={modal} onClose={() => { setModal(false); setEditGoal(null); }} title="Ustaw limit budżetu">
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


//    GOALS VIEW                                                                 
//    FORECAST TAB COMPONENT                                                    
function ForecastTab() {
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

function GoalsView({ goals, setGoals, accounts, budgets, setBudgets, transactions, month, cycleDay = 1, vacationArchive = [], setVacationArchive, allCats = [], portfolio = [] }) {
  const getLocalCat = (id) => {
    const found = (allCats || []).find(c => c.id === id);
    if (found) return { ...found, icon: (typeof found.icon === "function") ? found.icon : Wallet, label: found.label ? found.label.charAt(0).toUpperCase() + found.label.slice(1) : found.label };
    return getCat(id);
  };
  const { toast, showToast } = useToast();
  const [modal,       setModal]       = useState(false);
  const [limitModal,  setLimitModal]  = useState(false);
  const [activeTab,   setActiveTab]   = useState("goals");
  const [vacation, setVacation]       = useState((() => {
    const defaults = {
      name: "", dest: "", dateFrom: "", dateTo: "", budget: "",
      categories: ["zakupy","jedzenie","transport","rozrywka","zdrowie"],
      pinnedTxIds: [],
    };
    try {
      const parsed = JSON.parse(localStorage.getItem("ft_vacation") || "null");
      return parsed && typeof parsed === "object" ? { ...defaults, ...parsed } : defaults;
    } catch (_) { return defaults; }
  })()
  );
  const saveVacation = (v) => {
    setVacation(v);
    localStorage.setItem("ft_vacation", JSON.stringify(v));
  };
  // Pre-trip filter   at component level (no hooks inside JSX)
  const [expandedVacId, setExpandedVacId] = useState(null);
  const [candidateFrom, setCandidateFrom] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ft_vacation") || "null");
      if (stored && stored.dateFrom) {
        const d = new Date(stored.dateFrom);
        if (!isNaN(d.getTime())) {
          d.setMonth(d.getMonth() - 3);
          return dateToLocal(d);
        }
      }
    } catch (_) { /* fallback */ }
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return dateToLocal(d);
  });
  const [candidateTo, setCandidateTo] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ft_vacation") || "null");
      if (stored && stored.dateFrom) {
        const d = new Date(stored.dateFrom);
        if (!isNaN(d.getTime())) return stored.dateFrom;
      }
    } catch (_) { /* fallback */ }
    return todayLocal();
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
    const target = parseFloat(String(form.target).replace(",", "."));
    if (!isFinite(target) || target <= 0) return;
    const saved = parseFloat(String(form.saved || 0).replace(",", "."));
    const item = { name: form.name, target, saved: isFinite(saved) ? saved : 0, accId: parseInt(form.accId), color: form.color, emoji: form.emoji };
    if (editGoal) {
      setGoals(g => g.map(x => x.id === editGoal.id ? { ...x, ...item } : x));
      showToast("Cel zaktualizowany ✓");
    } else {
      setGoals(g => [...g, { id: Date.now(), ...item }]);
      showToast("Cel dodany ✓");
    }
    setModal(false);
    setEditGoal(null);
  };
  const updateSaved = (id, delta) => setGoals(g => g.map(goal => goal.id === id ? { ...goal, saved: Math.max(0, goal.saved + delta) } : goal));
  const deleteGoal  = (id) => setGoals(g => g.filter(x => x.id !== id));
  const totalTarget = goals.reduce((s,g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => {
    const linkedAcc = accounts.find(a => a.id === g.accId);
    return s + (linkedAcc ? linkedAcc.balance : g.saved);
  }, 0);

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

      {/*    CELE    */}
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
            const acc  = accounts.find(a => a.id === goal.accId);
            const effectiveSaved = acc ? getEffectiveBalance(acc, portfolio) : goal.saved;
            const pct  = Math.min(100, goal.target > 0 ? (effectiveSaved / goal.target * 100) : 0);
            const done = effectiveSaved >= goal.target;
            return (
              <Card key={goal.id} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 28, lineHeight: 1 }}>{goal.emoji}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{goal.name}</div>
                      {acc && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: acc.color }}>{acc.name}</span>
                    <span style={{ fontSize: 9, color: "#10b981", background: "#052e16",
                      border: "1px solid #16a34a33", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>
                      ⟳ sync
                    </span>
                  </div>
                )}
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
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{fmt(effectiveSaved)}</span>
                    <span style={{ color: "#334155" }}> / {fmt(goal.target)}</span>
                  </div>
                  {!acc ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      {[100, 500, 1000].map(amt => (
                        <button key={amt} onClick={() => updateSaved(goal.id, amt)} style={{ background: "#0a1e12", border: "1px solid #14532d55", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#10b981", fontSize: 11, fontWeight: 700 }}>+{amt} zł</button>
                      ))}
                      <button onClick={() => updateSaved(goal.id, -100)} style={{ background: "#1a0808", border: "1px solid #7f1d1d44", borderRadius: 7, padding: "4px 8px", cursor: "pointer", color: "#f87171", fontSize: 11 }}>−100 zł</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#334155" }}>
                      Saldo aktualizuje się automatycznie
                    </div>
                  )}
                </div>
                {done
                  ? <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#10b981" }}>🎉 Cel osiągnięty!</div>
                  : <div style={{ marginTop: 8, fontSize: 11, color: "#334155", textAlign: "right" }}>brakuje {fmt(goal.target - effectiveSaved)}</div>
                }
              </Card>
            );
          })}
        </div>


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

    </div>
  );
};


export { GoalsView };

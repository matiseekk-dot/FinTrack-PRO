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
import { RecurringReminder } from "../components/SharedWidgets.jsx";


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

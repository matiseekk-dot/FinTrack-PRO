import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { useHaptic } from "../hooks/useHaptic.js";
const PaymentsView = ({ payments, setPayments, paid, setPaid, transactions, setTransactions, accounts, month: globalMonth, partnerName = "Partner" }) => {
  const { toast, showToast } = useToast();
  const { success: hapticSuccess, medium: hapticMedium } = useHaptic();
  const TODAY_FULL = new Date();
  const TODAY_DAY  = TODAY_FULL.getDate();
  const TODAY_ISO  = TODAY_FULL.toISOString().split("T")[0]; // "2026-04-01"
  // own month selector - starts at current month, can navigate independently
  const [localMonth, setLocalMonth] = useState(globalMonth);
  const currentRealMonth = new Date().getMonth();
  // Sync with global month when user switches tabs
  useEffect(() => { setLocalMonth(globalMonth); }, [globalMonth]);
  const month    = localMonth;
  const monthKey = `${new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}`;
  const isCurrentMonth = month === globalMonth;
  // For overdue: only past if the due date for THIS viewed month is before today
  const isDueOverdue = (dueDay) => {
    const dueDate = `${new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    return dueDate < TODAY_ISO;
  };
  const isDueSoon = (dueDay) => {
    const dueDate = `${new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    const diff = Math.ceil((new Date(dueDate) - TODAY_FULL) / 86400000);
    return diff >= 0 && diff <= 3;
  };
  const DAYS_PL   = ["Pn","Wt","Śr","Cz","Pt","So","Nd"];

  const [modal,    setModal]    = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showAll,  setShowAll]  = useState(false);
  const [section,  setSection]  = useState("credit"); // active add section
  const EMPTY = { name:"", amount:"", cat:"rachunki", acc:1, color:"#3b82f6",
                  type:"credit", freq:"monthly", dueDay:1, dayOfWeek:1, trackPaid:true, shared:false };
  const [form, setForm] = useState(EMPTY);

  const openAdd = (type) => {
    const defaults = {
      credit:  { ...EMPTY, type:"credit",  color:"#3b82f6", cat:"rachunki"   },
      bill:    { ...EMPTY, type:"bill",    color:"#f59e0b", cat:"rachunki"   },
      sub:     { ...EMPTY, type:"sub",     color:"#8b5cf6", cat:"rozrywka"   },
      savings: { ...EMPTY, type:"savings", color:"#10b981", cat:"inwestycje" },
    };
    setEditItem(null);
    setForm(defaults[type] || EMPTY);
    setSection(type);
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name, amount: String(Math.abs(item.amount)),
      cat: item.cat, acc: item.acc, color: item.color || "#3b82f6",
      type: item.type || "bill",
      freq: item.freq || "monthly",
      dueDay: item.dueDay || 1,
      dayOfWeek: item.dayOfWeek || 1,
      trackPaid: item.trackPaid !== false,
      shared: item.shared || false,
    });
    setModal(true);
  };

  const save = () => {
    if (!form.name || !form.amount) return;
    const item = {
      id:         editItem ? editItem.id : Date.now(),
      name:       form.name,
      amount:     -Math.abs(parseFloat(form.amount)),
      cat:        form.cat,
      acc:        parseInt(form.acc),
      color:      form.color,
      type:       form.type,
      freq:       form.freq,
      dueDay:     parseInt(form.dueDay) || 1,
      dayOfWeek:  parseInt(form.dayOfWeek) || 1,
      trackPaid:  form.trackPaid,
      shared:     form.shared || false,
      startMonth: form.freq === "bimonthly" ? (form.startMonth !== undefined ? form.startMonth : new Date().getMonth()) : 0,
    };
    if (editItem) { setPayments(p => p.map(x => x.id === editItem.id ? item : x)); showToast("Płatność zaktualizowana ✓"); }
    else          { setPayments(p => [...p, item]); showToast("Płatność dodana ✓"); }
    setModal(false);
  };

  const del = (id) => setPayments(p => p.filter(x => x.id !== id));

  // Check if a bimonthly item is due this month
  const isDueThisMonth = (item) => {
    if (item.freq !== "bimonthly") return true;
    const startM = item.startMonth || new Date().getMonth();
    return Math.abs(month - startM) % 2 === 0;
  };

  const isPaid = (item) => !!paid[`${item.id}_${monthKey}`];

  const triggerHaptic = hapticMedium;

  const togglePaid = (item) => {
    const key = `${item.id}_${monthKey}`;
    const nowPaid = !paid[key];
    triggerHaptic();
    setPaid(p => ({ ...p, [key]: nowPaid }));
    if (nowPaid) {
      // Use today if in current billing month, else use dueDay of that month
      // Never create a transaction with a future date
      const todayStr = new Date().toISOString().split("T")[0];
      const dueStr   = `${new Date().getFullYear()}-${String(month+1).padStart(2,"0")}-${String(item.dueDay||1).padStart(2,"0")}`;
      const date     = isCurrentMonth ? todayStr : (dueStr <= todayStr ? dueStr : todayStr);
      setTransactions(tx => [{ id: Date.now(), date, desc: item.name, amount: item.amount, cat: item.cat, acc: item.acc }, ...tx]);
    } else {
      setTransactions(tx => {
        const idx = tx.findIndex(t => t.desc === item.name && t.date.startsWith(monthKey) && t.amount === item.amount);
        return idx === -1 ? tx : [...tx.slice(0, idx), ...tx.slice(idx+1)];
      });
    }
  };

  const freqLabel = (item) => {
    if (item.freq === "daily")   return "Codziennie";
    if (item.freq === "weekly")  return `Co tydzień · ${DAYS_PL[(item.dayOfWeek-1)%7]}`;
    if (item.freq === "bimonthly") {
      const startM = item.startMonth || 0;
      let next = -1;
      for (let i = 1; i <= 12; i++) {
        const m = (month + i) % 12;
        if (Math.abs(m - startM) % 2 === 0) { next = m; break; }
      }
      return `Co 2 mies.${next >= 0 ? " · nast: " + MONTHS[next] : ""}`;
    }
    return `${item.dueDay}. każdego`;
  };

  const ItemCard = ({ item }) => {
    const p = isPaid(item);
    const isMonthly = item.freq === "monthly" || item.freq === "bimonthly";
    const overdue = !p && isMonthly && isCurrentMonth && isDueOverdue(item.dueDay||1);
    const soon    = !p && !overdue && isMonthly && isCurrentMonth && isDueSoon(item.dueDay||1);
    return (
      <div style={{
        background: p ? "#0a1410" : overdue ? "linear-gradient(135deg,#1a0808,#200e0e)" : "#0f1825",
        border: `1px solid ${p ? "#14532d33" : overdue ? "#7f1d1d" : soon ? "#78350f" : "#1a2744"}`,
        borderRadius: 14, padding: "13px 14px", opacity: p ? 0.65 : 1,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        {/* Zapłać button — większy, bardziej intuicyjny */}
        <button onClick={() => togglePaid(item)} style={{
          flexShrink: 0, cursor: "pointer",
          background: p ? "#052e16" : overdue ? "#2d0a0a" : "#0d1628",
          border: `1px solid ${p ? "#16a34a" : overdue ? "#ef444466" : "#1e3a5f"}`,
          borderRadius: 10, padding: "6px 10px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          minWidth: 58,
        }}>
          {p
            ? <><Check size={14} color="#10b981"/><span style={{ fontSize: 9, fontWeight: 700, color: "#10b981", fontFamily: "'Space Grotesk', sans-serif" }}>Zapłacono</span></>
            : <><Circle size={14} color={overdue ? "#ef4444" : "#334155"}/><span style={{ fontSize: 9, fontWeight: 700, color: overdue ? "#ef4444" : "#475569", fontFamily: "'Space Grotesk', sans-serif" }}>Opłać</span></>
          }
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: p ? "#64748b" : "#e2e8f0",
              textDecoration: p ? "line-through" : "none",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.name}</div>
            {item.shared && (
              <span style={{ fontSize: 9, fontWeight: 700, background: "#0a1e12",
                border: "1px solid #16a34a44", borderRadius: 5, padding: "1px 5px",
                color: "#10b981", flexShrink: 0 }}>👫 wspólne</span>
            )}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color:
            overdue ? "#ef4444" : soon ? "#f59e0b" : "#475569",
            display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span>{overdue ? "! Termin minal (" + item.dueDay + ".)" :
             soon    ? `Za ${Math.ceil((new Date(monthKey + "-" + String(item.dueDay||1).padStart(2,"0")) - TODAY_FULL) / 86400000)} dni` :
             freqLabel(item)}</span>
            {item.freq === "bimonthly" && (
              <span style={{ background: "#1e2d45", borderRadius: 5, padding: "1px 6px",
                fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>
                co 2 mies. · start: {MONTHS[item.startMonth || 0]}
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600,
            color: p ? "#1f5c34" : overdue ? "#ef4444" : item.color || "#e2e8f0" }}>
            {fmt(Math.abs(item.amount))}
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 5, justifyContent: "flex-end" }}>
            <button onClick={() => openEdit(item)} style={{
              background: "#0d1628", border: "1px solid #1a2744", borderRadius: 6,
              padding: "3px 8px", cursor: "pointer", color: "#60a5fa", fontSize: 10 }}>Edytuj</button>
            <button onClick={() => del(item.id)} style={{
              background: "none", border: "none", cursor: "pointer", color: "#334155" }}>
              <Trash2 size={11}/></button>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ type, label, emoji, color, items }) => {
    const dueItems = items.filter(isDueThisMonth);
    const total = dueItems.reduce((s, x) => s + Math.abs(x.amount), 0);
    const paidAmt = dueItems.filter(isPaid).reduce((s, x) => s + Math.abs(x.amount), 0);
    const pct = total > 0 ? (paidAmt / total * 100) : 0;
    return (
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 16 }}>{emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color }}>{fmt(total)}</span>
            <button onClick={() => openAdd(type)} style={{
              background: color+"22", border: `1px solid ${color}44`, borderRadius: 8,
              padding: "3px 8px", cursor: "pointer", color, fontSize: 11, fontWeight: 700 }}>+ Dodaj</button>
          </div>
        </div>
        {dueItems.length === 0 && items.length === 0 ? (
          <div style={{ background: "#060b14", borderRadius: 12, padding: "12px 16px",
            fontSize: 12, color: "#334155", textAlign: "center" }}>
            Brak — kliknij + Dodaj
          </div>
        ) : dueItems.length === 0 ? (
          <div style={{ background: "#060b14", borderRadius: 12, padding: "12px 16px",
            fontSize: 12, color: "#334155", textAlign: "center" }}>
            Brak płatności w tym miesiącu
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dueItems.sort((a,b) => (a.dueDay||1)-(b.dueDay||1)).map(item => <ItemCard key={item.id} item={item}/>)}
            </div>
            {items.length > 1 && (
              <div style={{ marginTop: 8, background: "#060b14", borderRadius: 8, height: 5, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 8, transition: "width 0.6s" }}/>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Only show bimonthly payments in their active months
  const isActiveThisMonth = (p) => {
    if (p.freq !== "bimonthly") return true;
    // startMonth is always 0-based (0=Jan, 2=Mar etc)
    const startM = p.startMonth || new Date().getMonth();
    return Math.abs(month - startM) % 2 === 0;
  };

  const activeFilter = (p) => showAll || isActiveThisMonth(p);
  const credits  = payments.filter(p => p.type === "credit"  && activeFilter(p));
  const bills    = payments.filter(p => p.type === "bill"     && activeFilter(p));
  const subs     = payments.filter(p => p.type === "sub"      && activeFilter(p));
  const savings  = payments.filter(p => p.type === "savings"  && activeFilter(p));

  const allItems    = [...credits, ...bills, ...subs, ...savings];
  const allMthTotal = allItems.reduce((s, x) => s + Math.abs(x.amount), 0);
  const allMthPaid  = allItems.filter(isPaid).reduce((s, x) => s + Math.abs(x.amount), 0);
  const totalPct    = allMthTotal > 0 ? (allMthPaid / allMthTotal * 100) : 0;

  const FREQ_LABELS = { monthly: "Miesięcznie", bimonthly: "Co 2 miesiące", weekly: "Tygodniowo", daily: "Codziennie" };

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Header summary + month nav */}
      <div style={{ paddingTop: 8, paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <button onClick={() => setLocalMonth(m => Math.max(0, m-1))}
            style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#94a3b8" }}>
            <ChevronLeft size={14}/>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Płatności</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isCurrentMonth ? "#e2e8f0" : "#60a5fa", marginTop: 2 }}>
              {MONTH_NAMES[month]} {new Date().getFullYear()} {isCurrentMonth && <span style={{ fontSize: 10, color: "#10b981" }}>● teraz</span>}
            </div>
          </div>
          <button onClick={() => setLocalMonth(m => Math.min(currentRealMonth, m+1))}
            style={{ background: "#1a2744", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#94a3b8" }}>
            <ChevronRight size={14}/>
          </button>
        </div>
        {/* Show all toggle */}
        <button onClick={() => setShowAll(s => !s)} style={{
          width: "100%", marginBottom: 6,
          background: showAll ? "#1e3a5f" : "transparent",
          border: `1px solid ${showAll ? "#2563eb" : "#1a2744"}`,
          borderRadius: 8, padding: "7px 0", cursor: "pointer",
          color: showAll ? "#60a5fa" : "#334155", fontSize: 12, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {showAll ? "👁 Wszystkie płatności (edycja/usuwanie)" : "Pokaż tylko aktywne w tym miesiącu"}
        </button>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, textAlign: "center" }}>
          <span style={{ color: "#10b981" }}>{fmt(allMthPaid)}</span>
          <span style={{ color: "#334155", fontSize: 14 }}> / {fmt(allMthTotal)}</span>
        </div>
        <div style={{ background: "#1a2744", borderRadius: 6, height: 4, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${totalPct}%`, height: "100%",
            background: totalPct >= 100 ? "#10b981" : "linear-gradient(90deg,#d97706,#f59e0b)",
            transition: "width 0.6s" }}/>
        </div>
      </div>

      <Section type="credit"  label="Zobowiązania"           emoji="🏦" color="#3b82f6" items={credits}/>
      <Section type="bill"    label="Rachunki"                emoji="📄" color="#f59e0b" items={bills}/>
      <Section type="sub"     label="Subskrypcje"             emoji="🔄" color="#8b5cf6" items={subs}/>
      <Section type="savings" label="Cele oszczędnościowe"    emoji="💰" color="#10b981" items={savings}/>

      {/* Nieaktywne w tym miesi cu   co 2 miesi ce */}
      {(() => {
        const inactive = payments.filter(p => p.freq === "bimonthly" && !isActiveThisMonth(p));
        if (inactive.length === 0) return null;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#334155",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 6 }}>
              📅 Co 2 miesiące (nie w tym miesiącu)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inactive.map(item => (
                <div key={item.id} style={{ background: "#060b14", border: "1px solid #1a2744",
                  borderRadius: 12, padding: "12px 14px", opacity: 0.5,
                  display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
                      {freqLabel(item)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#334155" }}>
                      {fmt(Math.abs(item.amount))}
                    </span>
                    <button onClick={() => openEdit(item)} style={{
                      background: "#0d1628", border: "1px solid #1a2744", borderRadius: 6,
                      padding: "3px 8px", cursor: "pointer", color: "#60a5fa", fontSize: 10 }}>Edytuj</button>
                    <button onClick={() => del(item.id)} style={{
                      background: "none", border: "none", cursor: "pointer", color: "#334155" }}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {totalPct >= 100 && payments.length > 0 && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ fontSize: 28 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#10b981", marginTop: 6 }}>Wszystko opłacone!</div>
        </div>
      )}


      {/* Modal */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
      <Modal open={modal} onClose={() => { setModal(false); setEditItem(null); }}
             title={editItem ? "Edytuj" : form.type === "credit" ? "Nowe zobowiązanie" : form.type === "sub" ? "Nowa subskrypcja" : form.type === "savings" ? "Nowy cel oszczędnościowy" : "Nowy rachunek"}>

        {/* Type tabs in modal */}
        {!editItem && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[["credit","🏦 Zobowiązanie"],["bill","📄 Rachunek"],["sub","🔄 Subskrypcja"],["savings","💰 Oszczędności"]].map(([t,l]) => (
              <button key={t} onClick={() => setForm(f => ({...f, type: t}))}
                style={{ flex: 1, background: form.type === t ? "#1e3a5f" : "#060b14",
                  border: `1px solid ${form.type === t ? "#2563eb" : "#1a2744"}`,
                  color: form.type === t ? "#60a5fa" : "#475569",
                  borderRadius: 8, padding: "7px 4px", cursor: "pointer",
                  fontWeight: 700, fontSize: 11, fontFamily: "'Space Grotesk', sans-serif" }}>{l}</button>
            ))}
          </div>
        )}

        <Input label="Nazwa" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder={
          form.type === "credit" ? "np. Kredyt hipoteczny" :
          form.type === "sub"    ? "np. Netflix" : "np. Prąd"}/>
        <Input label="Kwota miesięczna (zł)" type="number" value={form.amount}
          onChange={e => setForm(f => ({...f, amount: e.target.value}))} placeholder="0.00"/>

        <Select label="Kategoria" value={form.cat} onChange={e => setForm(f => ({...f, cat: e.target.value}))}>
          {CATEGORIES.filter(c => !["przychód","inne"].includes(c.id)).map(c =>
            <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>

        <Select label="Konto" value={form.acc} onChange={e => setForm(f => ({...f, acc: e.target.value}))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>

        <Select label="Częstotliwość" value={form.freq} onChange={e => setForm(f => ({...f, freq: e.target.value}))}>
          <option value="daily">Codziennie</option>
          <option value="weekly">Tygodniowo</option>
          <option value="monthly">Miesięcznie</option>
          <option value="bimonthly">Co 2 miesiące</option>
        </Select>

        {form.freq === "weekly" && (
          <Select label="Dzień tygodnia" value={form.dayOfWeek} onChange={e => setForm(f => ({...f, dayOfWeek: e.target.value}))}>
            {["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"].map((d,i) =>
              <option key={i+1} value={i+1}>{d}</option>)}
          </Select>
        )}
        {(form.freq === "monthly" || form.freq === "bimonthly") && (
          <Input label="Dzień miesiąca (termin)" type="number" min="1" max="31"
            value={form.dueDay} onChange={e => setForm(f => ({...f, dueDay: e.target.value}))}/>
        )}
        {form.freq === "bimonthly" && (
          <Select label="Pierwszy miesiąc płatności" value={form.startMonth || new Date().getMonth()}
            onChange={e => setForm(f => ({...f, startMonth: parseInt(e.target.value)}))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i}>{m} {new Date().getFullYear()} (potem co 2 miesiące)</option>
            ))}
          </Select>
        )}

        {/* Track paid toggle */}
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "12px 14px" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>🔔 Przypomnienie o płatności</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Pokaż w powiadomieniach i daj możliwość odznaczenia jako zapłacone</div>
          </div>
          <button onClick={() => setForm(f => ({...f, trackPaid: !f.trackPaid}))} style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: form.trackPaid ? "#10b981" : "#1a2744", position: "relative", transition: "background 0.2s",
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "white", position: "absolute",
              top: 3, left: form.trackPaid ? 23 : 3, transition: "left 0.2s" }}/>
          </button>
        </div>

        {/* Shared with partner toggle */}
        <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between",
          background: form.shared ? "#0d1e12" : "#060b14",
          border: `1px solid ${form.shared ? "#16a34a44" : "#1a2744"}`,
          borderRadius: 10, padding: "12px 14px" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{`👫 Wspólne z ${partnerName}`}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{`Liczy się do rozliczenia z ${partnerName}`}</div>
          </div>
          <button onClick={() => setForm(f => ({...f, shared: !f.shared}))} style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: form.shared ? "#10b981" : "#1a2744", position: "relative", transition: "background 0.2s",
          }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "white", position: "absolute",
              top: 3, left: form.shared ? 23 : 3, transition: "left 0.2s" }}/>
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Kolor</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["#3b82f6","#f59e0b","#8b5cf6","#10b981","#ef4444","#06b6d4","#ec4899","#f97316"].map(c => (
              <div key={c} onClick={() => setForm(f => ({...f, color: c}))}
                style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                  border: form.color === c ? "2px solid white" : "2px solid transparent" }}/>
            ))}
          </div>
        </div>

        <button onClick={save} style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#3b82f6)",
          border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15,
          cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          {editItem ? "Zapisz zmiany" : "Dodaj"}
        </button>
      </Modal>
    </div>
  );
};


//    ANALYTICS VIEW                                                              

export { PaymentsView };

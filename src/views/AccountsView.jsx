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
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel, buildHistData } from "../utils.js";
import { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats, INITIAL_TEMPLATES } from "../constants.js";
function AccountsView({ accounts, setAccounts }) {
  const { toast, showToast } = useToast();
  const [modal, setModal] = useState(false);
  const [editAcc, setEditAcc] = useState(null); // account being edited
  const [form, setForm] = useState({ name: "", bank: "", balance: "", type: "checking", color: "#3b82f6" });

  const ACC_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899","#f97316"];
  const nextColor = () => ACC_COLORS[accounts.length % ACC_COLORS.length];
  const openAdd  = () => { setEditAcc(null); setForm({ name: "", bank: "", balance: "", type: "checking", color: nextColor(), currency: "PLN" }); setModal(true); };
  const openEdit = (acc) => { setEditAcc(acc); setForm({ name: acc.name, bank: acc.bank, balance: String(acc.balance), type: acc.type, color: acc.color, currency: acc.currency || "PLN" }); setModal(true); };

  const saveAccount = () => {
    if (!form.name || form.balance === "") return;
    if (editAcc) {
      setAccounts(a => a.map(x => x.id === editAcc.id ? { ...x, ...form, balance: isFinite(parseFloat(String(form.balance).replace(",", "."))) ? parseFloat(String(form.balance).replace(",", ".")) : 0, currency: form.currency || "PLN" } : x));
      showToast("Konto zaktualizowane ✓");
    } else {
      setAccounts(a => [...a, { id: Date.now(), ...form, balance: isFinite(parseFloat(String(form.balance).replace(",", "."))) ? parseFloat(String(form.balance).replace(",", ".")) : 0, iban: "", currency: form.currency || "PLN" }]);
      showToast("Konto dodane ✓");
    }
    setModal(false);
  };

  const deleteAcc = (id) => {
    setAccounts(a => a.filter(x => x.id !== id)); showToast("Konto usunięte", "error");
  };

  const typeLabel = { checking: "Rachunek", savings: "Oszczędności", invest: "Inwestycje" };
  const total     = accounts.reduce((s, a) => s + a.balance, 0);
  const biezace   = accounts.filter(a => a.type === "checking");
  const oszcz     = accounts.filter(a => a.type === "savings");
  const inwest    = accounts.filter(a => a.type === "invest");
  const oszczInw  = accounts.filter(a => a.type !== "checking");
  const totalBiezace  = biezace.reduce((s, a) => s + a.balance, 0);
  const totalOszcz    = oszcz.reduce((s, a) => s + a.balance, 0);
  const totalInwest   = inwest.reduce((s, a) => s + a.balance, 0);
  const totalOszczInw = oszczInw.reduce((s, a) => s + a.balance, 0);

  const AccCard = ({ acc }) => {
    const pct = total > 0 ? ((acc.balance / total) * 100).toFixed(1) : "0.0";
    return (
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: acc.color + "22",
              border: `1px solid ${acc.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {acc.type === "invest"  ? <TrendingUp size={17} color={acc.color}/> :
               acc.type === "savings" ? <PiggyBank  size={17} color={acc.color}/> :
               <CreditCard size={17} color={acc.color}/>}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{acc.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                {acc.bank} · <Badge color={acc.color}>{typeLabel[acc.type]}</Badge>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 600, color: acc.color }}>{fmt(acc.balance)}</div>
              {acc.balance === 0 && (
                <span style={{ fontSize: 10, color: "#f59e0b", background: "#78350f22",
                  border: "1px solid #78350f44", borderRadius: 5, padding: "1px 6px", fontWeight: 700 }}>
                  Ustaw saldo →
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{pct}% majątku</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => openEdit(acc)} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: "#60a5fa", fontSize: 11 }}>Edytuj</button>
              <button onClick={() => deleteAcc(acc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#334155" }}><Trash2 size={11}/></button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ background: "#060b14", borderRadius: 5, height: 4 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: acc.color, borderRadius: 5, opacity: 0.7 }}/>
          </div>
        </div>
        {acc.iban && <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#334155", letterSpacing: "0.04em" }}>{acc.iban}</div>}
      </Card>
    );
  };

  const SectionHeader = ({ label, total, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color }}>{fmt(total)}</div>
    </div>
  );

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>

      {/* Header z przyciskiem dodawania */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Moje konta</div>
        <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#1e40af,#3b82f6)", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <PlusCircle size={14}/> Nowe konto
        </button>
      </div>

      {/* Konta bie  ce   tylko je li istniej  */}
      {biezace.length > 0 && <>
        <SectionHeader label="💳 Konta bieżące" total={totalBiezace} color="#3b82f6"/>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {biezace.map(acc => <AccCard key={acc.id} acc={acc}/>)}
        </div>
      </>}

      {/* Konta oszcz dno ciowe */}
      {oszcz.length > 0 && <>
        <SectionHeader label="🏦 Oszczędności" total={totalOszcz} color="#06b6d4"/>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {oszcz.map(acc => <AccCard key={acc.id} acc={acc}/>)}
        </div>
      </>}

      {/* Inwestycje */}
      {inwest.length > 0 && <>
        <SectionHeader label="📈 Inwestycje" total={totalInwest} color="#8b5cf6"/>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {inwest.map(acc => <AccCard key={acc.id} acc={acc}/>)}
        </div>
      </>}

      {/* Add / Edit modal */}
      <Modal open={modal} onClose={() => { setModal(false); setEditAcc(null); }} title={editAcc ? "Edytuj konto" : "Nowe konto"}>
        <Input label="Nazwa konta" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="np. Konto osobiste"/>
        <Input label="Bank" value={form.bank} onChange={e => setForm(f => ({...f, bank: e.target.value}))} placeholder="np. PKO BP"/>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Waluta</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["PLN","EUR","USD","GBP","CHF","CZK"].map(c => (
              <button key={c} onClick={() => setForm(f => ({...f, currency: c}))} style={{
                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${form.currency === c ? "#2563eb" : "#1a2744"}`,
                background: form.currency === c ? "#1e3a5f" : "#060b14",
                color: form.currency === c ? "#60a5fa" : "#475569",
                fontWeight: 600, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif",
              }}>{c}</button>
            ))}
          </div>
        </div>
        <Input label="Saldo (zł)" type="number" value={form.balance} onChange={e => setForm(f => ({...f, balance: e.target.value}))} placeholder="0.00"/>
        <Select label="Typ konta" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
          <option value="checking">Rachunek bieżący</option>
          <option value="savings">Oszczędności</option>
          <option value="invest">Inwestycje</option>
        </Select>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Kolor</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899"].map(c => (
              <div key={c} onClick={() => setForm(f => ({...f, color: c}))} style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer", border: form.color === c ? "2px solid white" : "2px solid transparent" }}/>
            ))}
          </div>
        </div>
        <button onClick={saveAccount} style={{ width: "100%", background: "linear-gradient(135deg, #1e40af, #3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          {editAcc ? "Zapisz zmiany" : "Dodaj konto"}
        </button>
      </Modal>
    </div>
  );
};


export { AccountsView };

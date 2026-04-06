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
import { useToast } from "../hooks/useToast.js";
const InvestmentsView = ({ portfolio, setPortfolio }) => {
  const ACCOUNT_TYPES = ["Zwykłe", "IKZE", "IKE", "PPK"];
  const COLORS = ["#8b5cf6","#f59e0b","#10b981","#3b82f6","#ef4444","#06b6d4","#ec4899","#a3e635"];
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ticker:"", name:"", qty:"", avgPrice:"", currentPrice:"", account:"Zwykłe", currency:"PLN" });

  const openAdd  = () => { setEditItem(null); setForm({ ticker:"", name:"", qty:"", avgPrice:"", currentPrice:"", account:"Zwykłe", currency:"PLN" }); setModal(true); };
  const openEdit = (p) => { setEditItem(p); setForm({ ticker:p.ticker, name:p.name, qty:String(p.qty), avgPrice:String(p.avgPrice), currentPrice:String(p.currentPrice), account:p.account, currency:p.currency||"PLN" }); setModal(true); };

  const save = () => {
    if (!form.ticker || !form.currentPrice) return;
    const qty   = parseFloat(form.qty) || 0;
    const avg   = parseFloat(form.avgPrice) || 0;
    const cur   = parseFloat(form.currentPrice) || 0;
    const val   = qty * cur;
    const pnl   = qty * (cur - avg);
    const pnlPct = avg > 0 ? ((cur - avg) / avg * 100) : 0;
    const item  = { id: editItem ? editItem.id : Date.now(), ticker: form.ticker.toUpperCase(), name: form.name, qty, avgPrice: avg, currentPrice: cur, valuePLN: val, pnlPLN: pnl, pnlPct, account: form.account, currency: form.currency };
    if (editItem) setPortfolio(p => p.map(x => x.id === editItem.id ? item : x));
    else          setPortfolio(p => [...p, item]);
    setModal(false);
  };

  const remove = (id) => setPortfolio(p => p.filter(x => x.id !== id));

  const totalValue = portfolio.reduce((s, p) => s + p.valuePLN, 0);
  const totalPnL   = portfolio.reduce((s, p) => s + p.pnlPLN, 0);
  const totalInv   = totalValue - totalPnL;
  const totalPct   = totalInv > 0 ? (totalPnL / totalInv * 100) : 0;

  const byAccount = ACCOUNT_TYPES.map(acc => ({
    acc,
    items: portfolio.filter(p => p.account === acc),
    val:   portfolio.filter(p => p.account === acc).reduce((s,p) => s+p.valuePLN, 0),
    pnl:   portfolio.filter(p => p.account === acc).reduce((s,p) => s+p.pnlPLN, 0),
  })).filter(g => g.items.length > 0);

  const colorFor = (ticker) => COLORS[portfolio.findIndex(p => p.ticker === ticker) % COLORS.length];

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 8, paddingBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Portfel inwestycyjny</div>
          {portfolio.length > 0 ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 26, fontWeight: 500 }}>{fmt(totalValue)}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: totalPnL >= 0 ? "#10b981" : "#ef4444" }}>
                {totalPnL >= 0 ? "+" : ""}{fmt(totalPnL)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#334155", marginTop: 4 }}>Brak pozycji</div>
          )}
        </div>
        <button onClick={openAdd} style={{ background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none", borderRadius: 10, padding: "8px 14px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          + Dodaj
        </button>
      </div>

      {portfolio.length === 0 && (
        <Card style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Dodaj swoje inwestycje</div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>ETF-y, akcje, kryptowaluty — wszystko w jednym miejscu. Śledź zyski i alokację portfela.</div>
          <button onClick={openAdd} style={{ marginTop: 16, background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
            Dodaj pierwszą pozycję
          </button>
        </Card>
      )}

      {portfolio.length > 0 && (
        <>
          {/* Alokacja pie */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Alokacja</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <PieChart width={110} height={110}>
                <Pie data={portfolio.map(p => ({ name: p.ticker, value: p.valuePLN }))} cx={50} cy={50} innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={2} stroke="#060b14">
                  {portfolio.map((p) => <Cell key={p.ticker} fill={colorFor(p.ticker)}/>)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {portfolio.map(p => (
                  <div key={p.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: colorFor(p.ticker) }}/>
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#94a3b8" }}>{p.ticker}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{totalValue > 0 ? (p.valuePLN / totalValue * 100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Konta summary */}
          {byAccount.length > 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {byAccount.map(({ acc, val, pnl }, i) => (
                <Card key={acc} style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{acc}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600, color: COLORS[i % COLORS.length] }}>{fmt(val)}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: pnl >= 0 ? "#10b981" : "#ef4444", marginTop: 3 }}>
                    {pnl >= 0 ? "+" : ""}{fmt(pnl)}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Positions by account */}
          {byAccount.map(({ acc, items, val }, gi) => (
            <div key={acc}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS[gi % COLORS.length], marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {acc} · {fmt(val)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {items.map(p => (
                  <Card key={p.id} style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: colorFor(p.ticker), background: colorFor(p.ticker) + "22", borderRadius: 5, padding: "1px 7px", fontFamily: "'DM Mono', monospace" }}>{p.ticker}</span>
                          <span style={{ fontSize: 10, background: "#1e3a5f33", color: "#60a5fa", border: "1px solid #2563eb44", borderRadius: 5, padding: "1px 6px", fontWeight: 700 }}>{p.account}</span>
                        </div>
                        {p.name && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>{p.name}</div>}
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#334155" }}>
                          {p.qty} szt. · avg {p.avgPrice.toFixed(2)} {p.currency}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600 }}>{fmt(p.valuePLN)}</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: p.pnlPLN >= 0 ? "#10b981" : "#ef4444", marginTop: 3 }}>
                          {p.pnlPLN >= 0 ? "+" : ""}{fmt(p.pnlPLN)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%)
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                          <button onClick={() => openEdit(p)} style={{ background: "#1e3a5f", border: "none", borderRadius: 6, padding: "4px 8px", color: "#60a5fa", cursor: "pointer", fontSize: 11 }}>Edytuj</button>
                          <button onClick={() => remove(p.id)} style={{ background: "#1a0808", border: "none", borderRadius: 6, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>Usuń</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Modal dodaj/edytuj */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#0a1120", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{editItem ? "Edytuj pozycję" : "Nowa pozycja"}</span>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}><X size={20}/></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label="Ticker / Symbol (np. IWDA, NVDA)" value={form.ticker} onChange={e => setForm(f => ({...f, ticker: e.target.value}))} placeholder="np. IWDA.AS"/>
              <Input label="Nazwa (opcjonalnie)" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="np. iShares MSCI World"/>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Ilość (szt.)" type="number" value={form.qty} onChange={e => setForm(f => ({...f, qty: e.target.value}))} placeholder="0"/>
                <Input label="Waluta" value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))} placeholder="PLN"/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label="Śr. cena zakupu" type="number" value={form.avgPrice} onChange={e => setForm(f => ({...f, avgPrice: e.target.value}))} placeholder="0.00"/>
                <Input label="Aktualna cena" type="number" value={form.currentPrice} onChange={e => setForm(f => ({...f, currentPrice: e.target.value}))} placeholder="0.00"/>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Konto</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ACCOUNT_TYPES.map(t => (
                    <button key={t} onClick={() => setForm(f => ({...f, account: t}))} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${form.account === t ? "#2563eb" : "#1a2744"}`, background: form.account === t ? "#1e3a5f" : "#060b14", color: form.account === t ? "#60a5fa" : "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t}</button>
                  ))}
                </div>
              </div>
              {form.qty && form.currentPrice && (
                <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 14px", border: "1px solid #1a2744" }}>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Podgląd</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600 }}>{fmt(parseFloat(form.qty||0) * parseFloat(form.currentPrice||0))}</div>
                  {form.avgPrice && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: parseFloat(form.currentPrice) >= parseFloat(form.avgPrice) ? "#10b981" : "#ef4444", marginTop: 3 }}>
                    {parseFloat(form.currentPrice) >= parseFloat(form.avgPrice) ? "+" : ""}{fmt(parseFloat(form.qty||0) * (parseFloat(form.currentPrice||0) - parseFloat(form.avgPrice||0)))}
                  </div>}
                </div>
              )}
              <button onClick={save} style={{ width: "100%", background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none", borderRadius: 12, padding: "13px 0", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
                {editItem ? "Zapisz zmiany" : "Dodaj pozycję"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export { InvestmentsView };

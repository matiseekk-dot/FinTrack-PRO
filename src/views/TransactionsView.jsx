import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
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
function TransactionsView({ transactions, setTransactions, accounts, setAccounts, allCats, _forceOpenModal, _onClose, _onModalClose, defaultAcc = 1 }) {
  const { toast, showToast } = useToast();
  const { success: hapticSuccess, error: hapticError } = useHaptic();
  const [swipedId, setSwipedId] = useState(null); // id of swiped transaction
  const [modal, setModal] = useState(_forceOpenModal || false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], desc: "", amount: "", cat: "jedzenie", acc: defaultAcc, toAcc: defaultAcc === 1 ? 2 : 1, type: "expense", currency: "PLN" });

  const addTx = () => {
    if (!form.desc || !form.amount) return;
    const incomeCategories = ["przychód","sprzedaż","dodatkowe","bukmacherka"];
    const finalCat = form.type === "income"
      ? (incomeCategories.includes(form.cat) ? form.cat : "przychód")
      : form.cat;
    const RATES = { EUR: 4.28, USD: 3.92, GBP: 5.02, CZK: 0.172, HUF: 0.011, PLN: 1 };
    const rate   = RATES[form.currency] || 1;
    const rawAmt = Math.abs(parseFloat(form.amount)) * rate;

    // Internal transfer: create two transactions
    if (form.type === "transfer" && form.toAcc && parseInt(form.toAcc) !== parseInt(form.acc)) {
      const fromId = parseInt(form.acc);
      const toId   = parseInt(form.toAcc);
      const txOut  = { id: Date.now(),     date: form.date, desc: `Przelew → ${(accounts.find(a=>a.id===toId)||{name:toId}).name}`, amount: -rawAmt, cat: "inne", acc: fromId };
      const txIn   = { id: Date.now()+1,   date: form.date, desc: `Przelew ← ${(accounts.find(a=>a.id===fromId)||{name:fromId}).name}`, amount: rawAmt,  cat: "inne", acc: toId  };
      setTransactions(tx => [txIn, txOut, ...tx]);
      if (setAccounts) {
        setAccounts(accs => accs.map(a => {
          if (a.id === fromId) return { ...a, balance: parseFloat((a.balance - rawAmt).toFixed(2)) };
          if (a.id === toId)   return { ...a, balance: parseFloat((a.balance + rawAmt).toFixed(2)) };
          return a;
        }));
      }
      setForm(f => ({ ...f }));
      setModal(false);
      if (_onModalClose) _onModalClose();
      return;
    }

    const amt    = form.type === "expense" ? -rawAmt : rawAmt;
    const txData = { date: form.date, desc: form.desc, amount: parseFloat(amt.toFixed(2)), cat: finalCat, acc: parseInt(form.acc) };
    if (editingId) {
      // reverse old tx on old account, apply new tx on new account
      const oldTx = transactions.find(t => t.id === editingId);
      if (oldTx && setAccounts) {
        setAccounts(accs => accs.map(a => {
          if (a.type === "invest") return a; // skip invest accounts
          if (a.id === oldTx.acc && a.id === txData.acc)
            return { ...a, balance: parseFloat((a.balance - oldTx.amount + txData.amount).toFixed(2)) };
          if (a.id === oldTx.acc)
            return { ...a, balance: parseFloat((a.balance - oldTx.amount).toFixed(2)) };
          if (a.id === txData.acc)
            return { ...a, balance: parseFloat((a.balance + txData.amount).toFixed(2)) };
          return a;
        }));
      }
      setTransactions(tx => tx.map(t => t.id === editingId ? { ...t, ...txData } : t));
      setEditingId(null);
      showToast("Transakcja zaktualizowana ✓");
      hapticSuccess();
    } else {
      // apply amount to linked account (only savings/checking, not invest)
      if (setAccounts) {
        setAccounts(accs => accs.map(a => {
          if (a.id !== txData.acc) return a;
          if (a.type === "invest") return a; // investment accounts managed separately
          return { ...a, balance: parseFloat((a.balance + txData.amount).toFixed(2)) };
        }));
      }
      setTransactions(tx => [{ id: Date.now(), ...txData }, ...tx]);
      showToast("Transakcja dodana ✓");
      hapticSuccess();
    }
    setForm(f => ({ ...f, currency: 'PLN' }));
    setModal(false);
    if (_onModalClose) _onModalClose();
  };

  const todayStr2 = new Date().toISOString().split("T")[0];
  const filtered = transactions
    .filter(t => t.date <= todayStr2) // nie pokazuj przyszlych transakcji
    .filter(t => filter === "all" ? true : filter === "income" ? t.amount > 0 : t.amount < 0)
    .filter(t => filterCat === "all" ? true : t.cat === filterCat)
    .filter(t => search === "" ? true :
      t.desc.toLowerCase().includes(search.toLowerCase()) ||
      getCat(t.cat).label.toLowerCase().includes(search.toLowerCase())
    );

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(t => { if (!g[t.date]) g[t.date] = []; g[t.date].push(t); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      {/* Quick templates */}
      <div style={{ overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 8, paddingTop: 8,
        scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <div style={{ display: "inline-flex", gap: 6, paddingLeft: 0 }}>
          {((() => { try { const s = JSON.parse(localStorage.getItem("ft_templates") || JSON.stringify(INITIAL_TEMPLATES)); return s.map(t => ({...t, desc: t.desc === "Zhabka" ? "Zabka" : t.desc})); } catch(_) { return INITIAL_TEMPLATES; } })()).map(tpl => (
            <button key={tpl.id} onClick={() => {
              const cat = getCat(tpl.cat);
              setForm({ date: new Date().toISOString().split("T")[0], desc: tpl.desc,
                amount: String(tpl.amount), cat: tpl.cat, acc: tpl.acc || 1,
                toAcc: 2, type: "expense", currency: "PLN" });
              setModal(true);
            }} style={{
              background: getCat(tpl.cat).color + "22",
              border: `1px solid ${getCat(tpl.cat).color}44`,
              borderRadius: 20, padding: "6px 12px", cursor: "pointer",
              color: getCat(tpl.cat).color, fontSize: 12, fontWeight: 600,
              whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5,
              flexShrink: 0,
            }}>
              {tpl.desc} <span style={{ opacity: 0.7 }}>{tpl.amount} zl</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 4, paddingBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all","Wszystkie"],["income","Przychody"],["expense","Wydatki"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? "#1e3a5f" : "#0d1628", border: `1px solid ${filter === v ? "#2563eb" : "#1a2744"}`, color: filter === v ? "#60a5fa" : "#64748b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowSearch(s => !s)} style={{ background: showSearch ? "#1e3a5f" : "#0d1628", border: `1px solid ${showSearch ? "#2563eb" : "#1a2744"}`, color: showSearch ? "#60a5fa" : "#64748b", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
              🔍
            </button>
            <button onClick={() => setModal(true)} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
              <PlusCircle size={13}/> Dodaj
            </button>
          </div>
        </div>

        {showSearch && (
          <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj opisu, tagu, kategorii…"
              style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 16, fontFamily: "'Space Grotesk', sans-serif", outline: "none", boxSizing: "border-box", WebkitAppearance: "none" }}
            />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              <button onClick={() => setFilterCat("all")} style={{ background: filterCat === "all" ? "#1e3a5f" : "#0d1628", border: `1px solid ${filterCat === "all" ? "#2563eb" : "#1a2744"}`, color: filterCat === "all" ? "#60a5fa" : "#64748b", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                Wszystkie
              </button>
              {(allCats||CATEGORIES).map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)} style={{ background: filterCat === c.id ? c.color+"33" : "#0d1628", border: `1px solid ${filterCat === c.id ? c.color : "#1a2744"}`, color: filterCat === c.id ? c.color : "#64748b", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(search || filterCat !== "all") && (
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
            Znaleziono: <span style={{ color: "#60a5fa", fontWeight: 700 }}>{filtered.length}</span> transakcji
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
              {search || filterCat !== "all" ? "Brak wyników" : "Brak transakcji"}
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
              {search || filterCat !== "all"
                ? "Spróbuj zmienić filtry wyszukiwania"
                : "Dodaj pierwszą transakcję używając przycisku poniżej lub szablonu powyżej"}
            </div>
            {!search && filterCat === "all" && (
              <button onClick={() => setModal(true)} style={{
                background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "none",
                borderRadius: 12, padding: "12px 24px", color: "white",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>+ Dodaj transakcję</button>
            )}
          </div>
        )}
        {grouped.map(([date, txs]) => (
          <div key={date}>
            {(() => {
              const dayTotal = txs.filter(t => t.cat !== "inne").reduce((s,t) => s + t.amount, 0);
              const dayExp   = txs.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(t.amount), 0);
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{date}</div>
                  {dayExp > 0 && (
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700,
                      color: dayTotal >= 0 ? "#10b981" : "#ef4444" }}>
                      {dayTotal >= 0 ? "+" : "−"}{fmt(Math.abs(dayTotal))}
                    </div>
                  )}
                </div>
              );
            })()}
            <Card style={{ padding: "4px 16px" }}>
              {txs.map((tx, i) => {
                const cat = getCat(tx.cat);
                const Icon = cat.icon;
                const acc = accounts.find(a => a.id === tx.acc);
                return (
                  <div key={tx.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                      borderBottom: i < txs.length-1 ? "1px solid #0f1a2e" : "none",
                      position: "relative", overflow: "hidden",
                      transform: swipedId === tx.id ? "translateX(-72px)" : "translateX(0)",
                      transition: "transform 0.25s ease",
                    }}
                    onTouchStart={e => { e.currentTarget._swipeX = e.touches[0].clientX; }}
                    onTouchEnd={e => {
                      const dx = e.changedTouches[0].clientX - (e.currentTarget._swipeX || 0);
                      if (dx < -50) { setSwipedId(tx.id); hapticError(); }
                      else if (dx > 30) setSwipedId(null);
                    }}
                  >
                    {/* Icon */}
                    <div style={{ background: cat.color+"1a", borderRadius: 10, padding: 8, flexShrink: 0 }}>
                      <Icon size={14} color={cat.color}/>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                        <span>{cat.label}</span>
                        {acc && <><span>·</span><span style={{ color: acc.color }}>{acc.name}</span></>}
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600,
                      color: tx.amount > 0 ? "#10b981" : "#ef4444", flexShrink: 0 }}>
                      {tx.amount > 0 ? "+" : "−"}{fmt(Math.abs(tx.amount))}
                    </div>

                    {/* Swipe delete reveal */}
                    {swipedId === tx.id && (
                      <button
                        onClick={() => {
                          setAccounts(accs => accs.map(a =>
                            a.id === tx.acc && a.type !== "invest"
                              ? { ...a, balance: parseFloat((a.balance - tx.amount).toFixed(2)) } : a
                          ));
                          setTransactions(t => t.filter(x => x.id !== tx.id));
                          setSwipedId(null);
                          showToast(`Usunięto: ${tx.desc}`, "error", 3000);
                          hapticError();
                        }}
                        style={{
                          position: "absolute", right: -72, top: 0, bottom: 0, width: 64,
                          background: "#7f1d1d", border: "none", cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center",
                          justifyContent: "center", gap: 2, borderRadius: "0 8px 8px 0",
                        }}>
                        <span style={{ fontSize: 16 }}>🗑</span>
                        <span style={{ fontSize: 9, color: "#fca5a5", fontWeight: 700 }}>Usuń</span>
                      </button>
                    )}

                    {/* Action buttons   always visible */}
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setForm({ date: new Date().toISOString().split("T")[0], desc: tx.desc,
                            amount: String(Math.abs(tx.amount)), cat: tx.cat, acc: tx.acc,
                            type: tx.amount > 0 ? "income" : "expense" });
                          setModal(true);
                        }}
                        title="Kopiuj"
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#475569" }}>
                        <Copy size={12}/>
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(tx.id);
                          setForm({ date: tx.date, desc: tx.desc,
                            amount: String(Math.abs(tx.amount)), cat: tx.cat, acc: tx.acc,
                            type: tx.amount > 0 ? "income" : "expense", currency: "PLN" });
                          setModal(true);
                        }}
                        title="Edytuj"
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#60a5fa" }}>
                        <Edit2 size={12}/>
                      </button>
                      <button
                        onClick={() => {
                          const deletedTx = tx;
                          const deletedAccBefore = accounts.find(a => a.id === tx.acc);
                          // Remove transaction and reverse account balance
                          setAccounts(accs => accs.map(a =>
                            a.id === tx.acc && a.type !== "invest"
                              ? { ...a, balance: parseFloat((a.balance - tx.amount).toFixed(2)) }
                              : a
                          ));
                          setTransactions(t => t.filter(x => x.id !== tx.id));
                          // Undo toast — 4 seconds to reverse
                          showToast(`Usunięto: ${tx.desc} · Cofnij?`, "error", 4000);
                          const undoTimer = setTimeout(() => {}, 4000);
                          // Store undo ref on window for access in toast click (workaround)
                          window._lastDeletedTx = { tx: deletedTx, timer: undoTimer };
                        }}
                        title="Usuń"
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#f87171" }}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
      </div>

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
      <Modal open={modal} onClose={() => { setModal(false); setEditingId(null); }} title={editingId ? "Edytuj transakcję" : "Nowa transakcja"}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["expense","📤 Wydatek","#ef4444"],["income","📥 Przychód","#10b981"],["transfer","🔄 Przelew","#60a5fa"]].map(([v,l,c]) => (
            <button key={v} onClick={() => setForm(f => ({...f, type: v}))} style={{ flex: 1, background: form.type === v ? c + "22" : "#060b14", border: `1px solid ${form.type === v ? c : "#1a2744"}`, color: form.type === v ? c : "#64748b", borderRadius: 10, padding: 10, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" }}>
              {l}
            </button>
          ))}
        </div>
        {/* Description with autocomplete */}
        <div style={{ marginBottom: 14, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6,
            textTransform: "uppercase", letterSpacing: "0.08em" }}>Opis</div>
          <input
            value={form.desc}
            onChange={e => setForm(f => ({...f, desc: e.target.value}))}
            placeholder="np. Biedronka"
            autoComplete="off"
            style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
              borderRadius: 10, padding: "12px 14px", color: "#e2e8f0", fontSize: 16,
              fontFamily: "'Space Grotesk', sans-serif", outline: "none", WebkitAppearance: "none" }}
          />
          {/* Suggestions */}
          {form.desc.length >= 2 && (() => {
            const q = form.desc.toLowerCase();
            const seen = new Set();
            const suggestions = transactions
              .map(t => t.desc)
              .filter(d => {
                if (d.toLowerCase() === form.desc.toLowerCase()) return false;
                if (!d.toLowerCase().includes(q)) return false;
                if (seen.has(d)) return false;
                seen.add(d);
                return true;
              })
              .slice(0, 5);
            if (suggestions.length === 0) return null;
            return (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10,
                marginTop: 4, overflow: "hidden", boxShadow: "0 8px 24px #00000066" }}>
                {suggestions.map(s => {
                  // find last transaction with this desc to pre-fill cat & acc
                  const prev = transactions.find(t => t.desc === s);
                  return (
                    <button key={s} onClick={() => setForm(f => ({
                      ...f, desc: s,
                      cat: (prev ? prev.cat : null) || f.cat,
                      acc: (prev ? prev.acc : null) || f.acc,
                      type: prev ? (prev.amount > 0 ? "income" : "expense") : f.type,
                    }))} style={{
                      width: "100%", background: "none", border: "none",
                      borderBottom: "1px solid #0f1a2e", padding: "11px 14px",
                      cursor: "pointer", textAlign: "left", display: "flex",
                      alignItems: "center", justifyContent: "space-between",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1a2744"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: "#e2e8f0" }}>{s}</span>
                      {prev && <span style={{ fontSize: 11, color: "#475569" }}>{getCat(prev.cat).label}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {/* Amount + currency converter */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6,
            textTransform: "uppercase", letterSpacing: "0.08em" }}>Kwota</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={form.amount}
              onChange={e => setForm(f => ({...f, amount: e.target.value}))}
              placeholder="0.00"
              style={{ flex: 2, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10,
                padding: "12px 14px", color: "#e2e8f0", fontSize: 16,
                fontFamily: "'Space Grotesk', sans-serif", outline: "none", WebkitAppearance: "none" }}/>
            <select value={form.currency || "PLN"}
              onChange={e => setForm(f => ({...f, currency: e.target.value}))}
              style={{ flex: 1, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10,
                padding: "12px 10px", color: form.currency && form.currency !== "PLN" ? "#f59e0b" : "#e2e8f0",
                fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "'DM Mono', monospace" }}>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="CZK">CZK</option>
              <option value="HUF">HUF</option>
            </select>
          </div>
          {/* Currency conversion preview */}
          {form.currency && form.currency !== "PLN" && form.amount && (() => {
            const rates = { EUR: 4.28, USD: 3.92, GBP: 5.02, CZK: 0.172, HUF: 0.011 };
            const rate  = rates[form.currency] || 1;
            const pln   = (parseFloat(form.amount) * rate).toFixed(2);
            return (
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#475569" }}>
                  {form.amount} {form.currency} × {rate} =
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>
                  {pln} PLN
                </span>
              </div>
            );
          })()}
          {/* Rate note */}
          {form.currency && form.currency !== "PLN" && (
            <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>
              Kurs przybliżony · kwota zapisze się w PLN
            </div>
          )}
        </div>
        <Input label="Data" type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
        {form.type === "expense" && (
          <Select label="Kategoria" value={form.cat} onChange={e => setForm(f => ({...f, cat: e.target.value}))}>
            <option disabled>── Ważne</option>
            {(allCats||CATEGORIES).filter(c => c.group === "essential" && c.id !== "przychód").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option disabled>── Dodatkowe</option>
            {(allCats||CATEGORIES).filter(c => (c.group === "lifestyle" || !c.group) && c.id !== "przychód" && c.id !== "inne").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option disabled>── Inne</option>
            <option value="inne">Inne</option>
          </Select>
        )}
        <Select label={form.type === "transfer" ? "Z konta" : "Konto"} value={form.acc} onChange={e => setForm(f => ({...f, acc: e.target.value}))}>
          {[...accounts].sort((a,b) => {
            const order = { checking: 0, savings: 1, invest: 2 };
            return (order[a.type]||1) - (order[b.type]||1);
          }).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        {form.type === "transfer" && (
          <Select label="Na konto" value={form.toAcc} onChange={e => setForm(f => ({...f, toAcc: e.target.value}))}>
            {[...accounts].filter(a => a.id !== parseInt(form.acc)).sort((a,b) => {
              const order = { checking: 0, savings: 1, invest: 2 };
              return (order[a.type]||1) - (order[b.type]||1);
            }).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}

        <button onClick={addTx} style={{ width: "100%", background: "linear-gradient(135deg, #1e40af, #3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          {editingId ? "Zapisz zmiany" : "Zapisz transakcję"}
        </button>
      </Modal>
    </div>
  );
};


export { TransactionsView };

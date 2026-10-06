import { useState } from "react";
import { PieChart, Pie, Cell } from "recharts";
import { X } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { fmtDisplay as fmt } from "../utils.js";
import { t } from "../i18n.js";
import { positionValues } from "../lib/accountTypes.js";
import { SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { useToast } from "../hooks/useToast.js";
import { useBackHandler } from "../lib/backButton.js";
import { ModuleHeader } from "../components/ModuleUI.jsx";
import { MODULES, moduleLabel } from "../lib/modules.js";

// Pozycje portfela (ETF-y, akcje, krypto). Dawne typy rachunków (PPK/IKE/IKZE) zostają
// w danych pozycji, ale nie dzielą już listy.
function InvestmentsView({ portfolio, setPortfolio, onBack }) {
  const COLORS = ["#8b5cf6","#f59e0b","#10b981","#3b82f6","#ef4444","#06b6d4","#ec4899","#a3e635"];
  const { toast } = useToast();
  const [modal, setModal] = useState(false);
  useBackHandler(modal, () => setModal(false));
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ticker:"", name:"", qty:"", avgPrice:"", currentPrice:"", currency:"PLN" });

  const openAdd  = () => { setEditItem(null); setForm({ ticker:"", name:"", qty:"", avgPrice:"", currentPrice:"", currency:"PLN" }); setModal(true); };
  const openEdit = (p) => { setEditItem(p); setForm({ ticker:p.ticker, name:p.name, qty:String(p.qty), avgPrice:String(p.avgPrice), currentPrice:String(p.currentPrice), currency:p.currency||"PLN" }); setModal(true); };

  const save = () => {
    if (!form.ticker || !form.currentPrice) return;
    const qty   = parseFloat(form.qty) || 0;
    const avg   = parseFloat(form.avgPrice) || 0;
    const cur   = parseFloat(form.currentPrice) || 0;
    // Wartość w PLN po bieżącym kursie waluty pozycji (fmt pokazuje ją w walucie głównej)
    const { valuePLN: val, pnlPLN: pnl } = positionValues({ qty, currentPrice: cur, avgPrice: avg, currency: form.currency });
    const pnlPct = avg > 0 ? ((cur - avg) / avg * 100) : 0;
    // Spread editItem: zachowuje pola spoza formularza (np. dawne account / linkedAccId)
    const base = editItem ? { ...editItem } : { id: Date.now() };
    const item  = { ...base, ticker: form.ticker.toUpperCase(), name: form.name, qty, avgPrice: avg, currentPrice: cur, valuePLN: val, pnlPLN: pnl, pnlPct, currency: form.currency };
    if (editItem) setPortfolio(p => p.map(x => x.id === editItem.id ? item : x));
    else          setPortfolio(p => [...p, item]);
    setModal(false);
    setEditItem(null);
  };

  const remove = (id) => setPortfolio(p => p.filter(x => x.id !== id));

  const totalValue = portfolio.reduce((s, p) => s + positionValues(p).valuePLN, 0);
  const totalPnL   = portfolio.reduce((s, p) => s + positionValues(p).pnlPLN, 0);
  const totalInv   = totalValue - totalPnL;
  const totalPct   = totalInv > 0 ? (totalPnL / totalInv * 100) : 0;


  const colorFor = (ticker) => COLORS[portfolio.findIndex(p => p.ticker === ticker) % COLORS.length];

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
      <ModuleHeader Icon={MODULES.investments.icon} color={MODULES.investments.color} title={moduleLabel("investments")}
        onBack={onBack} addLabel={t("inv.position", "Pozycja")} onAdd={openAdd}/>

      {portfolio.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("inv.title", "Portfel inwestycyjny")}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 26, fontWeight: 500 }}>{fmt(totalValue)}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: totalPnL >= 0 ? "#10b981" : "#ef4444" }}>
              {totalPnL >= 0 ? "+" : ""}{fmt(totalPnL)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)
            </span>
          </div>
        </Card>
      )}

      {portfolio.length === 0 && (
        <Card style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{t("inv.emptyTitle", "Dodaj swoje inwestycje")}</div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{t("inv.emptyDesc", "ETF-y, akcje, kryptowaluty — w jednym miejscu. Śledź zysk i podział portfela.")}</div>
          <button onClick={openAdd} style={{ marginTop: 16, background: "linear-gradient(135deg,#059669,#10b981)", border: "none", borderRadius: 10, padding: "10px 20px", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
            {t("inv.addFirst", "Dodaj pierwszą pozycję")}
          </button>
        </Card>
      )}

      {portfolio.length > 0 && (
        <>
          {/* Alokacja pie */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{t("inv.allocation", "Alokacja")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <PieChart width={110} height={110}>
                <Pie data={portfolio.map(p => ({ name: p.ticker, value: positionValues(p).valuePLN }))} cx={50} cy={50} innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={2} stroke="#060b14">
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
                    <span style={{ fontSize: 11, color: "#64748b" }}>{totalValue > 0 ? (positionValues(p).valuePLN / totalValue * 100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>


          <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {portfolio.map(p => (
                  <Card key={p.id} style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: colorFor(p.ticker), background: colorFor(p.ticker) + "22", borderRadius: 5, padding: "1px 7px", fontFamily: "'DM Mono', monospace" }}>{p.ticker}</span>
                        </div>
                        {p.name && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>{p.name}</div>}
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#334155" }}>
                          {p.qty} {t("inv.pcs", "szt.")} · {t("inv.avg", "śr.")} {p.avgPrice.toFixed(2)} {p.currency}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600 }}>{fmt(positionValues(p).valuePLN)}</div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: positionValues(p).pnlPLN >= 0 ? "#10b981" : "#ef4444", marginTop: 3 }}>
                          {positionValues(p).pnlPLN >= 0 ? "+" : ""}{fmt(positionValues(p).pnlPLN)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%)
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                          <button onClick={() => openEdit(p)} style={{ background: "#1e3a5f", border: "none", borderRadius: 6, padding: "4px 8px", color: "#60a5fa", cursor: "pointer", fontSize: 11 }}>{t("common.edit", "Edytuj")}</button>
                          <button onClick={() => remove(p.id)} style={{ background: "#1a0808", border: "none", borderRadius: 6, padding: "4px 8px", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>{t("common.delete", "Usuń")}</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
        </>
      )}

      {/* Modal dodaj/edytuj */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#0a1120", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "min(100vw, 480px)", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{editItem ? t("inv.editTitle", "Edytuj pozycję") : t("inv.newTitle", "Nowa pozycja")}</span>
              <button onClick={() => { setModal(false); setEditItem(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}><X size={20}/></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label={t("inv.ticker", "Ticker / symbol (np. IWDA, NVDA)")} value={form.ticker} onChange={e => setForm(f => ({...f, ticker: e.target.value}))} placeholder="IWDA.AS"/>
              <Input label={t("inv.name", "Nazwa (opcjonalnie)")} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="iShares MSCI World"/>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label={t("inv.qty", "Ilość")} type="number" inputMode="decimal" value={form.qty} onChange={e => setForm(f => ({...f, qty: e.target.value}))} placeholder="0"/>
                <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))}>
                  {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input label={t("inv.avgPrice", "Śr. cena zakupu")} type="number" inputMode="decimal" value={form.avgPrice} onChange={e => setForm(f => ({...f, avgPrice: e.target.value}))} placeholder="0.00"/>
                <Input label={t("inv.curPrice", "Aktualna cena")} type="number" inputMode="decimal" value={form.currentPrice} onChange={e => setForm(f => ({...f, currentPrice: e.target.value}))} placeholder="0.00"/>
              </div>
              {form.qty && form.currentPrice && (
                <div style={{ background: "#060b14", borderRadius: 10, padding: "10px 14px", border: "1px solid #1a2744" }}>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{t("inv.preview", "Podgląd")}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 600 }}>{fmt(positionValues({ qty: parseFloat(form.qty||0), currentPrice: parseFloat(form.currentPrice||0), avgPrice: parseFloat(form.avgPrice||0), currency: form.currency }).valuePLN)}</div>
                  {form.avgPrice && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: parseFloat(form.currentPrice) >= parseFloat(form.avgPrice) ? "#10b981" : "#ef4444", marginTop: 3 }}>
                    {parseFloat(form.currentPrice) >= parseFloat(form.avgPrice) ? "+" : ""}{fmt(positionValues({ qty: parseFloat(form.qty||0), currentPrice: parseFloat(form.currentPrice||0), avgPrice: parseFloat(form.avgPrice||0), currency: form.currency }).pnlPLN)}
                  </div>}
                </div>
              )}
              <button onClick={save} style={{ width: "100%", background: "linear-gradient(135deg,#059669,#10b981)", border: "none", borderRadius: 12, padding: "13px 0", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
                {editItem ? t("tx.saveChanges", "Zapisz zmiany") : t("inv.addPosition", "Dodaj pozycję")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export { InvestmentsView };

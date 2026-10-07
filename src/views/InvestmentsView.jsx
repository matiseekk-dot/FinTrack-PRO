import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RefreshCw, Search, Trash2, Pencil } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import {
  card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, ModuleHeader, PeriodChips, CheckRow, num, periodInSentence,
} from "../components/ModuleUI.jsx";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLocale } from "../i18n.js";
import { SUPPORTED_CURRENCIES, getDisplayCurrency, txAmountForDisplay } from "../lib/fx.js";
import { newId, rateOnDate, makeTx, commitTxChanges } from "../lib/ledger.js";
import { MODULES, moduleLabel, getModule, isCapitalFlow } from "../lib/modules.js";
import {
  KINDS, KIND_ORDER, PLATFORMS, kindOf, modeOf, holdingStats, portfolioTotals, valueNow,
  applyBuy, applySell, searchCoins, fetchLivePrices, isLive,
} from "../lib/investments.js";

const ACCENT = MODULES.investments.color;

const KIND_PL = {
  etf: "ETF-y i fundusze", stock: "Akcje", crypto: "Kryptowaluty", gold: "Złoto i metale", bond: "Obligacje",
  savings: "Lokaty i oszczędności", retirement: "Emerytalne (IKE, PPK…)", p2p: "Pożyczki P2P", realestate: "Nieruchomości", other: "Inne",
};
const NAME_PH_PL = {
  etf: "np. VWCE, S&P 500", stock: "np. Apple, CD Projekt", crypto: "", gold: "np. Krugerrand 1 oz, sztabka 10 g",
  bond: "np. EDO, COI", savings: "np. konto oszczędnościowe", retirement: "np. IKE w XTB", p2p: "np. Mintos",
  realestate: "np. kawalerka na wynajem", other: "",
};
const kindLabel = (k) => t(`inv.kind.${k}`, KIND_PL[k]);
const fmtQty = (q) => Number(q || 0).toLocaleString(getLocale(), { maximumFractionDigits: 8 });
const pctLabel = (p) => (p == null ? "" : `${p >= 0 ? "+" : ""}${p.toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/**
 * Inwestycje: wszystko, w co ludzie wkładają pieniądze — od ETF-ów i krypto po lokaty,
 * obligacje, złoto i konta emerytalne. Wartość, wpłaty, wynik, dywidendy/odsetki.
 * Wpłaty i wypłaty to przesunięcie pieniędzy (nie wynik); dochód i zrealizowany zysk liczą się
 * do dochodu pobocznego jak w innych modułach.
 */
function InvestmentsView({ portfolio = [], setPortfolio, transactions = [], setTransactions, setAccounts, defaultAcc = 1,
  month = null, onMonthChange, onBack, addSignal = 0, openAdd = false }) {
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const ym = month || today.slice(0, 7);
  const [form, setForm] = useState(null);       // dodawanie / edycja pozycji
  const [openId, setOpenId] = useState(null);   // szczegóły pozycji
  const [updating, setUpdating] = useState(null); // { [id]: "cena" } — szybka aktualizacja cen
  const [showClosed, setShowClosed] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveAt, setLiveAt] = useState(null);

  const open = portfolio.filter(h => !h.closed);
  const closed = portfolio.filter(h => h.closed);
  const totals = useMemo(() => portfolioTotals(portfolio, today), [portfolio, today, getDisplayCurrency()]);

  // Wpisy modułu w wybranym miesiącu: wpłaty/wypłaty (kapitał) i wynik (dywidendy, odsetki, sprzedaż, koszty)
  const monthStats = useMemo(() => {
    const s = { deposits: 0, withdrawals: 0, result: 0, income: 0 };
    for (const tx of transactions) {
      if (!tx || !(tx.date || "").startsWith(ym) || getModule(tx) !== "investments") continue;
      const a = txAmountForDisplay(tx);
      if (isCapitalFlow(tx)) { if (a < 0) s.deposits -= a; else s.withdrawals += a; }
      else { s.result += a; if (a > 0) s.income += a; }
    }
    return s;
  }, [transactions, ym]);
  // Dochód (dywidendy, odsetki, zrealizowany wynik) przypisany do pozycji — od początku
  const incomeBy = useMemo(() => {
    const m = {};
    for (const tx of transactions) {
      if (tx && tx.holdingId != null && !isCapitalFlow(tx)) m[tx.holdingId] = (m[tx.holdingId] || 0) + txAmountForDisplay(tx);
    }
    return m;
  }, [transactions]);

  // ── Ceny na żywo (krypto, złoto) ─────────────────────────────────
  // Najświeższa lista (odświeżenie zaraz po dodaniu pozycji musi już ją widzieć)
  const portfolioRef = useRef(portfolio);
  portfolioRef.current = portfolio;
  const busyRef = useRef(false);
  const refreshLive = async (silent = false) => {
    const list = portfolioRef.current;
    if (!list.some(isLive) || busyRef.current) return;
    busyRef.current = true;
    setLiveBusy(true);
    try {
      const prices = await fetchLivePrices(list);
      const ts = Date.now();
      setPortfolio(prev => prev.map(h => prices[h.id] != null ? { ...h, currentPrice: prices[h.id], priceAt: today, priceTs: ts, priceSource: "coingecko" } : h));
      setLiveAt(ts);
      if (!silent) showToast(t("inv.liveDone", "Ceny zaktualizowane ✓"));
    } catch {
      if (!silent) showToast(t("inv.liveErr", "Nie udało się pobrać cen. Spróbuj za chwilę."), "error", 3000);
    }
    busyRef.current = false;
    setLiveBusy(false);
  };
  // Przy wejściu: ceny krypto/złota starsze niż 30 min odświeżają się same
  useEffect(() => {
    const old = portfolio.some(h => isLive(h) && (!h.priceTs || Date.now() - h.priceTs > 30 * 60 * 1000));
    if (old) refreshLive(true);
    else { const ts = Math.max(0, ...portfolio.filter(isLive).map(h => h.priceTs || 0)); if (ts) setLiveAt(ts); }
  }, []);

  // ── Dodawanie / edycja ───────────────────────────────────────────
  const blank = (kind = "etf") => ({
    id: null, kind, name: "", ticker: "", platform: "", currency: getDisplayCurrency(), coinId: null, unit: "g",
    qty: "", total: "", price: "", invested: "", value: "", rate: "", startDate: today,
  });
  const startAdd = (kind) => setForm(blank(kind || "etf"));
  const startEdit = (h) => {
    const units = modeOf(h) === "units";
    setOpenId(null);
    setForm({
      id: h.id, kind: kindOf(h), name: h.name || h.ticker || "", ticker: h.ticker || "", platform: h.platform || "",
      currency: h.currency || "PLN", coinId: h.coinId || null, unit: h.unit || "g",
      qty: units && h.qty != null ? String(h.qty) : "",
      total: units && h.qty != null && h.avgPrice != null ? String(Math.round(h.qty * h.avgPrice * 100) / 100) : "",
      price: units && h.currentPrice != null ? String(h.currentPrice) : "",
      invested: !units && h.invested != null ? String(h.invested) : "",
      value: !units && h.value != null ? String(h.value) : "",
      rate: h.rate != null ? String(h.rate) : "", startDate: h.startDate || h.priceAt || today,
    });
  };
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) startAdd(); }, [addSignal]);

  const save = () => {
    const f = form;
    const name = f.name.trim();
    if (!name) { showToast(t("inv.err.name", "Wpisz nazwę"), "error"); return; }
    const old = f.id != null ? portfolio.find(h => h.id === f.id) : null;
    const mode = KINDS[f.kind].mode;
    const live = (f.kind === "crypto" && f.coinId) || f.kind === "gold";
    const base = {
      ...(old || {}), id: old ? old.id : newId(), kind: f.kind, mode, name,
      ticker: f.ticker.trim().toUpperCase(), platform: f.platform.trim(), currency: f.currency,
      coinId: f.kind === "crypto" ? f.coinId : null, unit: f.kind === "gold" ? f.unit : null,
      createdAt: old?.createdAt || today, closed: false,
    };
    let h;
    if (mode === "units") {
      const qty = num(f.qty), total = num(f.total);
      if (!isFinite(qty) || qty <= 0) { showToast(t("inv.err.qty", "Wpisz ilość"), "error"); return; }
      const avg = isFinite(total) && total >= 0 ? total / qty : (old?.avgPrice ?? 0);
      const price = num(f.price);
      const priceChanged = isFinite(price) && price > 0 && price !== old?.currentPrice;
      h = {
        ...base, qty, avgPrice: Math.round(avg * 1e6) / 1e6,
        currentPrice: isFinite(price) && price > 0 ? price : (old?.currentPrice ?? Math.round(avg * 1e6) / 1e6),
        priceAt: priceChanged || !old ? today : old.priceAt, priceSource: live ? (old?.priceSource || "manual") : "manual",
        invested: null, value: null, rate: null,
      };
    } else {
      const invested = num(f.invested), value = num(f.value), rate = num(f.rate);
      if (!(isFinite(invested) && invested > 0) && !(isFinite(value) && value > 0)) { showToast(t("inv.err.amount", "Wpisz, ile wpłaciłeś albo ile to jest warte"), "error"); return; }
      const inv = isFinite(invested) && invested > 0 ? invested : value;
      const val = isFinite(value) && value > 0 ? value : inv;
      const valueChanged = !old || val !== old.value || f.startDate !== (old.startDate || old.priceAt);
      h = {
        ...base, invested: inv, value: val,
        rate: KINDS[f.kind].rate && isFinite(rate) && rate > 0 ? rate : null,
        startDate: f.startDate || today,
        priceAt: valueChanged ? (old ? today : (f.startDate || today)) : old.priceAt, priceSource: "manual",
        qty: null, avgPrice: null, currentPrice: null,
      };
    }
    // Pola po starym formacie (valuePLN, pnlPLN…) zostają w danych, ale nie są już źródłem prawdy
    setPortfolio(prev => old ? prev.map(x => x.id === h.id ? h : x) : [...prev, h]);
    setForm(null);
    showToast(old ? t("inv.toast.saved", "Zapisano ✓") : t("inv.toast.added", "Dodano do portfela ✓"));
    if (live) setTimeout(() => refreshLive(true), 80);
  };

  const remove = (h) => {
    if (!window.confirm(t("inv.confirmDelete", "Usunąć „{name}” z portfela? Wpisy w Wpisach zostaną.").replace("{name}", h.name || h.ticker))) return;
    setPortfolio(prev => prev.filter(x => x.id !== h.id));
    setOpenId(null);
    showToast(t("inv.toast.deleted", "Usunięto"), "error");
  };

  // ── Wpisy z akcji na pozycji ─────────────────────────────────────
  const book = async ({ h, date, amount, cat, desc }) => {
    const cur = h.currency || "PLN";
    const rate = await rateOnDate(cur, date);
    const tx = makeTx({ date, desc, amount, currency: cur, rate, cat, acc: defaultAcc, module: "investments", holdingId: h.id });
    commitTxChanges({ setTransactions, setAccounts }, { add: [tx] });
  };

  const holding = openId != null ? portfolio.find(h => h.id === openId) : null;

  const row = (h) => {
    const k = kindOf(h);
    const K = KINDS[k];
    const Icon = K.icon;
    const s = holdingStats(h, today);
    const units = modeOf(h) === "units";
    const meta = h.closed
      ? [h.platform, t("inv.realizedShort", "wynik {amount}").replace("{amount}", fmtCurrency(h.realized || 0, h.currency || "PLN", true))]
      : units
        ? [h.platform, `${fmtQty(h.qty)} ${k === "gold" ? (h.unit === "oz" ? "oz" : "g") : (h.ticker || t("inv.pcs", "szt."))}`]
        : [h.platform, h.rate ? t("inv.rateShort", "{rate}% rocznie").replace("{rate}", String(h.rate).replace(".", ",")) : null];
    return (
      <button key={h.id} onClick={() => setOpenId(h.id)} style={{
        all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 0", borderBottom: "1px solid #0f1a2e", opacity: h.closed ? 0.6 : 1,
      }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: K.color + "22", border: `1px solid ${K.color}55`, display: "grid", placeItems: "center" }}>
          <Icon size={15} color={K.color}/>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name || h.ticker}</span>
            {!h.closed && s.stale && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b", flexShrink: 0 }}>{t("inv.staleBadge", "STARA CENA")}</span>}
          </span>
          <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.filter(Boolean).join(" · ") || kindLabel(k)}
          </span>
        </span>
        {!h.closed && (
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{s.estimated ? "≈ " : ""}{fmtDisplay(s.valueDisp)}</span>
            <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, marginTop: 1, color: s.gainDisp >= 0 ? "#34d399" : "#f87171" }}>
              {fmtDisplay(s.gainDisp, { showSign: true })}{s.gainPct != null ? ` (${pctLabel(s.gainPct)})` : ""}
            </span>
          </span>
        )}
        <ChevronRight size={14} color="#334155"/>
      </button>
    );
  };

  const kindsPresent = KIND_ORDER.filter(k => open.some(h => kindOf(h) === k));
  const manualOpen = open.filter(h => !isLive(h));

  return (
    <div style={{ padding: "0 16px" }}>
      <ModuleHeader Icon={MODULES.investments.icon} color={ACCENT} title={moduleLabel("investments")}
        onBack={onBack} addLabel={t("inv.position", "Pozycja")} onAdd={() => startAdd()}/>

      {portfolio.length === 0 ? (
        <div style={{ ...card, padding: "24px 18px", marginTop: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center" }}>{t("inv.emptyTitle", "Co masz w portfelu?")}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5, textAlign: "center" }}>
            {t("inv.emptyDesc2", "Wszystko w jednym miejscu: ile wpłaciłeś, ile to jest warte i ile zarobiłeś. Ceny krypto i złota aktualizują się same.")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
            {KIND_ORDER.map(k => {
              const K = KINDS[k]; const Icon = K.icon;
              return (
                <button key={k} onClick={() => startAdd(k)} style={{
                  background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: "10px 10px", cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 12, fontWeight: 600, textAlign: "left",
                }}>
                  <Icon size={15} color={K.color} style={{ flexShrink: 0 }}/> {kindLabel(k)}
                </button>
              );
            })}
          </div>
        </div>
      ) : <>
        <PeriodChips monthOnly month={ym} onMonthChange={onMonthChange}/>

        <div style={heroCard}>
          <div style={heroLabel}>{t("inv.totalValue", "Wartość inwestycji")}</div>
          <div style={{ ...heroValue(true), color: "#e2e8f0" }}>{fmtDisplay(totals.value)}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Stat label={t("inv.invested", "Wpłacono")} value={fmtDisplay(totals.cost)}/>
            <Stat label={t("inv.gain", "Wynik")} value={fmtDisplay(totals.gain, { showSign: true })} color={totals.gain >= 0 ? "#34d399" : "#f87171"}/>
            <Stat label={t("inv.gainPct", "Zwrot")} value={totals.gainPct != null ? pctLabel(totals.gainPct) : "—"} color={totals.gain >= 0 ? "#34d399" : "#f87171"}/>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, paddingTop: 10, borderTop: "1px solid #1a2744" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#94a3b8" }}>
              {t("inv.monthResult", "Dochód · {period}").replace("{period}", periodInSentence(ym))}
              <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {monthStats.deposits > 0 || monthStats.withdrawals > 0
                  ? t("inv.monthFlows", "wpłaty {in} · wypłaty {out}").replace("{in}", fmtDisplay(monthStats.deposits)).replace("{out}", fmtDisplay(monthStats.withdrawals))
                  : t("inv.monthHint", "dywidendy, odsetki, zysk ze sprzedaży")}
              </span>
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 800, color: monthStats.result > 0 ? "#34d399" : monthStats.result < 0 ? "#f87171" : "#e2e8f0" }}>
              {fmtDisplay(monthStats.result, { showSign: monthStats.result !== 0 })}
            </span>
          </div>
        </div>

        {/* Podział portfela */}
        {totals.value > 0 && kindsPresent.length > 1 && (
          <div style={{ ...card, padding: "12px 14px", marginTop: 10 }}>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#060b14" }}>
              {kindsPresent.map(k => <div key={k} style={{ width: `${(totals.byKind[k] || 0) / totals.value * 100}%`, background: KINDS[k].color }}/>)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 10 }}>
              {kindsPresent.map(k => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: KINDS[k].color }}/>
                  {kindLabel(k)} <b style={{ color: "#cbd5e1" }}>{Math.round((totals.byKind[k] || 0) / totals.value * 100)}%</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ceny: na żywo i do ręcznej aktualizacji */}
        {(portfolio.some(isLive) || totals.stale > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {portfolio.some(isLive) && (
              <button onClick={() => refreshLive(false)} disabled={liveBusy} style={{ ...actionBtn(ACCENT), padding: "9px 8px", fontSize: 12, borderRadius: 12 }}>
                <RefreshCw size={13} style={liveBusy ? { animation: "spin 1s linear infinite" } : undefined}/>
                {liveBusy ? t("inv.liveBusy", "Pobieram ceny…")
                  : liveAt ? t("inv.liveAt", "Krypto i złoto · {time}").replace("{time}", new Date(liveAt).toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" }))
                  : t("inv.liveRefresh", "Odśwież ceny krypto i złota")}
              </button>
            )}
            {manualOpen.length > 0 && (
              <button onClick={() => setUpdating({})} style={{ ...actionBtn(totals.stale > 0 ? "#f59e0b" : "#64748b"), padding: "9px 8px", fontSize: 12, borderRadius: 12 }}>
                {totals.stale > 0 ? t("inv.staleN", "Stare ceny: {n} · aktualizuj").replace("{n}", totals.stale) : t("inv.updateAll", "Aktualizuj ceny")}
              </button>
            )}
          </div>
        )}
        <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>

        {kindsPresent.map(k => (
          <div key={k}>
            <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between" }}>
              <span>{kindLabel(k)}</span>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{fmtDisplay(totals.byKind[k] || 0)}</span>
            </div>
            <div style={{ ...card, padding: "0 14px" }}>
              {open.filter(h => kindOf(h) === k).map(row)}
            </div>
          </div>
        ))}

        {closed.length > 0 && <>
          <button onClick={() => setShowClosed(v => !v)} style={{ ...sectionTitle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "block" }}>
            {t("inv.closed", "Zamknięte pozycje")} · {closed.length} {showClosed ? "▴" : "▾"}
          </button>
          {showClosed && <div style={{ ...card, padding: "0 14px" }}>{closed.map(row)}</div>}
        </>}

        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, margin: "16px 2px 0" }}>
          {t("inv.footnote", "Wpłaty i wypłaty to przesunięcie pieniędzy, nie zysk. Do dochodu pobocznego liczą się dywidendy, odsetki i zysk ze sprzedaży. Ceny akcji i ETF-ów wpisujesz sam; krypto i złoto — z CoinGecko.")}
        </div>
      </>}

      {form && <HoldingForm form={form} setForm={setForm} onSave={save} onClose={() => setForm(null)}/>}
      {holding && (
        <HoldingSheet h={holding} today={today} income={incomeBy[holding.id] || 0}
          onClose={() => setOpenId(null)} onEdit={() => startEdit(holding)} onDelete={() => remove(holding)}
          setPortfolio={setPortfolio} book={book} showToast={showToast}/>
      )}
      {updating && <UpdatePrices list={manualOpen} today={today} setPortfolio={setPortfolio} onClose={() => setUpdating(null)} showToast={showToast}/>}

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

/** Formularz pozycji — pola zależą od rodzaju (sztuki × cena albo wpłacono / wartość). */
function HoldingForm({ form, setForm, onSave, onClose }) {
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const K = KINDS[form.kind];
  const units = K.mode === "units";
  const [coinQ, setCoinQ] = useState("");
  const [coins, setCoins] = useState([]);
  const [coinBusy, setCoinBusy] = useState(false);
  const [coinErr, setCoinErr] = useState("");

  const findCoin = async () => {
    setCoinBusy(true); setCoinErr("");
    try { const r = await searchCoins(coinQ); setCoins(r); if (!r.length) setCoinErr(t("inv.coinNone", "Nic nie znaleziono — możesz wpisać nazwę sam (bez ceny na żywo).")); }
    catch { setCoinErr(t("inv.liveErr", "Nie udało się pobrać cen. Spróbuj za chwilę.")); }
    setCoinBusy(false);
  };

  const q = num(form.qty), total = num(form.total);
  const avg = isFinite(q) && q > 0 && isFinite(total) ? total / q : null;
  const unitLabel = form.kind === "gold" ? (form.unit === "oz" ? "oz" : "g") : t("inv.pcs", "szt.");
  const platforms = PLATFORMS[form.kind] || [];

  return (
    <Modal open onClose={onClose} title={form.id != null ? t("inv.editTitle", "Edytuj pozycję") : t("inv.newTitle", "Nowa pozycja")}>
      <div style={fieldLabel}>{t("inv.kindLabel", "Rodzaj")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {KIND_ORDER.map(k => (
          <Chip key={k} on={form.kind === k} color={KINDS[k].color}
            onClick={() => set({ kind: k, ...(KINDS[k].mode !== K.mode ? { qty: "", total: "", price: "", invested: "", value: "" } : {}) })}>
            {kindLabel(k)}
          </Chip>
        ))}
      </div>

      {form.kind === "crypto" && (
        <div style={{ marginBottom: 14 }}>
          <div style={fieldLabel}>{t("inv.coin", "Kryptowaluta")}</div>
          {form.coinId ? (
            <div style={{ ...card, background: "#060b14", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{form.name} <span style={{ color: "#64748b", fontWeight: 600 }}>{form.ticker}</span></span>
              <span style={{ fontSize: 11, color: "#34d399" }}>{t("inv.livePrice", "cena na żywo")}</span>
              <button type="button" onClick={() => set({ coinId: null })} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>{t("inv.change", "zmień")}</button>
            </div>
          ) : <>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={coinQ} onChange={e => setCoinQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") findCoin(); }}
                placeholder={t("inv.coinPh", "np. Bitcoin, ETH, Solana")} aria-label={t("inv.coin", "Kryptowaluta")}
                style={{ flex: 1, minWidth: 0, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "11px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "inherit", outline: "none" }}/>
              <button type="button" onClick={findCoin} disabled={coinBusy || coinQ.trim().length < 2} aria-label={t("scan.find", "Szukaj")}
                style={{ flex: "none", background: ACCENT + "18", border: `1px solid ${ACCENT}55`, color: ACCENT, borderRadius: 10, padding: "0 14px", cursor: "pointer", display: "grid", placeItems: "center", opacity: coinQ.trim().length < 2 ? 0.5 : 1 }}>
                <Search size={16}/>
              </button>
            </div>
            {coins.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {coins.map(c => (
                  <button key={c.id} type="button" onClick={() => { set({ coinId: c.id, name: c.name, ticker: c.symbol }); setCoins([]); }} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, background: "#060b14", border: "1px solid #1a2744", borderRadius: 8, padding: "6px 10px",
                    color: "#cbd5e1", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {c.thumb && <img src={c.thumb} alt="" width={14} height={14} style={{ borderRadius: 7 }}/>}{c.name} <span style={{ color: "#64748b" }}>{c.symbol}</span>
                  </button>
                ))}
              </div>
            )}
            {coinErr && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>{coinErr}</div>}
          </>}
        </div>
      )}

      {!(form.kind === "crypto" && form.coinId) && (
        <Input label={t("inv.nameLabel", "Nazwa")} value={form.name} onChange={e => set({ name: e.target.value })}
          placeholder={t(`inv.namePh.${form.kind}`, NAME_PH_PL[form.kind])}/>
      )}
      {units && form.kind !== "crypto" && form.kind !== "gold" && (
        <Input label={t("inv.tickerOpt", "Ticker (opcjonalnie)")} value={form.ticker} onChange={e => set({ ticker: e.target.value })} placeholder="VWCE, AAPL"/>
      )}
      <Input label={t("inv.platform", "Gdzie (opcjonalnie)")} value={form.platform} onChange={e => set({ platform: e.target.value })}
        list={`inv-pl-${form.kind}`} placeholder={platforms.filter(Boolean).slice(0, 3).join(", ")}/>
      <datalist id={`inv-pl-${form.kind}`}>{platforms.filter(Boolean).map(p => <option key={p} value={p}/>)}</datalist>

      {form.kind === "gold" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#64748b", marginRight: 2 }}>{t("inv.unit", "Liczę w:")}</span>
          <Chip on={form.unit !== "oz"} color={K.color} onClick={() => set({ unit: "g" })}>{t("inv.grams", "gramach")}</Chip>
          <Chip on={form.unit === "oz"} color={K.color} onClick={() => set({ unit: "oz" })}>{t("inv.ounces", "uncjach")}</Chip>
        </div>
      )}

      <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => set({ currency: e.target.value })}>
        {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
      </Select>

      {units ? <>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><Input label={`${t("inv.qty", "Ilość")} (${unitLabel})`} type="number" inputMode="decimal" step="any" value={form.qty} onChange={e => set({ qty: e.target.value })} placeholder="0"/></div>
          <div style={{ flex: 1 }}><Input label={t("inv.paidTotal", "Zapłacono łącznie")} type="number" inputMode="decimal" step="0.01" value={form.total} onChange={e => set({ total: e.target.value })} placeholder="0"/></div>
        </div>
        {avg != null && (
          <div style={{ fontSize: 11, color: "#64748b", margin: "-6px 0 12px" }}>
            {t("inv.avgLine", "Średnia cena: {price} za {unit}").replace("{price}", fmtCurrency(avg, form.currency)).replace("{unit}", unitLabel)}
          </div>
        )}
        {(form.kind === "crypto" && form.coinId) || form.kind === "gold" ? (
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
            {t("inv.liveNote", "Cena aktualna pobierze się sama (CoinGecko).")}
          </div>
        ) : (
          <Input label={t("inv.priceNow", "Cena teraz za {unit} (opcjonalnie)").replace("{unit}", unitLabel)} type="number" inputMode="decimal" step="any" value={form.price} onChange={e => set({ price: e.target.value })}
            placeholder={avg != null ? String(Math.round(avg * 100) / 100) : "0"}/>
        )}
      </> : <>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><Input label={t("inv.investedLabel", "Wpłacono")} type="number" inputMode="decimal" step="0.01" value={form.invested} onChange={e => set({ invested: e.target.value })} placeholder="0"/></div>
          <div style={{ flex: 1 }}><Input label={t("inv.valueNow", "Wartość teraz")} type="number" inputMode="decimal" step="0.01" value={form.value} onChange={e => set({ value: e.target.value })} placeholder={form.invested || t("common.optional", "opcjonalnie")}/></div>
        </div>
        {K.rate && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Input label={t("inv.rate", "Oprocentowanie %")} type="number" inputMode="decimal" step="0.01" value={form.rate} onChange={e => set({ rate: e.target.value })} placeholder={t("common.optional", "opcjonalnie")}/></div>
            <div style={{ flex: 1 }}><Input label={t("inv.since", "Od kiedy")} type="date" value={form.startDate} onChange={e => set({ startDate: e.target.value })}/></div>
          </div>
        )}
        {K.rate && num(form.rate) > 0 && (
          <div style={{ fontSize: 11, color: "#64748b", margin: "-6px 0 12px", lineHeight: 1.45 }}>
            {t("inv.rateHint", "Wartość będzie rosła sama o odsetki (szacunek). Gdy bank pokaże dokładną kwotę — zaktualizuj ją.")}
          </div>
        )}
      </>}

      <button onClick={onSave} style={{ ...primaryBtn, marginTop: 4 }}>{t("common.save", "Zapisz")}</button>
    </Modal>
  );
}

/** Szczegóły pozycji i akcje: aktualizuj cenę, dokup, sprzedaj, dywidenda/odsetki. */
function HoldingSheet({ h, today, income, onClose, onEdit, onDelete, setPortfolio, book, showToast }) {
  const k = kindOf(h);
  const K = KINDS[k];
  const units = modeOf(h) === "units";
  const s = holdingStats(h, today);
  const cur = h.currency || "PLN";
  const unitLabel = k === "gold" ? (h.unit === "oz" ? "oz" : "g") : (h.ticker || t("inv.pcs", "szt."));
  const [action, setAction] = useState(null); // price | buy | sell | income
  const [f, setF] = useState({});
  const [record, setRecord] = useState(true);
  const [busy, setBusy] = useState(false);
  const start = (a) => {
    setAction(a); setRecord(a !== "buy");
    setF({ date: today, qty: "", total: "", price: units ? String(h.currentPrice ?? "") : String(valueNow(h, today).value) });
  };
  const patch = (p) => setF(x => ({ ...x, ...p }));
  const name = h.name || h.ticker;

  const run = async () => {
    if (busy) return;
    const qty = num(f.qty), total = num(f.total), price = num(f.price);
    const date = f.date || today;
    setBusy(true);
    try {
      if (action === "price") {
        if (!(isFinite(price) && price >= 0)) return;
        setPortfolio(prev => prev.map(x => x.id !== h.id ? x : units
          ? { ...x, currentPrice: price, priceAt: today, priceSource: "manual" }
          : { ...x, value: price, priceAt: today, priceSource: "manual" }));
        showToast(t("inv.toast.saved", "Zapisano ✓"));
      } else if (action === "buy") {
        if (!(isFinite(total) && total > 0) || (units && !(isFinite(qty) && qty > 0))) { showToast(t("inv.err.buy", "Wpisz ilość i kwotę"), "error"); return; }
        setPortfolio(prev => prev.map(x => x.id === h.id ? applyBuy(x, { qty, total, date }) : x));
        if (record) await book({ h, date, amount: -total, cat: "inwestycje", desc: `${t("inv.tx.buy", "Wpłata")}: ${name}` });
        showToast(t("inv.toast.bought", "Dodano do pozycji ✓"));
      } else if (action === "sell") {
        if (!(isFinite(total) && total > 0) || (units && !(isFinite(qty) && qty > 0))) { showToast(t("inv.err.buy", "Wpisz ilość i kwotę"), "error"); return; }
        if (units && qty > (Number(h.qty) || 0) + 1e-9) { showToast(t("inv.err.tooMuch", "Masz tylko {qty} {unit}").replace("{qty}", fmtQty(h.qty)).replace("{unit}", unitLabel), "error"); return; }
        const res = applySell(h, { qty, total, date });
        setPortfolio(prev => prev.map(x => x.id === h.id ? res.holding : x));
        if (record && res.realized !== 0) {
          await book({ h, date, amount: res.realized, cat: res.realized > 0 ? "dodatkowe" : "zakupy",
            desc: `${res.realized > 0 ? t("inv.tx.gain", "Zysk ze sprzedaży") : t("inv.tx.loss", "Strata na sprzedaży")}: ${name}` });
        }
        showToast(t("inv.toast.sold", "Sprzedane · wynik {amount}").replace("{amount}", fmtCurrency(res.realized, cur, true)), res.realized >= 0 ? "success" : "error", 3000);
        if (res.holding.closed) onClose();
      } else if (action === "income") {
        if (!(isFinite(total) && total > 0)) { showToast(t("tx.err.amount", "Wprowadź poprawną kwotę"), "error"); return; }
        await book({ h, date, amount: total, cat: "dodatkowe", desc: `${f.kindText || t("inv.tx.income", "Dywidenda / odsetki")}: ${name}` });
        showToast(t("inv.toast.income", "Dochód zapisany ✓"));
      }
      setAction(null);
    } finally { setBusy(false); }
  };

  const preview = (() => {
    if (action !== "sell") return null;
    const qty = num(f.qty), total = num(f.total);
    if (!(isFinite(total) && total > 0) || (units && !(isFinite(qty) && qty > 0))) return null;
    const r = applySell(h, { qty, total, date: f.date || today }).realized;
    return <div style={{ fontSize: 12, fontWeight: 700, margin: "-6px 0 12px", color: r >= 0 ? "#34d399" : "#f87171" }}>{t("inv.sellPreview", "Wynik na sprzedaży: {amount}").replace("{amount}", fmtCurrency(r, cur, true))}</div>;
  })();

  return (
    <Modal open onClose={onClose} title={name}>
      <div style={{ fontSize: 12, color: "#64748b", margin: "-12px 0 14px" }}>{[kindLabel(k), h.platform].filter(Boolean).join(" · ")}</div>
      <div style={{ ...heroCard, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label={t("inv.value", "Wartość")} value={`${s.estimated ? "≈ " : ""}${fmtCurrency(s.value, s.currency)}`}/>
          <Stat label={units ? t("inv.cost", "Koszt") : t("inv.invested", "Wpłacono")} value={fmtCurrency(s.cost, s.currency)}/>
          <Stat label={t("inv.gain", "Wynik")} value={`${fmtCurrency(s.gain, s.currency, true)}`} color={s.gain >= 0 ? "#34d399" : "#f87171"}/>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
          {units
            ? t("inv.unitsLine", "{qty} {unit} · średnio {avg} · teraz {price}").replace("{qty}", fmtQty(h.qty)).replace("{unit}", unitLabel)
              .replace("{avg}", fmtCurrency(h.avgPrice || 0, cur)).replace("{price}", h.currentPrice != null ? fmtCurrency(h.currentPrice, cur) : "—")
            : h.rate ? t("inv.rateLine", "{rate}% rocznie · wartość rośnie o odsetki (szacunek)").replace("{rate}", String(h.rate).replace(".", ",")) : null}
          {h.priceAt && <span style={{ display: "block", color: s.stale ? "#f59e0b" : "#64748b" }}>
            {h.priceSource === "coingecko" ? t("inv.priceLive", "Cena z CoinGecko · {date}").replace("{date}", h.priceAt) : t("inv.priceManual", "Cena/wartość z {date}").replace("{date}", h.priceAt)}
          </span>}
          {(income !== 0 || h.realized) && <span style={{ display: "block", color: "#94a3b8" }}>
            {t("inv.incomeLine", "Dochód z tej pozycji: {amount}").replace("{amount}", fmtDisplay(income, { showSign: true }))}
          </span>}
        </div>
      </div>

      {!action ? <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          {!isLive(h) && !h.closed && <button onClick={() => start("price")} style={{ ...actionBtn("#94a3b8"), padding: 11, fontSize: 12, borderRadius: 12 }}>{units ? t("inv.act.price", "Nowa cena") : t("inv.act.value", "Nowa wartość")}</button>}
          <button onClick={() => start("buy")} style={{ ...actionBtn(ACCENT), padding: 11, fontSize: 12, borderRadius: 12 }}>{units ? t("inv.act.buy", "Dokup") : t("inv.act.deposit", "Dopłać")}</button>
          {!h.closed && <button onClick={() => start("sell")} style={{ ...actionBtn("#ec4899"), padding: 11, fontSize: 12, borderRadius: 12 }}>{units ? t("inv.act.sell", "Sprzedaj") : t("inv.act.withdraw", "Wypłać")}</button>}
          <button onClick={() => start("income")} style={{ ...actionBtn("#34d399"), padding: 11, fontSize: 12, borderRadius: 12 }}>{t("inv.act.income", "Dywidenda / odsetki")}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onEdit} style={{ ...dangerBtn, marginTop: 0, borderColor: "#1a2744", color: "#94a3b8" }}><Pencil size={13}/> {t("common.edit", "Edytuj")}</button>
          <button onClick={onDelete} style={{ ...dangerBtn, marginTop: 0 }}><Trash2 size={13}/> {t("common.delete", "Usuń")}</button>
        </div>
      </> : (
        <div style={{ marginTop: 14 }}>
          <div style={fieldLabel}>
            {action === "price" ? (units ? t("inv.act.price", "Nowa cena") : t("inv.act.value", "Nowa wartość"))
              : action === "buy" ? (units ? t("inv.act.buy", "Dokup") : t("inv.act.deposit", "Dopłać"))
              : action === "sell" ? (units ? t("inv.act.sell", "Sprzedaj") : t("inv.act.withdraw", "Wypłać"))
              : t("inv.act.income", "Dywidenda / odsetki")}
          </div>
          {action === "price" ? (
            <Input label={units ? t("inv.priceFor", "Cena za {unit} · {cur}").replace("{unit}", unitLabel).replace("{cur}", cur) : `${t("inv.valueNow", "Wartość teraz")} · ${cur}`}
              type="number" inputMode="decimal" step="any" value={f.price} onChange={e => patch({ price: e.target.value })} autoFocus/>
          ) : <>
            {units && action !== "income" && (
              <Input label={`${t("inv.qty", "Ilość")} (${unitLabel})`} type="number" inputMode="decimal" step="any" value={f.qty} onChange={e => patch({ qty: e.target.value })} placeholder="0"/>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1.2 }}>
                <Input label={`${action === "sell" ? t("inv.gotTotal", "Otrzymano łącznie") : action === "income" ? t("inv.amount", "Kwota") : t("inv.paidTotal", "Zapłacono łącznie")} · ${cur}`}
                  type="number" inputMode="decimal" step="0.01" value={f.total} onChange={e => patch({ total: e.target.value })} placeholder="0"/>
              </div>
              <div style={{ flex: 1 }}><Input label={t("inv.date", "Data")} type="date" value={f.date} onChange={e => patch({ date: e.target.value })}/></div>
            </div>
            {action === "sell" && units && (
              <button type="button" onClick={() => patch({ qty: String(h.qty) })} style={{ background: "none", border: "none", color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0, margin: "-6px 0 12px" }}>
                {t("inv.sellAll", "Sprzedaj wszystko ({qty})").replace("{qty}", fmtQty(h.qty))}
              </button>
            )}
            {preview}
            {action === "income" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {[t("inv.inc.dividend", "Dywidenda"), t("inv.inc.interest", "Odsetki"), t("inv.inc.coupon", "Kupon"), t("inv.inc.staking", "Staking"), t("inv.inc.rent", "Czynsz")].map(x => (
                  <Chip key={x} on={f.kindText === x} color="#34d399" onClick={() => patch({ kindText: x })}>{x}</Chip>
                ))}
              </div>
            )}
            {action !== "income" && (
              <CheckRow checked={record} onChange={setRecord}>
                {action === "buy" ? t("inv.recordBuy", "Zapisz też w Wpisach jako wpłatę (nie zmienia wyniku)")
                  : t("inv.recordSell", "Zapisz wynik ze sprzedaży w Wpisach — liczy się do dochodu pobocznego")}
              </CheckRow>
            )}
            {action === "income" && (
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, lineHeight: 1.45 }}>
                {t("inv.incomeHint", "Zapiszemy to w Wpisach jako dochód z inwestycji — po podatku, jeśli broker go pobrał.")}
              </div>
            )}
          </>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAction(null)} style={{ flex: "none", background: "none", border: "1px solid #1a2744", borderRadius: 12, padding: "0 16px", color: "#94a3b8", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t("common.cancel", "Anuluj")}</button>
            <button onClick={run} disabled={busy} style={{ ...primaryBtn, flex: 1, opacity: busy ? 0.6 : 1 }}>{busy ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Szybka aktualizacja cen/wartości wszystkich pozycji bez ceny na żywo. */
function UpdatePrices({ list, today, setPortfolio, onClose, showToast }) {
  const [vals, setVals] = useState(() => Object.fromEntries(list.map(h => [h.id, ""])));
  const changed = list.filter(h => isFinite(num(vals[h.id])) && num(vals[h.id]) >= 0 && vals[h.id] !== "");
  const save = () => {
    const m = new Map(changed.map(h => [h.id, num(vals[h.id])]));
    setPortfolio(prev => prev.map(h => !m.has(h.id) ? h : modeOf(h) === "units"
      ? { ...h, currentPrice: m.get(h.id), priceAt: today, priceSource: "manual" }
      : { ...h, value: m.get(h.id), priceAt: today, priceSource: "manual" }));
    showToast(t("inv.toast.updatedN", "Zaktualizowano: {n} ✓").replace("{n}", changed.length));
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("inv.updateAll", "Aktualizuj ceny")}>
      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
        {t("inv.updateDesc", "Wpisz aktualną cenę (za sztukę) albo wartość — z aplikacji brokera lub banku. Puste pola zostają bez zmian.")}
      </div>
      {list.map(h => {
        const s = holdingStats(h, today);
        const units = modeOf(h) === "units";
        return (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name || h.ticker}</div>
              <div style={{ fontSize: 11, color: s.stale ? "#f59e0b" : "#64748b" }}>
                {units ? t("inv.perUnitWas", "za szt. · było {v}").replace("{v}", h.currentPrice != null ? fmtCurrency(h.currentPrice, h.currency || "PLN") : "—")
                  : t("inv.valueWas", "wartość · było {v}").replace("{v}", fmtCurrency(s.value, h.currency || "PLN"))}
              </div>
            </div>
            <input type="number" inputMode="decimal" step="any" value={vals[h.id]} onChange={e => setVals(v => ({ ...v, [h.id]: e.target.value }))}
              placeholder={h.currency || "PLN"} aria-label={h.name || h.ticker}
              style={{ width: 120, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 16, fontFamily: "inherit", outline: "none" }}/>
          </div>
        );
      })}
      <button onClick={save} disabled={!changed.length} style={{ ...primaryBtn, marginTop: 6, opacity: changed.length ? 1 : 0.5 }}>
        {t("inv.updateSave", "Zapisz ({n})").replace("{n}", changed.length)}
      </button>
    </Modal>
  );
}

export { InvestmentsView };

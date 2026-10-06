import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Check, X, RotateCcw, HandCoins, Trash2, Target, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { BRAND, card, sectionTitle, fieldLabel, Chip, Stat, PeriodChips, inPeriodFn, num } from "../components/ModuleUI.jsx";
import { useToast } from "../hooks/useToast.js";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { getModule } from "../lib/modules.js";
import { getDisplayCurrency, txAmountForDisplay, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { linkProps } from "../lib/native.js";
import { moneyForDisplay } from "../lib/prefs.js";
import { AmountModal } from "../components/AmountModal.jsx";
import {
  BOOKMAKERS, SPORTS, bookmakerName, isPolishBookmaker, detectBookmaker, sportLabel, marketBookmakers,
  potentialPayout, defaultPayout, usesPayout, buildBetTx, bettingStats, buildTransferTx, bankrollStats,
} from "../lib/betting.js";

const ACCENT = "#a78bfa";

const STATUS_META = {
  pending: { color: "#f59e0b", label: () => t("bet.status.pending", "Otwarty") },
  won:     { color: "#10b981", label: () => t("bet.status.won", "Wygrany") },
  lost:    { color: "#ef4444", label: () => t("bet.status.lost", "Przegrany") },
  void:    { color: "#64748b", label: () => t("bet.status.void", "Zwrot") },
  cashout: { color: "#06b6d4", label: () => t("bet.status.cashout", "Cash-out") },
};

const actionBtnStyle = (color) => ({
  flex: 1, background: color + "18", border: `1px solid ${color}55`, color, borderRadius: 9, padding: "8px 4px", cursor: "pointer",
  fontSize: 12, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
});
const pct = (x, sign = false) => x == null ? "—" : `${sign && x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

function Sparkline({ series }) {
  if (series.length < 2) return null;
  const w = 300, h = 56, pad = 4;
  const min = Math.min(0, ...series), max = Math.max(0, ...series);
  const span = max - min || 1;
  const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const last = series[series.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 56, display: "block", marginTop: 12 }} aria-hidden="true">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="#1e293b" strokeDasharray="3 4"/>
      <polyline fill="none" stroke={last >= 0 ? "#10b981" : "#ef4444"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        points={series.map((v, i) => `${x(i)},${y(v)}`).join(" ")}/>
    </svg>
  );
}

/**
 * Zakłady: wynik, ROI i obrót z kuponów. Każdy kupon to wpis w Wpisach (moduł betting),
 * więc rozliczenie kuponu od razu zmienia Start i saldo konta.
 */
function BettingView({ transactions, setTransactions, setAccounts, defaultAcc = 1, hobbies = [],
  onBack, addSignal = 0, openAdd = false, month = null, onMonthChange, focusTxId = null, onFocusHandled, lossLimit = null, onLossLimitChange }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const [period, setPeriod] = useState("month");
  const [form, setForm] = useState(null);     // otwarty formularz kuponu
  const [settle, setSettle] = useState(null); // { tx, status, payout }
  const [saving, setSaving] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(15);
  const [limitOpen, setLimitOpen] = useState(false);
  const [transfer, setTransfer] = useState(null);  // formularz wpłaty/wypłaty u bukmachera
  const [afterWin, setAfterWin] = useState(null);  // „Co robisz z wygraną?” po rozliczeniu

  const all = useMemo(() => transactions
    .filter(tx => tx && tx.date && getModule(tx, hobbies) === "betting")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id)),
  [transactions, hobbies]);

  const today = todayLocal();
  const viewMonth = month || today.slice(0, 7);
  const inPeriod = inPeriodFn(period, viewMonth);
  const stats = useMemo(
    () => bettingStats(all.filter(tx => tx.bet?.status === "pending" || inPeriod(tx.date))),
    [all, period, viewMonth, getDisplayCurrency()]
  );
  const pending = all.filter(tx => tx.bet?.status === "pending");
  const monthLoss = Math.max(0, -all.filter(tx => !tx.betTransfer && tx.date.startsWith(today.slice(0, 7))).reduce((sum, tx) => sum + txAmountForDisplay(tx), 0));
  const bank = useMemo(() => bankrollStats(all), [all, getDisplayCurrency()]);
  const limitValue = moneyForDisplay(lossLimit);
  const limitRatio = limitValue > 0 ? monthLoss / limitValue : 0;
  // Ostatni kupon — do „jak ostatnio”
  const lastBet = all.find(tx => tx.bet && tx.bet.stake > 0);
  const history = all.filter(tx => tx.bet?.status !== "pending" && inPeriod(tx.date));

  // Ostatnio używani bukmacherzy jako szybkie chipy; bez historii — polscy albo międzynarodowi
  const recentBookmakers = useMemo(() => {
    const seen = [];
    for (const tx of all) {
      const id = tx.bet?.bookmaker || detectBookmaker(tx.desc);
      if (id && !seen.includes(id)) seen.push(id);
      if (seen.length >= 6) break;
    }
    // Dopełnij do 5 popularnymi (polscy dla PL, międzynarodowi dla reszty)
    const fill = marketBookmakers(lang).filter(id => !seen.includes(id));
    return [...seen, ...fill].slice(0, Math.max(5, seen.length));
  }, [all, lang]);

  const openNew = () => {
    const bookmaker = recentBookmakers[0] || "";
    const pl = lang === "pl" && isPolishBookmaker(bookmaker);
    setForm({
      editingId: null, bookmaker, custom: !BOOKMAKERS.some(b => b.id === bookmaker) && !!bookmaker,
      event: "", sport: "football", odds: "", stake: "", taxed: pl,
      currency: pl ? "PLN" : getDisplayCurrency(), status: "pending", payout: "", payoutTouched: false,
      date: today, acc: defaultAcc,
    });
  };

  const repeatLast = () => {
    const b = lastBet && lastBet.bet;
    if (!b) return;
    setF({
      bookmaker: b.bookmaker || "", custom: !!b.bookmaker && !BOOKMAKERS.some(x => x.id === b.bookmaker),
      sport: b.sport || "other", stake: String(b.stake), taxed: !!b.taxed, currency: b.currency || "PLN",
    });
  };

  const openTransfer = (kind, patch = {}) => {
    const bookmaker = patch.bookmaker ?? recentBookmakers[0] ?? "";
    setTransfer({
      editingId: null, kind, bookmaker, custom: !!bookmaker && !BOOKMAKERS.some(b => b.id === bookmaker),
      amount: "", currency: lang === "pl" && isPolishBookmaker(bookmaker) ? "PLN" : getDisplayCurrency(), date: today, ...patch,
    });
  };
  const editTransfer = (tx) => {
    const tr = tx.betTransfer;
    setTransfer({
      editingId: tx.id, kind: tr.kind, bookmaker: tr.bookmaker, custom: !!tr.bookmaker && !BOOKMAKERS.some(b => b.id === tr.bookmaker),
      amount: String(tr.amount), currency: tr.currency || "PLN", date: tx.date,
    });
  };
  const saveTransfer = async () => {
    const amount = num(transfer.amount);
    if (!isFinite(amount) || amount <= 0) { showToast(t("bet.transfer.err", "Wpisz kwotę"), "error"); return; }
    const oldTx = transfer.editingId != null ? transactions.find(x => x.id === transfer.editingId) : null;
    setSaving(true);
    try {
      const rate = oldTx && oldTx.date === transfer.date && oldTx.fxRate && (oldTx.betTransfer?.currency === transfer.currency) ? oldTx.fxRate : await rateOnDate(transfer.currency, transfer.date);
      const name = bookmakerName(transfer.bookmaker) || transfer.bookmaker.trim();
      const tx = buildTransferTx({
        kind: transfer.kind, bookmaker: transfer.bookmaker.trim(), amount, currency: transfer.currency,
        date: transfer.date, acc: oldTx ? oldTx.acc : defaultAcc, rate, id: oldTx ? oldTx.id : undefined,
        desc: `${transfer.kind === "deposit" ? t("bet.transfer.depositDesc", "Wpłata u bukmachera") : t("bet.transfer.withdrawDesc", "Wypłata od bukmachera")}${name ? ` · ${name}` : ""}`,
      });
      commitTxChanges({ setTransactions, setAccounts }, { add: [tx], remove: oldTx ? [oldTx] : [] });
      showToast(transfer.kind === "deposit" ? t("bet.transfer.depositSaved", "Wpłata zapisana ✓") : t("bet.transfer.withdrawSaved", "Wypłata zapisana ✓"));
      setTransfer(null);
    } finally {
      setSaving(false);
    }
  };
  const removeTransfer = () => {
    const oldTx = transactions.find(x => x.id === transfer?.editingId);
    if (!oldTx || !window.confirm(t("bet.transfer.confirmDelete", "Usunąć ten wpis?"))) return;
    commitTxChanges({ setTransactions, setAccounts }, { remove: [oldTx] });
    setTransfer(null);
  };
  // Po wygranej: grasz dalej czy wypłacasz? (można wyłączyć pytanie)
  const askAfterWin = (bet, payout) => {
    let ask = true;
    try { ask = localStorage.getItem("ft_bet_ask_withdraw") !== "0"; } catch { /* domyślnie pytamy */ }
    if (ask && Number(payout) > 0) setAfterWin({ bookmaker: bet.bookmaker || "", payout: Number(payout), currency: bet.currency || "PLN" });
  };

  const openEdit = (tx) => {
    const b = tx.bet;
    setForm({
      editingId: tx.id, bookmaker: b.bookmaker || "", custom: !!b.bookmaker && !BOOKMAKERS.some(x => x.id === b.bookmaker),
      event: b.event || "", sport: b.sport || "other", odds: String(b.odds ?? ""), stake: String(b.stake ?? ""),
      taxed: !!b.taxed, currency: b.currency || "PLN", status: b.status, payout: b.payout != null ? String(b.payout) : "",
      payoutTouched: true, date: tx.date, acc: tx.acc,
    });
  };

  // Przycisk + z dolnego paska, gdy ten widok jest otwarty
  // Licznik jest wspólny dla ekranów modułów — reagujemy tylko na kliknięcia po wejściu na ekran
  // openAdd: ekran otwarty skrótem „Dodaj kupon” — formularz od razu
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) openNew(); }, [addSignal]);
  // Edycja kuponu kliknięta w Wpisach
  useEffect(() => {
    if (focusTxId == null) return;
    const tx = transactions.find(x => x.id === focusTxId);
    if (tx && tx.bet) openEdit(tx);
    else if (tx && tx.betTransfer) editTransfer(tx);
    if (onFocusHandled) onFocusHandled();
  }, [focusTxId]);

  const setF = (patch) => setForm(f => {
    const next = { ...f, ...patch };
    // Wypłata podąża za kursem/stawką/statusem, dopóki użytkownik jej nie zmienił ręcznie
    if (!next.payoutTouched && usesPayout(next.status)) {
      const p = defaultPayout(next.status, { stake: num(next.stake), odds: num(next.odds), taxed: next.taxed, currency: next.currency });
      next.payout = p != null ? String(p) : "";
    }
    return next;
  });

  const pickBookmaker = (id) => {
    const pl = lang === "pl" && isPolishBookmaker(id);
    // Polscy bukmacherzy grają w PLN z podatkiem; pozostali — w walucie głównej
    setF({ bookmaker: id, custom: false, taxed: pl, currency: pl ? "PLN" : getDisplayCurrency() });
  };

  const save = async () => {
    if (!form || saving) return;
    const stake = num(form.stake), odds = num(form.odds);
    if (!isFinite(stake) || stake <= 0) { showToast(t("bet.err.stake", "Wpisz stawkę"), "error"); return; }
    if (!isFinite(odds) || odds < 1) { showToast(t("bet.err.odds", "Kurs musi być co najmniej 1.00"), "error"); return; }
    const payout = num(form.payout);
    if (usesPayout(form.status) && (!isFinite(payout) || payout < 0)) { showToast(t("bet.err.payout", "Wpisz wypłatę"), "error"); return; }
    const oldTx = form.editingId != null ? transactions.find(x => x.id === form.editingId) : null;
    if (!oldTx && limitValue > 0) {
      const stakeDisp = moneyForDisplay({ amount: stake, currency: form.currency });
      if (monthLoss + stakeDisp > limitValue && !window.confirm(
        t("bet.limit.confirm", "Ten kupon może przekroczyć Twój miesięczny limit strat ({limit}). Zapisać mimo to?").replace("{limit}", fmtDisplay(limitValue))
      )) return;
    }

    setSaving(true);
    try {
      const sameFx = oldTx && oldTx.date === form.date && (oldTx.bet?.currency || "PLN") === form.currency;
      const rate = sameFx && oldTx.fxRate ? oldTx.fxRate : await rateOnDate(form.currency, form.date);
      const tx = buildBetTx({
        bookmaker: form.bookmaker.trim(), event: form.event.trim(), sport: form.sport,
        odds, stake, taxed: form.taxed, status: form.status, payout,
        currency: form.currency, settledAt: oldTx?.bet?.status === form.status ? oldTx.bet.settledAt : null,
      }, { id: oldTx ? oldTx.id : undefined, date: form.date, acc: form.acc, rate });
      commitTxChanges({ setTransactions, setAccounts }, { add: [tx], remove: oldTx ? [oldTx] : [] });
      showToast(oldTx ? t("bet.toast.updated", "Kupon zaktualizowany ✓") : t("bet.toast.added", "Kupon dodany ✓"));
      setForm(null);
      const nowWon = form.status === "won" || form.status === "cashout";
      const wasWon = oldTx && (oldTx.bet?.status === "won" || oldTx.bet?.status === "cashout");
      if (nowWon && !wasWon) askAfterWin({ bookmaker: form.bookmaker.trim(), currency: form.currency }, payout);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    const oldTx = transactions.find(x => x.id === form?.editingId);
    if (!oldTx || !window.confirm(t("bet.confirmDelete", "Usunąć ten kupon?"))) return;
    commitTxChanges({ setTransactions, setAccounts }, { remove: [oldTx] });
    showToast(t("bet.toast.deleted", "Kupon usunięty"), "error");
    setForm(null);
  };

  const settleNow = (tx, status, payoutValue) => {
    const bet = { ...tx.bet, status, payout: usesPayout(status) ? payoutValue : null, settledAt: today };
    const next = buildBetTx(bet, { id: tx.id, date: tx.date, acc: tx.acc, rate: tx.fxRate || 1 });
    commitTxChanges({ setTransactions, setAccounts }, { add: [next], remove: [tx] });
    showToast(`${STATUS_META[status].label()} ✓`);
    setSettle(null);
    if (status === "won" || status === "cashout") askAfterWin(bet, payoutValue);
  };

  const startSettle = (tx, status) => {
    if (status === "lost") { settleNow(tx, "lost", null); return; }
    const p = defaultPayout(status, tx.bet);
    setSettle({ tx, status, payout: p != null ? String(p) : "" });
  };

  const fmtBet = (amount, currency) => fmtCurrency(amount, currency || "PLN");
  const potential = form ? potentialPayout({ stake: num(form.stake), odds: num(form.odds), taxed: form.taxed, currency: form.currency }) : 0;

  return (
    <div style={{ padding: "0 16px" }}>
      {/* Nagłówek */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
        <button onClick={onBack} aria-label={t("common.back", "Wstecz")} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: 7, cursor: "pointer", color: "#94a3b8", display: "grid", placeItems: "center" }}>
          <ArrowLeft size={16}/>
        </button>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT + "22", border: `1px solid ${ACCENT}55`, display: "grid", placeItems: "center" }}>
          <Target size={15} color={ACCENT}/>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", flex: 1 }}>{t("bet.title", "Zakłady")}</h1>
        <button onClick={openNew} style={{ background: BRAND, border: "none", borderRadius: 10, padding: "8px 12px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
          <Plus size={14}/> {t("bet.add", "Kupon")}
        </button>
      </div>

      <PeriodChips value={period} onChange={setPeriod} month={viewMonth} onMonthChange={onMonthChange}/>

      {/* Wynik */}
      <div style={{ ...card, padding: 16, background: "linear-gradient(135deg,#0d1628,#111827)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("bet.result", "Wynik (rozliczone)")}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 800, color: stats.net >= 0 ? "#34d399" : "#f87171", marginTop: 4, letterSpacing: "-0.02em" }}>
          {fmtDisplay(stats.net, { showSign: true })}
        </div>
        <Sparkline series={stats.series}/>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Stat label={t("bet.roi", "ROI")} value={pct(stats.roi, true)} color={stats.roi == null ? "#e2e8f0" : stats.roi >= 0 ? "#34d399" : "#f87171"}/>
          <Stat label={t("bet.turnover", "Obrót")} value={fmtDisplay(stats.turnover)}/>
          <Stat label={t("bet.winRate", "Trafność")} value={pct(stats.winRate)}/>
          <Stat label={t("bet.avgOdds", "Śr. kurs")} value={stats.avgOdds ? stats.avgOdds.toFixed(2) : "—"}/>
        </div>
        {stats.pending > 0 && (
          <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 12 }}>
            {t("bet.openLine", "Otwarte kupony: {n} · w grze {amount}").replace("{n}", stats.pending).replace("{amount}", fmtDisplay(stats.exposure))}
          </div>
        )}
        {stats.legacy > 0 && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>
            {t("bet.legacyNote", "Starsze wpisy bez kursu: {n} — liczą się do wyniku i obrotu, nie do trafności.").replace("{n}", stats.legacy)}
          </div>
        )}
      </div>

      {/* Limit strat */}
      {lossLimit ? (() => {
        const over = limitRatio >= 1, near = limitRatio >= 0.8;
        const color = over ? "#f87171" : near ? "#fbbf24" : "#34d399";
        return (
          <button onClick={() => setLimitOpen(true)} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", ...card, padding: "12px 16px", marginTop: 10, borderColor: over ? "#7f1d1d" : near ? "#78350f" : "#1a2744" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("bet.limit.title", "Limit strat w tym miesiącu")}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color }}>{fmtDisplay(monthLoss)} / {fmtDisplay(limitValue)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#060b14", marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, limitRatio * 100)}%`, height: "100%", background: color, borderRadius: 3 }}/>
            </div>
            {(over || near) && (
              <div style={{ fontSize: 12, color, marginTop: 8, lineHeight: 1.45 }}>
                {over
                  ? t("bet.limit.over", "Limit przekroczony. Może warto zrobić przerwę do końca miesiąca.")
                  : t("bet.limit.near", "Zbliżasz się do swojego limitu strat.")}
              </div>
            )}
          </button>
        );
      })() : (
        <button onClick={() => setLimitOpen(true)} style={{ width: "100%", marginTop: 10, background: "none", border: "1px dashed #1a2744", borderRadius: 12, padding: 10, color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {t("bet.limit.set", "Ustaw miesięczny limit strat")}
        </button>
      )}

      {/* Portfel u bukmacherów */}
      {all.length > 0 && (
        <div style={{ ...card, padding: "12px 16px", marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={14} color={ACCENT}/>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("bet.bank.title", "Portfel u bukmacherów")}</span>
            {bank.rows.length > 0 && (
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>≈ {fmtDisplay(bank.balance)}</span>
            )}
          </div>
          {bank.rows.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginTop: 8 }}>
              {t("bet.bank.empty", "Zapisuj wpłaty i wypłaty, a zobaczysz saldo u każdego bukmachera i ile z wygranych naprawdę wypłacasz.")}
            </div>
          ) : <>
            {bank.rows.map(r => (
              <div key={r.key} style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, fontSize: 12 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key === "other" ? t("bet.otherEntries", "Inne wpisy") : bookmakerName(r.key)}</span>
                <span style={{ color: "#64748b" }}>+{fmtDisplay(r.deposits)} / −{fmtDisplay(r.withdrawals)}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, minWidth: 70, textAlign: "right", color: r.balance == null ? "#64748b" : r.balance < 0 ? "#f87171" : "#e2e8f0" }}>
                  {r.balance == null ? "—" : fmtDisplay(r.balance)}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10, lineHeight: 1.5 }}>
              {t("bet.bank.cash", "Na rękę (wypłaty − wpłaty): {amount}").replace("{amount}", fmtDisplay(bank.cashResult, { showSign: true }))}
              {bank.withdrawnShare != null && <>
                <br/>{bank.withdrawnShare >= 1
                  ? t("bet.bank.shareAll", "Wypłaciłeś równowartość wszystkich wygranych.")
                  : t("bet.bank.share", "Z wygranych wypłaciłeś {pct}% — reszta gra dalej.").replace("{pct}", Math.round(bank.withdrawnShare * 100))}
              </>}
            </div>
          </>}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => openTransfer("deposit")} style={{ ...actionBtnStyle("#60a5fa") }}><ArrowUpRight size={12}/> {t("bet.bank.deposit", "Wpłać")}</button>
            <button onClick={() => openTransfer("withdraw")} style={{ ...actionBtnStyle("#34d399") }}><ArrowDownLeft size={12}/> {t("bet.bank.withdraw", "Wypłać")}</button>
          </div>
        </div>
      )}

      {/* Otwarte kupony */}
      {pending.length > 0 && <>
        <div style={sectionTitle}>{t("bet.open", "Otwarte kupony")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.map(tx => {
            const b = tx.bet;
            return (
              <div key={tx.id} style={{ ...card, padding: 14 }}>
                <button onClick={() => openEdit(tx)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.event || bookmakerName(b.bookmaker) || t("bet.coupon", "Kupon")}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                        {[bookmakerName(b.bookmaker), `@ ${Number(b.odds).toFixed(2)}`, tx.date].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{fmtBet(b.stake, b.currency)}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>{t("bet.toWin", "do wygrania")} {fmtBet(potentialPayout(b), b.currency)}</div>
                    </div>
                  </div>
                </button>
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  {[
                    ["won", Check], ["lost", X], ["void", RotateCcw], ["cashout", HandCoins],
                  ].map(([status, Icon]) => (
                    <button key={status} onClick={() => startSettle(tx, status)} style={{
                      flex: 1, background: STATUS_META[status].color + "18", border: `1px solid ${STATUS_META[status].color}55`,
                      color: STATUS_META[status].color, borderRadius: 9, padding: "7px 2px", cursor: "pointer",
                      fontSize: 11, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    }}>
                      <Icon size={12}/> {STATUS_META[status].label()}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {/* Pusty stan */}
      {all.length === 0 && (
        <div style={{ ...card, padding: "28px 20px", textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t("bet.emptyTitle", "Dodaj pierwszy kupon")}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>
            {t("bet.emptyDesc", "Bukmacher, kurs i stawka — wynik, ROI i trafność policzą się same.")}
          </div>
          <button onClick={openNew} style={{ marginTop: 16, background: BRAND, border: "none", borderRadius: 12, padding: "11px 18px", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            + {t("bet.add", "Kupon")}
          </button>
        </div>
      )}

      {/* Bukmacherzy */}
      {stats.byBookmaker.length > 0 && <>
        <div style={sectionTitle}>{t("bet.byBookmaker", "Bukmacherzy")}</div>
        <BreakdownTable rows={stats.byBookmaker} labelFor={(key) => key === "other" ? t("bet.otherEntries", "Inne wpisy") : bookmakerName(key)}/>
      </>}

      {/* Dyscypliny */}
      {stats.bySport.length > 1 && <>
        <div style={sectionTitle}>{t("bet.bySport", "Dyscypliny")}</div>
        <BreakdownTable rows={stats.bySport} labelFor={(key) => sportLabel(key, lang)}/>
      </>}

      {/* Historia */}
      {history.length > 0 && <>
        <div style={sectionTitle}>{t("bet.history", "Historia")}</div>
        <div style={{ ...card, padding: "2px 14px" }}>
          {history.slice(0, historyLimit).map((tx, i) => {
            const b = tx.bet;
            const tr = tx.betTransfer;
            if (tr) {
              return (
                <button key={tx.id} onClick={() => editTransfer(tx)} style={{
                  all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                  borderBottom: i < Math.min(history.length, historyLimit) - 1 ? "1px solid #0f1a2e" : "none",
                }}>
                  {tr.kind === "deposit" ? <ArrowUpRight size={12} color="#60a5fa"/> : <ArrowDownLeft size={12} color="#34d399"/>}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{tr.kind === "deposit" ? t("bet.bank.depositRow", "Wpłata") : t("bet.bank.withdrawRow", "Wypłata na konto")}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{[bookmakerName(tr.bookmaker) || tr.bookmaker, tx.date].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, flexShrink: 0, color: "#94a3b8" }}>{fmtBet(tr.amount, tr.currency)}</span>
                </button>
              );
            }
            const meta = b ? STATUS_META[b.status] : null;
            return (
              <button key={tx.id} onClick={() => b && openEdit(tx)} disabled={!b} style={{
                all: "unset", boxSizing: "border-box", width: "100%", cursor: b ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                borderBottom: i < Math.min(history.length, historyLimit) - 1 ? "1px solid #0f1a2e" : "none",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: meta ? meta.color : "#334155" }} title={meta ? meta.label() : ""}/>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b ? (b.event || bookmakerName(b.bookmaker)) : tx.desc}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b
                      ? [bookmakerName(b.bookmaker), `@ ${Number(b.odds).toFixed(2)}`, `${t("bet.stakeShort", "stawka")} ${fmtBet(b.stake, b.currency)}`, tx.date].filter(Boolean).join(" · ")
                      : `${t("bet.manualEntry", "Wpis ręczny")} · ${tx.date}`}
                  </span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, flexShrink: 0, color: tx.amount > 0 ? "#34d399" : tx.amount < 0 ? "#f87171" : "#94a3b8" }}>
                  {fmtDisplay(txAmountForDisplay(tx), { showSign: true })}
                </span>
              </button>
            );
          })}
        </div>
        {history.length > historyLimit && (
          <button onClick={() => setHistoryLimit(n => n + 30)} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #1a2744", borderRadius: 10, padding: 10, color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {t("common.showMore", "Pokaż więcej")}
          </button>
        )}
      </>}

      {/* Odpowiedzialna gra */}
      <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55, textAlign: "center", margin: "26px 8px 8px" }}>
        {t("bet.responsible", "Sidegig tylko zapisuje wyniki — nie przyjmuje zakładów. Jeśli granie przestaje być zabawą, poszukaj wsparcia:")}{" "}
        <a {...linkProps("https://www.begambleaware.org")} style={{ color: "#64748b" }}>BeGambleAware.org</a>
      </div>

      {/* Formularz kuponu */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.editingId != null ? t("bet.editTitle", "Edytuj kupon") : t("bet.newTitle", "Nowy kupon")}>
        {form && <>
          {form.editingId == null && lastBet && (
            <button type="button" onClick={repeatLast} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "9px 12px", borderRadius: 10,
              background: ACCENT + "14", border: `1px solid ${ACCENT}44`, color: "#cbd5e1", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
              <RotateCcw size={13} color={ACCENT}/>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t("bet.repeatLast", "Jak ostatnio")}: {[bookmakerName(lastBet.bet.bookmaker), fmtBet(lastBet.bet.stake, lastBet.bet.currency), sportLabel(lastBet.bet.sport, lang)].filter(Boolean).join(" · ")}
              </span>
            </button>
          )}
          <div style={fieldLabel}>{t("bet.bookmaker", "Bukmacher")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {recentBookmakers.map(id => (
              <Chip key={id} on={!form.custom && form.bookmaker === id} color={ACCENT} onClick={() => pickBookmaker(id)}>{bookmakerName(id)}</Chip>
            ))}
            <Chip on={form.custom} color={ACCENT} onClick={() => setF({ custom: true, bookmaker: "", taxed: false })}>{t("bet.otherBookmaker", "Inny…")}</Chip>
          </div>
          {form.custom ? (
            <Input placeholder={t("bet.bookmakerName", "Nazwa bukmachera")} value={form.bookmaker} onChange={e => setF({ bookmaker: e.target.value })}/>
          ) : (
            <Select value={form.bookmaker} onChange={e => pickBookmaker(e.target.value)}>
              <option value="">{t("bet.pickBookmaker", "Wybierz z listy…")}</option>
              <optgroup label={t("bet.group.local", "Popularni u Ciebie")}>
                {marketBookmakers(lang).map(id => <option key={id} value={id}>{bookmakerName(id)}</option>)}
              </optgroup>
              <optgroup label={t("bet.group.all", "Wszyscy")}>
                {BOOKMAKERS.filter(b => !marketBookmakers(lang).includes(b.id)).sort((a, b) => a.name.localeCompare(b.name)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </optgroup>
            </Select>
          )}

          <Input label={t("bet.event", "Zdarzenie")} placeholder={t("bet.eventPh", "np. Real – Barcelona, AKO x3")} value={form.event} onChange={e => setF({ event: e.target.value })}/>

          <div style={fieldLabel}>{t("bet.sport", "Dyscyplina")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {SPORTS.map(s => <Chip key={s.id} on={form.sport === s.id} color={ACCENT} onClick={() => setF({ sport: s.id })}>{s.label[lang] || s.label.en}</Chip>)}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Input label={t("bet.odds", "Kurs")} type="number" inputMode="decimal" step="0.01" placeholder="2.10" value={form.odds} onChange={e => setF({ odds: e.target.value })}/></div>
            <div style={{ flex: 1.3 }}><Input label={t("bet.stake", "Stawka")} type="number" inputMode="decimal" step="0.01" placeholder="20" value={form.stake} onChange={e => setF({ stake: e.target.value })}/></div>
            <div style={{ flex: 0.9 }}>
              <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          {(form.taxed || (lang === "pl" && isPolishBookmaker(form.bookmaker)) || form.currency === "PLN") && (
            <button type="button" role="checkbox" aria-checked={form.taxed} onClick={() => setF({ taxed: !form.taxed })} style={{
              width: "100%", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, padding: "10px 12px",
              background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, cursor: "pointer", textAlign: "left",
              color: "#cbd5e1", fontSize: 12, lineHeight: 1.45, fontFamily: "inherit",
            }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${form.taxed ? "#10b981" : "#475569"}`, background: form.taxed ? "#10b981" : "transparent", display: "grid", placeItems: "center" }}>
                {form.taxed && <Check size={12} color="white" strokeWidth={3}/>}
              </span>
              <span>{t("bet.taxToggle", "Podatek PL: 12% od stawki, 10% od wygranej powyżej 2280 zł")}</span>
            </button>
          )}

          {num(form.stake) > 0 && num(form.odds) >= 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "-4px 0 14px", fontSize: 12, color: "#64748b" }}>
              <span>{t("bet.potential", "Możliwa wypłata")}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#34d399" }}>{fmtBet(potential, form.currency)}</span>
            </div>
          )}

          <div style={fieldLabel}>{t("bet.statusLabel", "Status")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {Object.keys(STATUS_META).map(s => (
              <Chip key={s} on={form.status === s} color={STATUS_META[s].color} onClick={() => setF({ status: s, payoutTouched: false })}>{STATUS_META[s].label()}</Chip>
            ))}
          </div>

          {usesPayout(form.status) && (
            <Input label={t("bet.payout", "Wypłata")} type="number" inputMode="decimal" step="0.01" value={form.payout}
              onChange={e => setForm(f => ({ ...f, payout: e.target.value, payoutTouched: true }))}/>
          )}

          <Input label={t("tx.date", "Data")} type="date" value={form.date} onChange={e => setF({ date: e.target.value })}/>

          <button onClick={save} disabled={saving} style={{ width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
          </button>
          {form.editingId != null && (
            <button onClick={remove} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #7f1d1d", borderRadius: 12, padding: 12, color: "#f87171", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Trash2 size={14}/> {t("bet.delete", "Usuń kupon")}
            </button>
          )}
        </>}
      </Modal>

      {/* Rozliczenie z wypłatą (wygrany / zwrot / cash-out) */}
      <Modal open={!!settle} onClose={() => setSettle(null)} title={settle ? STATUS_META[settle.status].label() : ""}>
        {settle && <>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
            {settle.tx.bet.event || bookmakerName(settle.tx.bet.bookmaker)} · {t("bet.stakeShort", "stawka")} {fmtBet(settle.tx.bet.stake, settle.tx.bet.currency)}
          </div>
          <Input label={`${t("bet.payout", "Wypłata")} (${settle.tx.bet.currency})`} type="number" inputMode="decimal" step="0.01" autoFocus
            value={settle.payout} onChange={e => setSettle(s => ({ ...s, payout: e.target.value }))}/>
          <button onClick={() => {
            const p = num(settle.payout);
            if (!isFinite(p) || p < 0) { showToast(t("bet.err.payout", "Wpisz wypłatę"), "error"); return; }
            settleNow(settle.tx, settle.status, p);
          }} style={{ width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {t("bet.settle", "Rozlicz")}
          </button>
        </>}
      </Modal>

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title={transfer?.kind === "deposit" ? t("bet.transfer.depositTitle", "Wpłata u bukmachera") : t("bet.transfer.withdrawTitle", "Wypłata od bukmachera")}>
        {transfer && <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Chip on={transfer.kind === "deposit"} color="#60a5fa" onClick={() => setTransfer(x => ({ ...x, kind: "deposit" }))}>{t("bet.bank.deposit", "Wpłać")}</Chip>
            <Chip on={transfer.kind === "withdraw"} color="#34d399" onClick={() => setTransfer(x => ({ ...x, kind: "withdraw" }))}>{t("bet.bank.withdraw", "Wypłać")}</Chip>
          </div>
          <div style={fieldLabel}>{t("bet.bookmaker", "Bukmacher")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {recentBookmakers.map(id => (
              <Chip key={id} on={!transfer.custom && transfer.bookmaker === id} color={ACCENT} onClick={() => setTransfer(x => ({ ...x, bookmaker: id, custom: false, currency: lang === "pl" && isPolishBookmaker(id) ? "PLN" : x.currency }))}>{bookmakerName(id)}</Chip>
            ))}
            <Chip on={transfer.custom} color={ACCENT} onClick={() => setTransfer(x => ({ ...x, custom: true, bookmaker: "" }))}>{t("bet.otherBookmaker", "Inny…")}</Chip>
          </div>
          {transfer.custom && <Input placeholder={t("bet.bookmakerName", "Nazwa bukmachera")} value={transfer.bookmaker} onChange={e => setTransfer(x => ({ ...x, bookmaker: e.target.value }))}/>}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.4 }}><Input label={t("bet.transfer.amount", "Kwota")} type="number" inputMode="decimal" step="0.01" value={transfer.amount} onChange={e => setTransfer(x => ({ ...x, amount: e.target.value }))}/></div>
            <div style={{ flex: 1 }}>
              <Select label={t("tx.currency", "Waluta")} value={transfer.currency} onChange={e => setTransfer(x => ({ ...x, currency: e.target.value }))}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <Input label={t("tx.date", "Data")} type="date" value={transfer.date} onChange={e => setTransfer(x => ({ ...x, date: e.target.value }))}/>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 14, lineHeight: 1.45 }}>
            {t("bet.transfer.hint", "Wpłaty i wypłaty nie zmieniają wyniku zakładów — to tylko przesunięcie pieniędzy między Tobą a bukmacherem.")}
          </div>
          <button onClick={saveTransfer} disabled={saving} style={{ width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
          </button>
          {transfer.editingId != null && (
            <button onClick={removeTransfer} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #7f1d1d", borderRadius: 12, padding: 12, color: "#f87171", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Trash2 size={14}/> {t("common.delete", "Usuń")}
            </button>
          )}
        </>}
      </Modal>

      <Modal open={!!afterWin} onClose={() => setAfterWin(null)} title={t("bet.afterWin.title", "Co robisz z wygraną?")}>
        {afterWin && <>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 16 }}>
            {t("bet.afterWin.text", "Wygrana {amount} czeka u bukmachera {bookmaker}.").replace("{amount}", fmtBet(afterWin.payout, afterWin.currency)).replace("{bookmaker}", bookmakerName(afterWin.bookmaker) || afterWin.bookmaker || "")}
          </div>
          <button onClick={() => { const w = afterWin; setAfterWin(null); openTransfer("withdraw", { bookmaker: w.bookmaker, amount: String(w.payout), currency: w.currency, custom: !!w.bookmaker && !BOOKMAKERS.some(b => b.id === w.bookmaker) }); }}
            style={{ width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {t("bet.afterWin.withdraw", "Wypłacam")}
          </button>
          <button onClick={() => setAfterWin(null)} style={{ width: "100%", marginTop: 8, background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: 12, color: "#cbd5e1", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            {t("bet.afterWin.keep", "Gram dalej")}
          </button>
          <button onClick={() => { try { localStorage.setItem("ft_bet_ask_withdraw", "0"); } catch { /* ignoruj */ } setAfterWin(null); }}
            style={{ width: "100%", marginTop: 6, background: "none", border: "none", color: "#475569", fontSize: 12, cursor: "pointer", padding: 8, fontFamily: "inherit" }}>
            {t("bet.afterWin.dontAsk", "Nie pytaj więcej")}
          </button>
        </>}
      </Modal>

      {limitOpen && (
        <AmountModal title={t("bet.limit.modalTitle", "Miesięczny limit strat")}
          desc={t("bet.limit.desc", "Ile najwyżej chcesz stracić na zakładach w miesiącu? Pokażemy, ile zostało, i ostrzeżemy przed przekroczeniem.")}
          label={t("bet.limit.amount", "Limit na miesiąc")} value={lossLimit}
          onSave={(m) => onLossLimitChange && onLossLimitChange(m)} onClear={() => onLossLimitChange && onLossLimitChange(null)}
          onClose={() => setLimitOpen(false)}/>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

function BreakdownTable({ rows, labelFor }) {
  return (
    <div style={{ ...card, padding: "4px 14px" }}>
      {rows.map((r, i) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < rows.length - 1 ? "1px solid #0f1a2e" : "none" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelFor(r.key)}</span>
            <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
              {r.count} · {t("bet.turnover", "Obrót")} {fmtDisplay(r.turnover)}
            </span>
          </span>
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: r.net >= 0 ? "#34d399" : "#f87171" }}>{fmtDisplay(r.net, { showSign: true })}</span>
            <span style={{ display: "block", fontSize: 10, color: "#64748b", marginTop: 2 }}>ROI {pct(r.roi, true)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export { BettingView };

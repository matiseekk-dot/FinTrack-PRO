import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Trash2, Repeat, Ticket, Search, ArrowRightLeft } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import { card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, Chip, Stat, CheckRow, ModuleHeader, PeriodChips, num } from "../components/ModuleUI.jsx";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { MODULES, SIDE_MODULES, getModule, isCapitalFlow, moduleLabel } from "../lib/modules.js";
import { getDisplayCurrency, txAmountForDisplay, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { getCat } from "../constants.js";
import {
  SUB_KINDS, subKind, subKindLabel, addCycle, monthlyCost, daysUntil, subscriptionState, buildSubscriptionTx,
} from "../lib/subscriptions.js";
import { moveCandidates, guessHobby } from "../lib/hobbyMove.js";
import { txMatchesHobby } from "../lib/hobby.js";

// Na co poszły pieniądze — te same kategorie co w formularzu wpisu
const HOBBY_CATS = ["subskrypcje", "wydarzenia", "kino", "gry", "sport", "muzyka", "rozrywka"];

const ACCENT = MODULES.hobby.color;

/**
 * Hobby i subskrypcje: ile kosztują pasje, które nie zarabiają. Subskrypcje przypominają
 * o płatności (zapis po potwierdzeniu), jednorazowe wydatki to zwykłe wpisy modułu.
 */
function HobbyCostsView({ transactions = [], setTransactions, setAccounts, defaultAcc = 1, hobbies = [], setHobbies, collectionItems = [], modules = [],
  subscriptions = [], setSubscriptions, onBack, onAddExpense, addSignal = 0, openAdd = false, month = null, onMonthChange,
  moveFor = null, onMoveHandled }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const ym = month || today.slice(0, 7);
  const [chooser, setChooser] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // ── Przenoszenie starych wpisów ─────────────────────────────────────
  const [move, setMove] = useState(null); // { hobbyId, picks: { [key]: { on, cat, makeSub } } }
  const [moveQuery, setMoveQuery] = useState("");
  // Zakupy podpięte pod pozycje katalogu Kolekcji to kolekcja, nie hobby — nie proponujemy ich
  const catalogTxIds = useMemo(() => new Set(collectionItems.filter(i => i.buyTxId != null).map(i => i.buyTxId)), [collectionItems]);
  const allCandidates = useMemo(() => moveCandidates(transactions, hobbies, today, null, catalogTxIds), [transactions, hobbies, today, catalogTxIds]);
  const candidates = useMemo(() => move ? moveCandidates(transactions, hobbies, today, move.hobbyId, catalogTxIds) : [], [move?.hobbyId, transactions, hobbies, today, catalogTxIds]);
  const suggested = allCandidates.filter(g => g.recurring || g.cat === "subskrypcje");
  const openMove = (hobbyId = null) => {
    const list = moveCandidates(transactions, hobbies, today, hobbyId, catalogTxIds);
    const picks = {};
    for (const g of list) {
      // Z kolekcji „to nie kolekcja” — zaznaczamy wszystko; ogólnie — tylko oczywiste subskrypcje
      const on = hobbyId != null || !!g.recurring || g.cat === "subskrypcje";
      picks[g.key] = { on, cat: g.cat, makeSub: !!g.recurring && !subscriptions.some(x => x.name.toLowerCase() === g.label.toLowerCase()) };
    }
    setMoveQuery("");
    setMove({ hobbyId, picks });
  };
  // Wejście z Kolekcji („Przenieś do Hobby”)
  useEffect(() => {
    if (moveFor == null) return;
    openMove(moveFor === "all" ? null : moveFor);
    if (onMoveHandled) onMoveHandled();
  }, [moveFor]);
  const setPick = (key, patch) => setMove(m => ({ ...m, picks: { ...m.picks, [key]: { ...m.picks[key], ...patch } } }));

  const applyMove = () => {
    const chosen = candidates.filter(g => move.picks[g.key]?.on);
    const count = chosen.reduce((s, g) => s + g.count, 0);
    if (!count) return;
    if (!window.confirm(t("move.confirm", "Przenieść do modułu Hobby i subskrypcje wpisy: {n}?").replace("{n}", count))) return;
    const info = new Map();
    const newSubs = [];
    for (const g of chosen) {
      const p = move.picks[g.key];
      // Subskrypcja o tej samej nazwie już jest — stare płatności dołączają do jej historii
      const existing = subscriptions.find(x => x.name.trim().toLowerCase() === g.label.trim().toLowerCase());
      let subId = existing ? existing.id : null;
      if (!existing && p.makeSub && g.recurring) {
        subId = newId();
        newSubs.push({ id: subId, name: g.label, kind: g.kind, amount: g.recurring.amount, currency: g.recurring.currency, cycle: g.recurring.cycle, nextDate: g.recurring.nextDate, trial: false, active: true, createdAt: today });
      }
      for (const tx of g.txs) info.set(tx.id, { cat: p.cat, subId });
    }
    setTransactions(prev => prev.map(tx => {
      const i = info.get(tx.id);
      return i ? { ...tx, module: "hobby", cat: i.cat, ...(i.subId ? { subscriptionId: i.subId } : {}) } : tx;
    }));
    if (newSubs.length) setSubscriptions(prev => [...prev, ...newSubs]);
    // Stara „kolekcja”, w której nic już nie zostało (ani wpisów, ani pozycji katalogu), znika z Kolekcji
    const touched = new Set(chosen.flatMap(g => g.collectionIds));
    if (touched.size && setHobbies) {
      const empty = new Set([...touched].filter(id => {
        const h = hobbies.find(x => x.id === id);
        return h && !collectionItems.some(it => it.hobbyId === id) && !transactions.some(tx => !info.has(tx.id) && txMatchesHobby(tx, h));
      }));
      if (empty.size) setHobbies(prev => prev.map(h => empty.has(h.id) ? { ...h, movedToHobby: true } : h));
    }
    showToast(t("move.toast", "Przeniesione wpisy: {n}{subs}").replace("{n}", count)
      .replace("{subs}", newSubs.length ? t("move.toastSubs", " · nowe subskrypcje: {n}").replace("{n}", newSubs.length) : ""));
    setMove(null);
  };

  // Przycisk + z paska / skrót: wybór „subskrypcja czy wydatek”
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) setChooser(true); }, [addSignal]);

  const monthEntries = useMemo(() => transactions
    .filter(tx => tx && (tx.date || "").startsWith(ym) && getModule(tx, hobbies) === "hobby" && tx.amount < 0)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")), [transactions, hobbies, ym]);
  const spent = monthEntries.reduce((s, tx) => s - txAmountForDisplay(tx), 0);
  const byCat = useMemo(() => {
    const m = {};
    for (const tx of monthEntries) m[tx.cat] = (m[tx.cat] || 0) - txAmountForDisplay(tx);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [monthEntries]);

  // Dochód poboczny w tym miesiącu — ile z niego „opłaca” hobby
  const sideNet = useMemo(() => transactions.reduce((s, tx) => {
    if (!tx || !(tx.date || "").startsWith(ym) || tx.cat === "inne" || isCapitalFlow(tx)) return s;
    const mod = getModule(tx, hobbies);
    return SIDE_MODULES.includes(mod) && modules.includes(mod) ? s + txAmountForDisplay(tx) : s;
  }, 0), [transactions, hobbies, modules, ym, getDisplayCurrency()]);

  const active = subscriptions.filter(x => x.active).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const inactive = subscriptions.filter(x => !x.active);
  const due = active.filter(x => subscriptionState(x, today) === "due");
  const perMonth = active.reduce((s, x) => s + monthlyCost(x), 0);
  // Aktywne subskrypcje według rodzaju (najdroższe rodzaje na górze)
  const byKind = useMemo(() => {
    const m = new Map();
    for (const x of active) {
      const k = x.kind || "other";
      const g = m.get(k) || { kind: k, subs: [], monthly: 0 };
      g.subs.push(x); g.monthly += monthlyCost(x);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.monthly - a.monthly);
  }, [subscriptions]);
  // Kilka usług tego samego rodzaju (np. 3 serwisy z filmami) — warto sprawdzić, czy wszystkie są potrzebne
  const overlaps = byKind.filter(g => g.kind !== "other" && g.subs.length >= 2);

  // ── Subskrypcje ─────────────────────────────────────────────────────
  const blank = () => ({ editingId: null, name: "", kind: "other", kindTouched: false, amount: "", currency: getDisplayCurrency(), cycle: "month", nextDate: today, trial: false, active: true });
  const fromSub = (x) => ({ editingId: x.id, name: x.name, kind: x.kind || "other", kindTouched: true, amount: String(x.amount), currency: x.currency || "PLN", cycle: x.cycle || "month", nextDate: x.nextDate, trial: !!x.trial, active: !!x.active });
  // „Spotify” → Muzyka, „ChatGPT” → AI: rodzaj ustawia się sam, dopóki nie wybierzesz go ręcznie
  const kindFromName = (name) => { const g = guessHobby(name); return (g && g.kind) || "other"; };
  const setF = (patch) => setForm(f => ({ ...f, ...patch }));

  const saveSub = () => {
    const name = form.name.trim();
    const amount = num(form.amount);
    if (!name) { showToast(t("sub.err.name", "Wpisz nazwę"), "error"); return; }
    if (!isFinite(amount) || amount <= 0) { showToast(t("sub.err.amount", "Wpisz cenę"), "error"); return; }
    const old = form.editingId != null ? subscriptions.find(x => x.id === form.editingId) : null;
    const sub = { ...(old || {}), id: old ? old.id : newId(), name, kind: form.kind, amount, currency: form.currency, cycle: form.cycle, nextDate: form.nextDate, trial: !!form.trial, active: !!form.active, createdAt: old?.createdAt || today };
    setSubscriptions(prev => old ? prev.map(x => x.id === sub.id ? sub : x) : [...prev, sub]);
    showToast(old ? t("sub.toast.saved", "Zapisano ✓") : t("sub.toast.added", "Subskrypcja dodana ✓"));
    setForm(null);
  };
  const deleteSub = () => {
    if (!window.confirm(t("sub.confirmDelete", "Usunąć subskrypcję? Zapisane płatności zostaną w Wpisach."))) return;
    setSubscriptions(prev => prev.filter(x => x.id !== form.editingId));
    setForm(null);
  };

  // Płatność potwierdzona: wpis za ten termin + następny termin (okres próbny się kończy)
  const confirmPaid = async (sub) => {
    if (saving) return;
    setSaving(true);
    try {
      const rate = await rateOnDate(sub.currency || "PLN", sub.nextDate);
      const tx = buildSubscriptionTx(sub, { rate, acc: defaultAcc });
      commitTxChanges({ setTransactions, setAccounts }, { add: [tx] });
      setSubscriptions(prev => prev.map(x => x.id === sub.id ? { ...x, nextDate: addCycle(x.nextDate, x.cycle), trial: false } : x));
      showToast(t("sub.toast.paid", "{name}: płatność zapisana ✓").replace("{name}", sub.name));
    } finally {
      setSaving(false);
    }
  };
  const cancelSub = (sub) => {
    setSubscriptions(prev => prev.map(x => x.id === sub.id ? { ...x, active: false } : x));
    showToast(t("sub.toast.cancelled", "{name}: oznaczone jako anulowane").replace("{name}", sub.name));
  };

  const cycleLabel = (c) => c === "year" ? t("sub.cycle.year", "rok") : c === "week" ? t("sub.cycle.week", "tydzień") : t("sub.cycle.month", "mies.");
  const whenLabel = (sub) => {
    const d = daysUntil(sub.nextDate, today);
    if (d < 0) return t("sub.when.overdue", "termin minął {date}").replace("{date}", sub.nextDate);
    if (d === 0) return t("sub.when.today", "dziś");
    if (d === 1) return t("sub.when.tomorrow", "jutro");
    return t("sub.when.inDays", "za {n} dni").replace("{n}", d);
  };

  const subRow = (sub, i, arr) => {
    const k = subKind(sub.kind);
    const st = subscriptionState(sub, today);
    return (
      <button key={sub.id} onClick={() => setForm(fromSub(sub))} style={{
        all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none", opacity: sub.active ? 1 : 0.55,
      }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: k.color + "22", border: `1px solid ${k.color}55`, display: "grid", placeItems: "center" }}>
          <k.icon size={15} color={k.color}/>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
            {sub.trial && sub.active && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "#fbbf2422", color: "#fbbf24", flexShrink: 0 }}>{t("sub.trialBadge", "PRÓBNY")}</span>}
          </span>
          <span style={{ display: "block", fontSize: 11, color: st === "due" ? "#f87171" : st === "soon" ? "#fbbf24" : "#64748b", marginTop: 2 }}>
            {sub.active ? `${sub.trial ? t("sub.trialEnds", "koniec próbnego") : t("sub.next", "płatność")} ${whenLabel(sub)}` : t("sub.inactive", "anulowana")}
          </span>
        </span>
        <span style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{fmtCurrency(sub.amount, sub.currency || "PLN")}</span>
          <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>/ {cycleLabel(sub.cycle)}</span>
        </span>
      </button>
    );
  };

  const coverage = spent > 0 && sideNet > 0 ? sideNet / spent : null;

  return (
    <div style={{ padding: "0 16px" }}>
      <ModuleHeader Icon={Ticket} color={ACCENT} title={moduleLabel("hobby", lang)} onBack={onBack} addLabel={t("common.add", "Dodaj")} onAdd={() => setChooser(true)}/>

      <PeriodChips monthOnly month={ym} onMonthChange={onMonthChange}/>

      <div style={heroCard}>
        <div style={heroLabel}>{t("home.hobbySpent", "Wydane na hobby")}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 800, color: "#e2e8f0", marginTop: 4, letterSpacing: "-0.02em" }}>{fmtDisplay(spent)}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Stat label={t("sub.perMonth", "Subskrypcje / mies.")} value={fmtDisplay(perMonth)}/>
          <Stat label={t("sub.perYear", "Subskrypcje / rok")} value={fmtDisplay(perMonth * 12)}/>
          <Stat label={t("sub.count", "Aktywne")} value={String(active.length)}/>
        </div>
        {coverage != null && (
          <div style={{ fontSize: 12, color: coverage >= 1 ? "#34d399" : "#94a3b8", marginTop: 12, lineHeight: 1.45 }}>
            {coverage >= 1
              ? t("sub.coverageFull", "Dochód poboczny w tym miesiącu w całości opłaca Twoje hobby.")
              : t("sub.coverage", "Dochód poboczny pokrywa {pct}% kosztów hobby w tym miesiącu.").replace("{pct}", Math.round(coverage * 100))}
          </div>
        )}
      </div>

      {due.length > 0 && <>
        <div style={sectionTitle}>{t("sub.dueTitle", "Do potwierdzenia")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {due.map(sub => (
            <div key={sub.id} style={{ ...card, padding: 14, borderColor: "#7f1d1d" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{sub.name}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmtCurrency(sub.amount, sub.currency || "PLN")}</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {(sub.trial ? t("sub.dueTrial", "Okres próbny skończył się {date}. Płacisz dalej?") : t("sub.dueText", "Termin płatności: {date}")).replace("{date}", sub.nextDate)}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button onClick={() => confirmPaid(sub)} disabled={saving} style={{ flex: 1, background: "#10b98118", border: "1px solid #10b98155", color: "#34d399", borderRadius: 9, padding: "8px 4px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <Check size={12}/> {t("sub.paid", "Zapłacone")}
                </button>
                <button onClick={() => cancelSub(sub)} style={{ flex: 1, background: "#ef444418", border: "1px solid #ef444455", color: "#f87171", borderRadius: 9, padding: "8px 4px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <X size={12}/> {t("sub.cancelled", "Anulowałem")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </>}

      <div style={sectionTitle}>{t("sub.listTitle", "Subskrypcje")}</div>
      {active.length === 0 ? (
        <button onClick={() => setForm(blank())} style={{ width: "100%", background: "none", border: "1px dashed #1a2744", borderRadius: 14, padding: 14, color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.5 }}>
          {t("sub.empty", "Dodaj Netflixa, Spotify, ChatGPT albo siłownię — przypomnimy o płatności i pokażemy, ile to kosztuje rocznie.")}
        </button>
      ) : (
        <div style={{ ...card, padding: "2px 14px" }}>{active.map(subRow)}</div>
      )}
      {overlaps.map(g => {
        const k = subKind(g.kind);
        const priciest = [...g.subs].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];
        return (
          <div key={g.kind} style={{ ...card, marginTop: 10, padding: "11px 14px", background: "#fbbf2410", borderColor: "#fbbf2455", display: "flex", gap: 10 }}>
            <k.icon size={16} color={k.color} style={{ flexShrink: 0, marginTop: 1 }}/>
            <div style={{ flex: 1, fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700 }}>
                {t("sub.overlap", "{kind}: {n}× — {amount}/mies.").replace("{kind}", subKindLabel(g.kind, lang)).replace("{n}", g.subs.length).replace("{amount}", fmtDisplay(g.monthly))}
              </div>
              <div style={{ color: "#94a3b8" }}>{g.subs.map(x => x.name).join(", ")}</div>
              <div style={{ color: "#fbbf24", marginTop: 3 }}>
                {t("sub.overlapSave", "Korzystasz ze wszystkich? Bez {name} zostaje Ci {amount} rocznie.").replace("{name}", priciest.name).replace("{amount}", fmtDisplay(monthlyCost(priciest) * 12))}
              </div>
            </div>
          </div>
        );
      })}

      {byKind.length >= 2 && <>
        <div style={sectionTitle}>{t("sub.byKind", "Subskrypcje według rodzaju")}</div>
        <div style={{ ...card, padding: "4px 14px" }}>
          {byKind.map((g, i) => {
            const k = subKind(g.kind);
            return (
              <div key={g.kind} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < byKind.length - 1 ? "1px solid #0f1a2e" : "none" }}>
                <k.icon size={14} color={k.color}/>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{subKindLabel(g.kind, lang)}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{g.subs.length}×</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, minWidth: 90, textAlign: "right" }}>{fmtDisplay(g.monthly)}<span style={{ fontSize: 10, color: "#64748b", fontWeight: 400 }}> /{t("sub.cycle.month", "mies.")}</span></span>
              </div>
            );
          })}
        </div>
      </>}

      {allCandidates.length > 0 && (
        <button onClick={() => openMove(null)} style={{
          all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginTop: 10, padding: "11px 14px", borderRadius: 12,
          background: ACCENT + "12", border: `1px solid ${ACCENT}44`, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45,
        }}>
          <ArrowRightLeft size={15} color={ACCENT} style={{ flexShrink: 0 }}/>
          <span style={{ flex: 1 }}>
            {suggested.length > 0
              ? t("move.suggest", "Stare wpisy wyglądające na subskrypcje: {list}. Przenieś je tutaj.").replace("{list}", suggested.slice(0, 3).map(g => g.label).join(", "))
              : t("move.cta", "Przenieś stare wpisy (np. dawne wydatki osobiste) do Hobby")}
          </span>
        </button>
      )}
      {inactive.length > 0 && (
        <button onClick={() => setShowInactive(v => !v)} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 6, fontFamily: "inherit" }}>
          {showInactive ? t("sub.hideInactive", "Ukryj anulowane") : t("sub.showInactive", "Anulowane: {n}").replace("{n}", inactive.length)}
        </button>
      )}
      {showInactive && inactive.length > 0 && <div style={{ ...card, padding: "2px 14px" }}>{inactive.map(subRow)}</div>}

      {byCat.length > 0 && <>
        <div style={sectionTitle}>{t("sub.byCat", "Na co w tym miesiącu")}</div>
        <div style={{ ...card, padding: "10px 14px" }}>
          {byCat.map(([cat, val]) => {
            const c = getCat(cat);
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{c.label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmtDisplay(val)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "#060b14" }}>
                  <div style={{ width: `${spent > 0 ? (val / spent) * 100 : 0}%`, height: "100%", borderRadius: 2, background: c.color || ACCENT, opacity: 0.8 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {monthEntries.length > 0 && <>
        <div style={sectionTitle}>{t("sub.monthEntries", "Wpisy w tym miesiącu")}</div>
        <div style={{ ...card, padding: "2px 14px", marginBottom: 20 }}>
          {monthEntries.slice(0, 30).map((tx, i, arr) => (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || "—"}</span>
                <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{tx.date} · {getCat(tx.cat).label}</span>
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                {tx.origCurrency && tx.origAmount != null ? fmtCurrency(-Math.abs(tx.origAmount), tx.origCurrency) : fmtCurrency(tx.amount, "PLN")}
              </span>
            </div>
          ))}
        </div>
      </>}

      {/* Co dodać */}
      <Modal open={chooser} onClose={() => setChooser(false)} title={t("sub.chooserTitle", "Co dodajesz?")}>
        <button onClick={() => { setChooser(false); setForm(blank()); }} style={{ ...card, width: "100%", padding: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#e2e8f0", display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
          <Repeat size={18} color={ACCENT}/>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{t("sub.chooserSub", "Subskrypcja")}</span>
            <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{t("sub.chooserSubDesc", "Netflix, Spotify, AI, siłownia — płacisz co miesiąc lub co rok")}</span>
          </span>
        </button>
        <button onClick={() => { setChooser(false); onAddExpense && onAddExpense(); }} style={{ ...card, width: "100%", padding: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
          <Ticket size={18} color={ACCENT}/>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{t("sub.chooserOnce", "Jednorazowy wydatek")}</span>
            <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{t("sub.chooserOnceDesc", "Koncert, kino, gra, bilet na mecz")}</span>
          </span>
        </button>
      </Modal>

      {/* Formularz subskrypcji */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.editingId != null ? t("sub.editTitle", "Subskrypcja") : t("sub.newTitle", "Nowa subskrypcja")}>
        {form && <>
          <Input label={t("sub.name", "Nazwa")} placeholder="Netflix" value={form.name} onChange={e => { const name = e.target.value; setF(form.kindTouched ? { name } : { name, kind: kindFromName(name) }); }}/>
          <div style={fieldLabel}>{t("sub.kind", "Rodzaj")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {SUB_KINDS.map(k => <Chip key={k.id} on={form.kind === k.id} color={k.color} onClick={() => setF({ kind: k.id, kindTouched: true })}>{subKindLabel(k.id, lang)}</Chip>)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.4 }}><Input label={t("sub.price", "Cena")} type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setF({ amount: e.target.value })}/></div>
            <div style={{ flex: 1 }}>
              <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <div style={fieldLabel}>{t("sub.cycleLabel", "Płacisz")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[["month", t("sub.cycle.monthly", "Co miesiąc")], ["year", t("sub.cycle.yearly", "Co rok")], ["week", t("sub.cycle.weekly", "Co tydzień")]].map(([id, label]) => (
              <Chip key={id} on={form.cycle === id} color={ACCENT} onClick={() => setF({ cycle: id })}>{label}</Chip>
            ))}
          </div>
          <Input label={form.trial ? t("sub.trialEnd", "Koniec okresu próbnego") : t("sub.nextDate", "Następna płatność")} type="date" value={form.nextDate} onChange={e => setF({ nextDate: e.target.value })}/>
          <CheckRow checked={form.trial} onChange={(v) => setF({ trial: v })}>
            {t("sub.trialToggle", "Okres próbny — przypomnimy 3 dni przed końcem, żebyś zdążył anulować")}
          </CheckRow>
          {form.editingId != null && (
            <CheckRow checked={form.active} onChange={(v) => setF({ active: v })}>{t("sub.activeToggle", "Aktywna (odznacz, jeśli anulowałeś)")}</CheckRow>
          )}
          <button onClick={saveSub} style={primaryBtn}>{t("common.save", "Zapisz")}</button>
          {form.editingId != null && (
            <button onClick={deleteSub} style={dangerBtn}><Trash2 size={14}/> {t("sub.delete", "Usuń subskrypcję")}</button>
          )}
        </>}
      </Modal>

      <Modal open={!!move} onClose={() => setMove(null)} title={t("move.title", "Przenieś stare wpisy")}>
        {move && (() => {
          const q = moveQuery.trim().toLowerCase();
          const shown = candidates.filter(g => !q || g.label.toLowerCase().includes(q)).slice(0, 80);
          const selCount = candidates.filter(g => move.picks[g.key]?.on).reduce((s, g) => s + g.count, 0);
          const fromColl = move.hobbyId != null ? hobbies.find(h => h.id === move.hobbyId) : null;
          return <>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
              {t("move.desc", "Zaznacz wydatki na hobby. Trafią do tego modułu i znikną z Kolekcji oraz ukrytych wydatków osobistych. Płatności, które się powtarzają, od razu zamienisz w subskrypcję.")}
            </div>
            {fromColl && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "#cbd5e1" }}>
                <span style={{ padding: "3px 9px", borderRadius: 8, background: fromColl.color + "22", border: `1px solid ${fromColl.color}55` }}>{t("move.fromCollection", "Kolekcja: {name}").replace("{name}", fromColl.name)}</span>
                <button onClick={() => setMove(m => ({ ...m, hobbyId: null }))} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{t("move.showAll", "pokaż wszystkie")}</button>
              </div>
            )}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={14} color="#475569" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}/>
              <input value={moveQuery} onChange={e => setMoveQuery(e.target.value)} placeholder={t("move.search", "Szukaj, np. Netflix, kino")}
                style={{ width: "100%", boxSizing: "border-box", background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "9px 12px 9px 34px", color: "#e2e8f0", fontSize: 15, outline: "none", fontFamily: "inherit" }}/>
            </div>
            {shown.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b", padding: "10px 2px" }}>{t("move.empty", "Brak pasujących wpisów.")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "48vh", overflowY: "auto", marginBottom: 12 }}>
                {shown.map(g => {
                  const p = move.picks[g.key] || { on: false, cat: g.cat, makeSub: false };
                  const source = g.personal ? t("move.srcPersonal", "wydatki osobiste") : g.collectionIds.map(id => (hobbies.find(h => h.id === id) || {}).name).filter(Boolean).join(", ");
                  return (
                    <div key={g.key} style={{ ...card, background: p.on ? ACCENT + "10" : "#060b14", borderColor: p.on ? ACCENT + "55" : "#1a2744", padding: "10px 12px" }}>
                      <button type="button" role="checkbox" aria-checked={p.on} onClick={() => setPick(g.key, { on: !p.on })} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                        <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${p.on ? ACCENT : "#475569"}`, background: p.on ? ACCENT : "transparent", display: "grid", placeItems: "center" }}>
                          {p.on && <Check size={12} color="white" strokeWidth={3}/>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                          <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {g.count}× · {fmtDisplay(g.total)} · {g.lastDate}{source ? ` · ${source}` : ""}
                          </span>
                        </span>
                      </button>
                      {p.on && <>
                        <select value={p.cat} onChange={e => setPick(g.key, { cat: e.target.value })} style={{ marginTop: 8, width: "100%", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 8, padding: "7px 8px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }}>
                          {HOBBY_CATS.map(c => <option key={c} value={c}>{getCat(c).label}</option>)}
                        </select>
                        {g.recurring && (
                          <CheckRow checked={p.makeSub} onChange={(v) => setPick(g.key, { makeSub: v })} style={{ marginTop: 8, marginBottom: 0 }}>
                            {t("move.makeSub", "Utwórz subskrypcję: {price} / {cycle}, następna płatność {date}")
                              .replace("{price}", fmtCurrency(g.recurring.amount, g.recurring.currency))
                              .replace("{cycle}", cycleLabel(g.recurring.cycle)).replace("{date}", g.recurring.nextDate)}
                          </CheckRow>
                        )}
                      </>}
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={applyMove} disabled={!selCount} style={{ ...primaryBtn, opacity: selCount ? 1 : 0.5, cursor: selCount ? "pointer" : "not-allowed" }}>
              {t("move.apply", "Przenieś ({n})").replace("{n}", selCount)}
            </button>
          </>;
        })()}
      </Modal>

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { HobbyCostsView };

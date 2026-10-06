import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Trash2, Repeat, Ticket } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import { card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, Chip, Stat, CheckRow, ModuleHeader, num } from "../components/ModuleUI.jsx";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { MODULES, SIDE_MODULES, getModule, isCapitalFlow, moduleLabel } from "../lib/modules.js";
import { getDisplayCurrency, txAmountForDisplay, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { getCat } from "../constants.js";
import {
  SUB_KINDS, subKind, subKindLabel, addCycle, monthlyCost, daysUntil, subscriptionState, buildSubscriptionTx,
} from "../lib/subscriptions.js";

const ACCENT = MODULES.hobby.color;

/**
 * Hobby i subskrypcje: ile kosztują pasje, które nie zarabiają. Subskrypcje przypominają
 * o płatności (zapis po potwierdzeniu), jednorazowe wydatki to zwykłe wpisy modułu.
 */
function HobbyCostsView({ transactions = [], setTransactions, setAccounts, defaultAcc = 1, hobbies = [], modules = [],
  subscriptions = [], setSubscriptions, onBack, onAddExpense, addSignal = 0, openAdd = false }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const ym = today.slice(0, 7);
  const [chooser, setChooser] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

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

  // ── Subskrypcje ─────────────────────────────────────────────────────
  const blank = () => ({ editingId: null, name: "", kind: "streaming", amount: "", currency: getDisplayCurrency(), cycle: "month", nextDate: today, trial: false, active: true });
  const fromSub = (x) => ({ editingId: x.id, name: x.name, kind: x.kind || "other", amount: String(x.amount), currency: x.currency || "PLN", cycle: x.cycle || "month", nextDate: x.nextDate, trial: !!x.trial, active: !!x.active });
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

      <div style={heroCard}>
        <div style={heroLabel}>{t("sub.monthSpent", "Hobby w tym miesiącu")}</div>
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
          <Input label={t("sub.name", "Nazwa")} placeholder="Netflix" value={form.name} onChange={e => setF({ name: e.target.value })}/>
          <div style={fieldLabel}>{t("sub.kind", "Rodzaj")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {SUB_KINDS.map(k => <Chip key={k.id} on={form.kind === k.id} color={k.color} onClick={() => setF({ kind: k.id })}>{subKindLabel(k.id, lang)}</Chip>)}
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

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { HobbyCostsView };

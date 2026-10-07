import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Check, Trash2 } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import {
  card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, ModuleHeader, PeriodChips, EmptyCard, inPeriodFn, num,
} from "../components/ModuleUI.jsx";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t } from "../i18n.js";
import { getModule } from "../lib/modules.js";
import { getDisplayCurrency, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import {
  getTaxReservePct, setTaxReservePct, addDays, isOverdue, buildGigTx, freelanceStats,
} from "../lib/freelance.js";

const ACCENT = "#06b6d4";

/**
 * Freelance: zlecenia od wykonania do zapłaty. Niezapłacone nie ruszają salda;
 * „Opłacone” tworzy przychód w Wpisach, więc Start pokazuje tylko realne wpływy.
 */
function FreelanceView({ gigs = [], setGigs, transactions, setTransactions, setAccounts, defaultAcc = 1, hobbies = [],
  onBack, addSignal = 0, openAdd = false, month = null, onMonthChange, focusGigId = null, onFocusHandled }) {
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const [period, setPeriod] = useState("month");
  const [form, setForm] = useState(null);
  const [taxForm, setTaxForm] = useState(null);
  const [taxPct, setTaxPct] = useState(getTaxReservePct);
  const [saving, setSaving] = useState(false);
  const viewMonth = month || today.slice(0, 7);
  const inPeriod = inPeriodFn(period, viewMonth);

  const moduleTxs = useMemo(
    () => transactions.filter(tx => tx && tx.date && getModule(tx, hobbies) === "freelance"),
    [transactions, hobbies]
  );
  const stats = useMemo(
    () => freelanceStats(gigs, moduleTxs, inPeriod, today),
    [gigs, moduleTxs, period, viewMonth, today, getDisplayCurrency()]
  );
  const unpaid = gigs.filter(g => g.status === "unpaid")
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const paid = gigs.filter(g => g.status === "paid" && inPeriod(g.paidDate))
    .sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));

  // Ostatni klienci jako szybkie chipy w formularzu
  const recentClients = useMemo(() => {
    const out = [];
    [...gigs].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach(g => { const c = (g.client || "").trim(); if (c && !out.includes(c)) out.push(c); });
    return out.slice(0, 6);
  }, [gigs]);

  const blankForm = () => ({
    editingId: null, client: "", title: "", amount: "", currency: getDisplayCurrency(), hours: "",
    date: today, status: "unpaid", dueDate: addDays(today, 14), paidDate: today, acc: defaultAcc,
  });
  const formFromGig = (g, patch = {}) => ({
    editingId: g.id, client: g.client || "", title: g.title || "", amount: String(g.amount ?? ""),
    currency: g.currency || "PLN", hours: g.hours ? String(g.hours) : "", date: g.date || today,
    status: g.status, dueDate: g.dueDate || addDays(g.date || today, 14), paidDate: g.paidDate || today,
    acc: g.acc ?? defaultAcc, ...patch,
  });

  // openAdd: ekran otwarty skrótem — formularz od razu
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) setForm(blankForm()); }, [addSignal]);
  useEffect(() => {
    if (focusGigId == null) return;
    const g = gigs.find(x => x.id === focusGigId);
    if (g) setForm(formFromGig(g));
    if (onFocusHandled) onFocusHandled();
  }, [focusGigId]);

  const setF = (patch) => setForm(f => ({ ...f, ...patch }));

  // Zapis zlecenia; opłacone → przychód w Wpisach (podmiana istniejącego wpisu przy edycji)
  const persist = async (f) => {
    const amount = num(f.amount);
    if (!isFinite(amount) || amount <= 0) { showToast(t("gig.err.amount", "Wpisz kwotę"), "error"); return false; }
    if (!f.title.trim() && !f.client.trim()) { showToast(t("gig.err.title", "Wpisz klienta albo opis zlecenia"), "error"); return false; }
    const old = f.editingId != null ? gigs.find(x => x.id === f.editingId) : null;
    const oldTx = old?.txId != null ? transactions.find(tx => tx.id === old.txId) : null;
    const isPaid = f.status === "paid";

    const gig = {
      ...(old || {}),
      id: old ? old.id : newId(), client: f.client.trim(), title: f.title.trim(),
      amount, currency: f.currency, hours: isFinite(num(f.hours)) && num(f.hours) > 0 ? num(f.hours) : null,
      date: f.date, status: f.status,
      dueDate: isPaid ? (old?.dueDate || null) : (f.dueDate || null),
      paidDate: isPaid ? f.paidDate : null,
      acc: parseInt(f.acc) || defaultAcc,
      txId: oldTx ? oldTx.id : null, paidFxRate: null,
      createdAt: old?.createdAt || today,
    };
    setSaving(true);
    try {
      if (isPaid) {
        const reuse = oldTx && oldTx.date === gig.paidDate && (oldTx.origCurrency || "PLN") === gig.currency;
        const rate = reuse ? (oldTx.fxRate || 1) : await rateOnDate(gig.currency, gig.paidDate);
        const tx = buildGigTx(gig, rate);
        gig.txId = tx.id; gig.paidFxRate = tx.fxRate || 1;
        commitTxChanges({ setTransactions, setAccounts }, { add: [tx], remove: oldTx ? [oldTx] : [] });
      } else {
        gig.txId = null;
        if (oldTx) commitTxChanges({ setTransactions, setAccounts }, { remove: [oldTx] });
      }
      setGigs(prev => old ? prev.map(x => x.id === gig.id ? gig : x) : [gig, ...prev]);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form || saving) return;
    const wasPaid = form.editingId != null && gigs.find(x => x.id === form.editingId)?.status === "paid";
    if (await persist(form)) {
      showToast(form.status === "paid" && !wasPaid ? t("gig.toast.paid", "Opłacone — przychód zapisany ✓")
        : form.editingId != null ? t("gig.toast.updated", "Zapisano ✓") : t("gig.toast.added", "Zlecenie dodane ✓"));
      setForm(null);
    }
  };

  const markPaid = async (g) => {
    if (saving) return;
    if (await persist(formFromGig(g, { status: "paid", paidDate: today }))) showToast(t("gig.toast.paid", "Opłacone — przychód zapisany ✓"));
  };

  const remove = () => {
    const old = gigs.find(x => x.id === form?.editingId);
    if (!old || !window.confirm(t("gig.confirmDelete", "Usunąć zlecenie? Jeśli było opłacone, usuniemy też przychód z Wpisów."))) return;
    const oldTx = old.txId != null ? transactions.find(tx => tx.id === old.txId) : null;
    if (oldTx) commitTxChanges({ setTransactions, setAccounts }, { remove: [oldTx] });
    setGigs(prev => prev.filter(x => x.id !== old.id));
    showToast(t("gig.toast.deleted", "Zlecenie usunięte"), "error");
    setForm(null);
  };

  const fmtGig = (g) => fmtCurrency(g.amount, g.currency || "PLN");
  const daysLate = (g) => Math.round((new Date(today) - new Date(g.dueDate)) / 86400000);
  const reserve = taxPct > 0 ? Math.max(0, stats.net) * taxPct / 100 : 0;

  return (
    <div style={{ padding: "0 16px" }}>
      <ModuleHeader Icon={Briefcase} color={ACCENT} title={t("gig.title", "Freelance")} onBack={onBack}
        addLabel={t("gig.add", "Zlecenie")} onAdd={() => setForm(blankForm())}/>
      <PeriodChips value={period} onChange={setPeriod} month={viewMonth} onMonthChange={onMonthChange}/>

      <div style={heroCard}>
        <div style={heroLabel}>{t("gig.earned", "Zarobione (wpłynęło)")}</div>
        <div style={heroValue(stats.income >= 0)}>{fmtDisplay(stats.income)}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Stat label={t("gig.unpaid", "Do zapłaty")} value={fmtDisplay(stats.unpaid)} color={stats.unpaid > 0 ? "#fbbf24" : "#e2e8f0"}/>
          <Stat label={t("gig.hourly", "Stawka / h")} value={stats.hourly != null ? fmtDisplay(stats.hourly) : "—"}/>
          <Stat label={t("gig.jobs", "Zlecenia")} value={String(stats.paidCount)}/>
          <Stat label={t("gig.costs", "Koszty")} value={fmtDisplay(stats.expenses)}/>
        </div>
        {stats.overdueCount > 0 && (
          <div style={{ fontSize: 12, color: "#f87171", marginTop: 12 }}>
            {t("gig.overdueLine", "Po terminie: {n} · {amount}").replace("{n}", stats.overdueCount).replace("{amount}", fmtDisplay(stats.overdue))}
          </div>
        )}
        <button onClick={() => setTaxForm({ pct: taxPct ? String(taxPct) : "" })} style={{ all: "unset", cursor: "pointer", display: "block", fontSize: 12, color: taxPct > 0 ? "#94a3b8" : "#64748b", marginTop: 10, lineHeight: 1.45 }}>
          {taxPct > 0
            ? t("gig.reserveLine", "Odłóż na podatek ({pct}% od zarobionego na czysto): {amount}").replace("{pct}", taxPct).replace("{amount}", fmtDisplay(reserve))
            : t("gig.reserveSet", "+ Ustaw rezerwę na podatek")}
        </button>
        {stats.looseCount > 0 && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>
            {t("gig.looseNote", "Wpisy bez zlecenia ({n}): {amount}").replace("{n}", stats.looseCount).replace("{amount}", fmtDisplay(stats.looseIncome, { showSign: true }))}
          </div>
        )}
      </div>

      {gigs.length === 0 && stats.looseCount === 0 ? (
        <EmptyCard title={t("gig.emptyTitle", "Dodaj pierwsze zlecenie")}
          desc={t("gig.emptyDesc", "Klient, kwota, termin. Niezapłacone nie ruszają salda — przychód zapiszemy, gdy oznaczysz je jako opłacone.")}
          cta={t("gig.add", "Zlecenie")} onCta={() => setForm(blankForm())}/>
      ) : <>
        {unpaid.length > 0 && <>
          <div style={sectionTitle}>{t("gig.toCollect", "Do zapłaty")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unpaid.map(g => {
              const late = isOverdue(g, today);
              return (
                <div key={g.id} style={{ ...card, padding: 14, borderColor: late ? "#7f1d1d" : "#1a2744" }}>
                  <button onClick={() => setForm(formFromGig(g))} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, width: "100%", alignItems: "center" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title || g.client}</span>
                      <span style={{ display: "block", fontSize: 11, color: late ? "#f87171" : "#64748b", marginTop: 3 }}>
                        {[g.title ? g.client : null,
                          g.dueDate ? (late ? t("gig.lateBy", "po terminie {n} dni").replace("{n}", daysLate(g)) : `${t("gig.due", "termin")} ${g.dueDate}`) : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{fmtGig(g)}</span>
                  </button>
                  <div style={{ display: "flex", marginTop: 12 }}>
                    <button onClick={() => markPaid(g)} disabled={saving} style={actionBtn("#10b981")}>
                      <Check size={12}/> {t("gig.markPaid", "Opłacone")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {stats.byClient.length > 0 && <>
          <div style={sectionTitle}>{t("gig.clients", "Klienci")}</div>
          <div style={{ ...card, padding: "4px 14px" }}>
            {stats.byClient.map((c, i) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < stats.byClient.length - 1 ? "1px solid #0f1a2e" : "none" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.key}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {[c.count > 0 ? `${c.count} ${t("gig.paidShort", "opłac.")}` : null,
                      c.hours > 0 ? `${c.hours} h · ${fmtDisplay(c.paid / c.hours)}/h` : null,
                      c.unpaid > 0 ? `${t("gig.unpaidShort", "czeka")} ${fmtDisplay(c.unpaid)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#34d399" }}>{fmtDisplay(c.paid)}</span>
              </div>
            ))}
          </div>
        </>}

        {paid.length > 0 && <>
          <div style={sectionTitle}>{t("gig.history", "Opłacone")}</div>
          <div style={{ ...card, padding: "2px 14px" }}>
            {paid.map((g, i) => (
              <button key={g.id} onClick={() => setForm(formFromGig(g))} style={{
                all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                borderBottom: i < paid.length - 1 ? "1px solid #0f1a2e" : "none",
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title || g.client}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {[g.title ? g.client : null, g.paidDate, g.hours ? `${g.hours} h` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#34d399", flexShrink: 0 }}>+{fmtGig(g)}</span>
              </button>
            ))}
          </div>
        </>}
      </>}

      {/* Formularz zlecenia */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.editingId != null ? t("gig.editTitle", "Zlecenie") : t("gig.newTitle", "Nowe zlecenie")}>
        {form && <>
          <Input label={t("gig.client", "Klient")} value={form.client} onChange={e => setF({ client: e.target.value })} placeholder={t("gig.clientPh", "np. Studio XYZ")}/>
          {recentClients.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "-6px 0 14px" }}>
              {recentClients.map(c => <Chip key={c} on={form.client === c} color={ACCENT} onClick={() => {
                const last = gigs.filter(g => (g.client || "").trim() === c).sort((x, y) => (y.date || "").localeCompare(x.date || ""))[0];
                setF({ client: c, ...(last && form.editingId == null ? { currency: last.currency || form.currency } : {}) });
              }}>{c}</Chip>)}
            </div>
          )}
          <Input label={t("gig.what", "Za co")} value={form.title} onChange={e => setF({ title: e.target.value })} placeholder={t("gig.whatPh", "np. Landing page, logo, tłumaczenie")}/>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.4 }}><Input label={t("gig.amount", "Kwota")} type="text" inputMode="decimal" step="0.01" value={form.amount} onChange={e => setF({ amount: e.target.value })}/></div>
            <div style={{ flex: 0.9 }}>
              <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div style={{ flex: 0.9 }}><Input label={t("gig.hours", "Godziny")} type="text" inputMode="decimal" step="0.5" placeholder="—" value={form.hours} onChange={e => setF({ hours: e.target.value })}/></div>
          </div>

          <div style={fieldLabel}>{t("gig.statusLabel", "Status")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Chip on={form.status === "unpaid"} color="#f59e0b" onClick={() => setF({ status: "unpaid" })}>{t("gig.unpaid", "Do zapłaty")}</Chip>
            <Chip on={form.status === "paid"} color="#10b981" onClick={() => setF({ status: "paid" })}>{t("gig.markPaid", "Opłacone")}</Chip>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Input label={t("gig.doneOn", "Wykonane")} type="date" value={form.date} onChange={e => setF({ date: e.target.value })}/></div>
            {form.status === "unpaid"
              ? <div style={{ flex: 1 }}><Input label={t("gig.dueDate", "Termin płatności")} type="date" value={form.dueDate} onChange={e => setF({ dueDate: e.target.value })}/></div>
              : <div style={{ flex: 1 }}><Input label={t("gig.paidOn", "Zapłacone")} type="date" value={form.paidDate} onChange={e => setF({ paidDate: e.target.value })}/></div>}
          </div>

          <button onClick={save} disabled={saving} style={{ ...primaryBtn, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
          </button>
          {form.editingId != null && (
            <button onClick={remove} style={dangerBtn}><Trash2 size={14}/> {t("gig.delete", "Usuń zlecenie")}</button>
          )}
        </>}
      </Modal>

      {/* Rezerwa na podatek — procent ustawia użytkownik */}
      <Modal open={!!taxForm} onClose={() => setTaxForm(null)} title={t("gig.reserveTitle", "Rezerwa na podatek")}>
        {taxForm && <>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.55, marginBottom: 14 }}>
            {t("gig.reserveDesc", "Podaj, jaki procent zarobionego na czysto chcesz odkładać. Sidegig tylko liczy kwotę — stawkę dobierz do swojej formy rozliczenia.")}
          </div>
          <Input label="%" type="text" inputMode="decimal" step="0.5" placeholder="12" value={taxForm.pct} onChange={e => setTaxForm({ pct: e.target.value })}/>
          <button onClick={() => { setTaxReservePct(taxForm.pct); setTaxPct(getTaxReservePct()); setTaxForm(null); }} style={primaryBtn}>
            {t("common.save", "Zapisz")}
          </button>
        </>}
      </Modal>

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { FreelanceView };

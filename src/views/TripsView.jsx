import { useEffect, useMemo, useRef, useState } from "react";
import { Plane, Plus, Pencil, Trash2, Archive, RotateCcw, UserPlus, Share2, Check, ChevronRight, ChevronLeft, X, Users } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import { card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, Chip, Stat, ModuleHeader, EmptyCard, CheckRow, num } from "../components/ModuleUI.jsx";
import { ColorPicker } from "../components/PlansShared.jsx";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { MODULES, moduleLabel } from "../lib/modules.js";
import { getDisplayCurrency, getRate, convert, SUPPORTED_CURRENCIES, txAmountForDisplay } from "../lib/fx.js";
import { newId, rateOnDate, makeTx, commitTxChanges } from "../lib/ledger.js";
import { getCat } from "../constants.js";
import { shareText } from "../lib/native.js";
import {
  groupTrips, pickTripColor, DEFAULT_TRIP_COLORS, migrateLegacyVacations,
  tripCost, tripBalances, tripDays, tripBudget,
} from "../lib/trips.js";

const ACCENT = MODULES.trips.color;
const TRIP_CATS = ["noclegi", "jedzenie", "transport", "rozrywka", "zakupy", "kawiarnia", "alkohol", "prezenty", "zdrowie"];
const ME = "me";

const progressColor = (ratio) => ratio >= 1 ? "#f87171" : ratio >= 0.85 ? "#fbbf24" : ACCENT;

/**
 * Wyjazdy: budżet dzienny w trakcie, szybkie dodawanie wydatku w walucie wyjazdu
 * i rozliczenie ze znajomymi (kto komu oddaje). Wydatki to zwykłe wpisy z tripId.
 */
function TripsView({ trips = [], setTrips, transactions = [], setTransactions, setAccounts, defaultAcc = 1,
  onBack, onAddExpense, addSignal = 0, openAdd = false, focusTripId = null, onFocusHandled }) {
  const today = todayLocal();
  const { toast, showToast } = useToast();
  const [detailsId, setDetailsId] = useState(null);
  const [modalTrip, setModalTrip] = useState(null);
  const [pastYear, setPastYear] = useState(null);

  const migrationCandidate = useMemo(() => (trips.length > 0 ? null : migrateLegacyVacations()), [trips]);
  const grouped = useMemo(() => groupTrips(trips, today), [trips, today]);
  const costs = useMemo(() => Object.fromEntries(trips.map(tr => [tr.id, tripCost(tr, transactions)])), [trips, transactions, getDisplayCurrency()]);

  useEffect(() => {
    if (focusTripId == null) return;
    if (trips.some(x => x.id === focusTripId)) setDetailsId(focusTripId);
    if (onFocusHandled) onFocusHandled();
  }, [focusTripId]);

  const openNew = () => setModalTrip({
    id: null, name: "", dateFrom: today, dateTo: today, budget: "", budgetCurrency: getDisplayCurrency(),
    color: pickTripColor(trips), notes: "", archived: false, defaultCurrency: getDisplayCurrency(),
  });
  const openEdit = (trip) => setModalTrip({ ...trip, budget: trip.budget ? String(trip.budget) : "", budgetCurrency: trip.budgetCurrency || "PLN", defaultCurrency: trip.defaultCurrency || "PLN" });

  // Przycisk + z paska: wydatek do otwartego / trwającego wyjazdu, inaczej nowy wyjazd
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => {
    if (addSignal === firstAddSignal.current) return;
    const target = trips.find(x => x.id === detailsId) || grouped.active[0];
    if (target && onAddExpense) onAddExpense(target); else openNew();
  }, [addSignal]);

  const saveTrip = () => {
    const m = modalTrip;
    if (!m || !m.name.trim()) return;
    if (m.dateTo < m.dateFrom) { showToast(t("trips.err.dates", "Koniec nie może być przed początkiem"), "error"); return; }
    const payload = {
      ...(trips.find(x => x.id === m.id) || {}),
      id: m.id || Date.now(), name: m.name.trim(), dateFrom: m.dateFrom, dateTo: m.dateTo,
      budget: num(m.budget) > 0 ? num(m.budget) : 0, budgetCurrency: m.budgetCurrency || "PLN",
      color: m.color, notes: m.notes || "", archived: !!m.archived,
      defaultCurrency: m.defaultCurrency || "PLN", createdAt: m.createdAt || new Date().toISOString(),
    };
    setTrips(m.id ? trips.map(x => x.id === m.id ? payload : x) : [...trips, payload]);
    setModalTrip(null);
    if (!m.id) setDetailsId(payload.id);
  };
  const deleteTrip = (trip) => {
    if (!window.confirm(t("trips.deleteConfirm"))) return;
    setTrips(trips.filter(x => x.id !== trip.id));
    setTransactions(prev => prev.map(tx => tx.tripId === trip.id ? { ...tx, tripId: null } : tx));
    setModalTrip(null);
    setDetailsId(null);
  };
  const updateTrip = (id, patch) => setTrips(prev => prev.map(x => x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x));

  const modalNode = modalTrip && (
    <TripModal trip={modalTrip} setTrip={setModalTrip} onClose={() => setModalTrip(null)} onSave={saveTrip}
      onDelete={modalTrip.id ? () => deleteTrip(modalTrip) : null}
      onArchive={modalTrip.id ? () => { updateTrip(modalTrip.id, { archived: !modalTrip.archived }); setModalTrip(null); } : null}/>
  );

  const open = detailsId != null ? trips.find(x => x.id === detailsId) : null;
  if (open) return (
    <>
      <TripDetails trip={open} cost={costs[open.id]} transactions={transactions} setTransactions={setTransactions} setAccounts={setAccounts}
        defaultAcc={defaultAcc} today={today} updateTrip={(p) => updateTrip(open.id, p)} showToast={showToast}
        onBack={() => setDetailsId(null)} onEdit={() => openEdit(open)} onAddExpense={() => onAddExpense && onAddExpense(open)}/>
      {modalNode}
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </>
  );

  // Lata zakończonych wyjazdów (filtr listy)
  const pastYears = [...new Set(grouped.past.map(x => (x.dateFrom || "").slice(0, 4)))].filter(Boolean).sort().reverse();
  const yearShown = pastYear || pastYears[0];
  const pastList = grouped.past.filter(x => (x.dateFrom || "").startsWith(yearShown || ""));
  const yearCost = pastList.reduce((s, x) => s + (costs[x.id]?.myCost || 0), 0);
  const yearDays = pastList.reduce((s, x) => s + tripDays(x, today).total, 0);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <ModuleHeader Icon={Plane} color={ACCENT} title={moduleLabel("trips")} onBack={onBack} addLabel={t("trips.addShort", "Wyjazd")} onAdd={openNew}/>

      {migrationCandidate && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 10 }}>{t("trips.legacyPrompt", "Znaleźliśmy 1 wyjazd z poprzedniej wersji apki. Czy go zaimportować?")}</div>
          <button onClick={() => setTrips(migrationCandidate)} style={primaryBtn}>{t("trips.import", "Importuj")}</button>
        </div>
      )}

      {grouped.active.map(trip => (
        <ActiveTripCard key={trip.id} trip={trip} cost={costs[trip.id]} today={today} onOpen={() => setDetailsId(trip.id)} onAdd={() => onAddExpense && onAddExpense(trip)}/>
      ))}

      {grouped.upcoming.length > 0 && <>
        <div style={sectionTitle}>{t("trips.upcoming")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {grouped.upcoming.map(trip => {
            const d = tripDays(trip, today);
            const c = costs[trip.id];
            return (
              <TripRow key={trip.id} trip={trip} onClick={() => setDetailsId(trip.id)}
                sub={`${fmtRange(trip)} · ${inDaysLabel(d.until)}`}
                right={c && c.myCost > 0 ? fmtDisplay(c.myCost) : tripBudget(trip) > 0 ? fmtDisplay(tripBudget(trip)) : "—"}
                rightLabel={c && c.myCost > 0 ? t("trips.booked", "już wydane") : t("trips.budget")}/>
            );
          })}
        </div>
      </>}

      {grouped.past.length > 0 && <>
        <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t("trips.past")}</span>
        </div>
        {pastYears.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {pastYears.map(y => <Chip key={y} on={y === yearShown} color={ACCENT} onClick={() => setPastYear(y)}>{y}</Chip>)}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#94a3b8", margin: "0 2px 8px" }}>
          {t("trips.yearLine", "Wyjazdy: {n} · {amount} · średnio {perDay} dziennie")
            .replace("{n}", pastList.length).replace("{amount}", fmtDisplay(yearCost)).replace("{perDay}", fmtDisplay(yearDays ? yearCost / yearDays : 0))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pastList.map(trip => {
            const c = costs[trip.id];
            const d = tripDays(trip, today);
            return (
              <TripRow key={trip.id} trip={trip} dimmed={trip.archived} onClick={() => setDetailsId(trip.id)}
                sub={`${fmtRange(trip)} · ${daysLabel(d.total)} · ${fmtDisplay((c?.myCost || 0) / d.total)}/${t("trips.dayShort", "dzień")}`}
                right={fmtDisplay(c?.myCost || 0)} rightLabel={t("trips.yourCost", "Twój koszt")}/>
            );
          })}
        </div>
      </>}

      {trips.length === 0 && !migrationCandidate && (
        <EmptyCard title={t("trips.empty")} desc={t("trips.emptyDesc2", "Dodaj wyjazd: budżet, wydatki w lokalnej walucie i rozliczenie ze znajomymi — kto komu ile oddaje.")} cta={t("trips.addShort", "Wyjazd")} onCta={openNew}/>
      )}

      {modalNode}
      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

// „1 dzień”, „5 dni”; „jutro” zamiast „za 1 dni”
const daysLabel = (n) => n === 1 ? t("trips.oneDay", "1 dzień") : t("trips.daysN", "{n} dni").replace("{n}", n);
const inDaysLabel = (n) => n === 1 ? t("sub.when.tomorrow", "jutro") : t("trips.inDays", "za {n} dni").replace("{n}", n);

function fmtRange(trip) {
  const f = (d) => (d || "").slice(5).split("-").reverse().join(".");
  return trip.dateFrom === trip.dateTo ? f(trip.dateFrom) : `${f(trip.dateFrom)}–${f(trip.dateTo)}`;
}

function TripRow({ trip, sub, right, rightLabel, onClick, dimmed }) {
  return (
    <button onClick={onClick} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, opacity: dimmed ? 0.6 : 1 }}>
      <span style={{ width: 10, height: 36, borderRadius: 4, background: trip.color || ACCENT, flexShrink: 0 }}/>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trip.name}</span>
        <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
      </span>
      <span style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{rightLabel}</span>
        <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{right}</span>
      </span>
      <ChevronRight size={14} color="#334155"/>
    </button>
  );
}

/** Budżet na resztę wyjazdu: ile zostało na dzień i ile wydano dziś. */
function dailyNumbers(trip, cost, today) {
  const d = tripDays(trip, today);
  const budget = tripBudget(trip);
  const spentToday = (cost && cost.byDay[today]) || 0;
  const remaining = budget - (cost ? cost.myCost : 0);
  const perDayLeft = budget > 0 && d.left > 0 ? (remaining + spentToday) / d.left : null;
  return { d, budget, spentToday, remaining, perDayLeft };
}

function ActiveTripCard({ trip, cost, today, onOpen, onAdd }) {
  const { d, budget, spentToday, perDayLeft } = dailyNumbers(trip, cost, today);
  const spent = cost ? cost.myCost : 0;
  const ratio = budget > 0 ? spent / budget : 0;
  return (
    <div style={{ ...heroCard, borderColor: (trip.color || ACCENT) + "66", marginBottom: 12 }}>
      <button onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...heroLabel, color: "#34d399" }}>● {t("trips.now", "Trwa teraz")} · {t("trips.dayOf", "dzień {n} z {total}").replace("{n}", d.current).replace("{total}", d.total)}</span>
          <ChevronRight size={14} color="#475569"/>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{trip.name}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <Stat label={t("trips.yourCost", "Twój koszt")} value={fmtDisplay(spent)}/>
          <Stat label={t("trips.today", "Dziś")} value={fmtDisplay(spentToday)}/>
          <Stat label={t("trips.perDayLeft", "Na dzień")} value={perDayLeft != null ? fmtDisplay(Math.max(0, perDayLeft)) : "—"} color={perDayLeft != null && perDayLeft < spentToday ? "#f87171" : "#34d399"}/>
        </div>
        {budget > 0 && (
          <div style={{ height: 6, borderRadius: 3, background: "#060b14", marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", background: progressColor(ratio), borderRadius: 3 }}/>
          </div>
        )}
      </button>
      <button onClick={onAdd} style={{ ...primaryBtn, marginTop: 12, padding: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={15}/> {t("trips.addExpense", "Wydatek")}{trip.defaultCurrency && trip.defaultCurrency !== "PLN" ? ` (${trip.defaultCurrency})` : ""}
      </button>
    </div>
  );
}

function TripDetails({ trip, cost, transactions, setTransactions, setAccounts, defaultAcc, today, updateTrip, showToast, onBack, onEdit, onAddExpense }) {
  const lang = getLang();
  const { d, budget, spentToday, remaining, perDayLeft } = dailyNumbers(trip, cost, today);
  const spent = cost ? cost.myCost : 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const people = trip.participants || [];
  const balances = useMemo(() => tripBalances(trip, transactions), [trip, transactions, getDisplayCurrency()]);
  const [personName, setPersonName] = useState("");
  const [friendForm, setFriendForm] = useState(null);
  const [splitTx, setSplitTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameOf = (id) => id === ME ? t("trips.me", "Ja") : (people.find(p => p.id === id) || {}).name || "?";

  const entries = useMemo(() => {
    const mine = transactions.filter(tx => tx.tripId === trip.id).map(tx => ({ kind: tx.tripSettle ? "settle" : "tx", date: tx.date, tx }));
    const theirs = (trip.friendPaid || []).map(e => ({ kind: "friend", date: e.date, e }));
    return [...mine, ...theirs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [transactions, trip]);

  // ── Ekipa ─────────────────────────────────────────────────────────
  const addPerson = () => {
    const name = personName.trim();
    if (!name) return;
    updateTrip(x => ({ participants: [...(x.participants || []), { id: newId(), name }] }));
    setPersonName("");
  };
  const removePerson = (p) => {
    const used = transactions.some(tx => tx.tripId === trip.id && ((tx.tripSplit || []).includes(p.id) || (tx.tripSettle && tx.tripSettle.with === p.id)))
      || (trip.friendPaid || []).some(e => e.paidBy === p.id || (e.split || []).includes(p.id));
    if (used) { showToast(t("trips.personUsed", "{name} ma wpisy w rozliczeniu — najpierw je zmień.").replace("{name}", p.name), "error"); return; }
    updateTrip(x => ({ participants: (x.participants || []).filter(y => y.id !== p.id) }));
  };

  // ── Rozliczenia ───────────────────────────────────────────────────
  const settle = (p) => {
    const disp = getDisplayCurrency();
    const amountDisp = Math.round(convert(Math.abs(p.balance), "PLN", disp) * 100) / 100;
    const label = fmtCurrency(amountDisp, disp);
    const q = p.balance > 0
      ? t("trips.settleInQ", "{name} oddał(a) Ci {amount}?").replace("{name}", p.name).replace("{amount}", label)
      : t("trips.settleOutQ", "Oddałeś {amount} — {name}?").replace("{name}", p.name).replace("{amount}", label);
    if (!window.confirm(q)) return;
    const rate = disp === "PLN" ? 1 : getRate(disp);
    const tx = makeTx({
      date: today, currency: disp, rate, acc: defaultAcc, module: "trips", cat: "inne",
      amount: p.balance > 0 ? amountDisp : -amountDisp,
      desc: `${t("trips.settleDesc", "Rozliczenie")}: ${p.name} · ${trip.name}`,
      tripId: trip.id, tripSettle: { with: p.id },
    });
    commitTxChanges({ setTransactions, setAccounts }, { add: [tx] });
    showToast(t("trips.settled", "Rozliczone ✓"));
  };
  const shareSettlement = async () => {
    const lines = balances.filter(b => Math.abs(b.balance) >= 0.01).map(b => b.balance > 0
      ? `${b.name} → ${t("trips.me", "Ja")}: ${fmtDisplay(b.balance)}`
      : `${t("trips.me", "Ja")} → ${b.name}: ${fmtDisplay(-b.balance)}`);
    const text = [`${trip.name} — ${t("trips.settlement", "Rozliczenie")}`, ...lines, "", t("trips.shareFooter", "Policzone w Sidegig")].join("\n");
    const r = await shareText(text, trip.name);
    if (r === "copied") showToast(t("trips.copied", "Skopiowano do schowka ✓"));
  };

  // ── Zapłacił ktoś inny ────────────────────────────────────────────
  const openFriend = (e = null) => setFriendForm(e ? { ...e, amount: String(e.amount) } : {
    id: null, paidBy: people[0]?.id, desc: "", amount: "", currency: trip.defaultCurrency || getDisplayCurrency(),
    date: today < trip.dateFrom ? trip.dateFrom : today > trip.dateTo ? trip.dateTo : today, split: [ME, ...people.map(p => p.id)], cat: "jedzenie",
  });
  const saveFriend = async () => {
    const f = friendForm;
    const amount = num(f.amount);
    if (!f.paidBy || !isFinite(amount) || amount <= 0 || !f.split.length) { showToast(t("trips.err.friend", "Uzupełnij, kto zapłacił, kwotę i z kim dzielone"), "error"); return; }
    setSaving(true);
    try {
      const fxRate = await rateOnDate(f.currency, f.date);
      const entry = { id: f.id || newId(), paidBy: f.paidBy, desc: f.desc.trim(), amount, currency: f.currency, fxRate, date: f.date, split: f.split, cat: f.cat };
      updateTrip(x => ({ friendPaid: f.id ? (x.friendPaid || []).map(y => y.id === f.id ? entry : y) : [...(x.friendPaid || []), entry] }));
      setFriendForm(null);
    } finally { setSaving(false); }
  };
  const deleteFriend = () => {
    if (!window.confirm(t("trips.confirmDeleteEntry", "Usunąć ten wpis?"))) return;
    updateTrip(x => ({ friendPaid: (x.friendPaid || []).filter(y => y.id !== friendForm.id) }));
    setFriendForm(null);
  };

  // ── Podział Twojego wydatku ───────────────────────────────────────
  const saveSplit = () => {
    const split = splitTx.split;
    setTransactions(prev => prev.map(tx => tx.id === splitTx.tx.id ? { ...tx, tripSplit: split.length > 1 || (split.length === 1 && split[0] !== ME) ? split : null } : tx));
    setSplitTx(null);
  };
  const untag = () => {
    setTransactions(prev => prev.map(tx => tx.id === splitTx.tx.id ? { ...tx, tripId: null, tripSplit: null } : tx));
    setSplitTx(null);
  };
  const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  const days = [];
  for (let i = 0; i < Math.min(d.total, 31); i++) {
    const dt = new Date(`${trip.dateFrom}T00:00:00`); dt.setDate(dt.getDate() + i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    days.push({ key, label: String(dt.getDate()), value: (cost && cost.byDay[key]) || 0 });
  }
  const maxDay = Math.max(1, ...days.map(x => x.value));
  const preTrip = Object.entries((cost && cost.byDay) || {}).filter(([k]) => k < trip.dateFrom).reduce((s, [, v]) => s + v, 0);
  const byCat = Object.entries((cost && cost.byCategory) || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <ModuleHeader Icon={Plane} color={trip.color || ACCENT} title={trip.name} onBack={onBack}
        addLabel={t("trips.addExpense", "Wydatek")} onAdd={onAddExpense}
        extra={<button onClick={onEdit} aria-label={t("common.edit", "Edytuj")} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: 7, cursor: "pointer", color: "#94a3b8", display: "grid", placeItems: "center" }}><Pencil size={14}/></button>}/>

      <div style={heroCard}>
        <div style={heroLabel}>
          {fmtRange(trip)} · {d.status === "active" ? t("trips.dayOf", "dzień {n} z {total}").replace("{n}", d.current).replace("{total}", d.total)
            : d.status === "upcoming" ? inDaysLabel(d.until)
            : daysLabel(d.total)}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtDisplay(spent)}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{t("trips.yourCostHint", "Twój koszt — Twoja część wspólnych wydatków")}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Stat label={t("trips.budget")} value={budget > 0 ? fmtDisplay(budget) : "—"}/>
          <Stat label={t("trips.remaining")} value={budget > 0 ? fmtDisplay(remaining) : "—"} color={budget > 0 && remaining < 0 ? "#f87171" : "#e2e8f0"}/>
          <Stat label={d.status === "active" ? t("trips.perDayLeft", "Na dzień") : t("trips.perDay", "Dziennie")}
            value={d.status === "active" ? (perDayLeft != null ? fmtDisplay(Math.max(0, perDayLeft)) : "—") : fmtDisplay(spent / d.total)}/>
        </div>
        {budget > 0 && (
          <div style={{ height: 6, borderRadius: 3, background: "#060b14", marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", background: progressColor(ratio), borderRadius: 3 }}/>
          </div>
        )}
        {d.status === "active" && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
            {t("trips.todayLine", "Dziś wydane: {amount}").replace("{amount}", fmtDisplay(spentToday))}
            {perDayLeft != null && perDayLeft > 0 && ` · ${t("trips.todayLeft", "zostało na dziś: {amount}").replace("{amount}", fmtDisplay(Math.max(0, perDayLeft - spentToday)))}`}
          </div>
        )}
        {preTrip > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{t("trips.preTrip", "Przed wyjazdem (rezerwacje, bilety): {amount}").replace("{amount}", fmtDisplay(preTrip))}</div>}
        {cost && cost.paid > spent + 0.01 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{t("trips.paidLine", "Zapłaciłeś łącznie {amount} — część oddadzą znajomi.").replace("{amount}", fmtDisplay(cost.paid))}</div>}
      </div>

      {/* Ekipa i rozliczenie */}
      <div style={sectionTitle}>{t("trips.crew", "Ekipa")}</div>
      <div style={{ ...card, padding: "12px 14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <Chip on color={ACCENT}>{t("trips.me", "Ja")}</Chip>
          {people.map(p => (
            <button key={p.id} onClick={() => removePerson(p)} title={t("common.delete", "Usuń")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 9, background: "#060b14", border: "1px solid #1a2744", color: "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {p.name} <X size={11} color="#64748b"/>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPerson()} placeholder={t("trips.personPh", "Imię, np. Kasia")}
            style={{ flex: 1, minWidth: 0, background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, padding: "9px 12px", color: "#e2e8f0", fontSize: 15, outline: "none", fontFamily: "inherit" }}/>
          <button onClick={addPerson} style={{ background: ACCENT + "22", border: `1px solid ${ACCENT}66`, color: ACCENT, borderRadius: 10, padding: "0 12px", cursor: "pointer", display: "grid", placeItems: "center" }} aria-label={t("trips.addPerson", "Dodaj osobę")}><UserPlus size={15}/></button>
        </div>
        {people.length === 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, lineHeight: 1.45 }}>{t("trips.crewHint", "Jedziesz ze znajomymi? Dodaj ich — podzielisz wydatki i zobaczysz, kto komu ile oddaje.")}</div>}

        {people.length > 0 && <>
          <div style={{ height: 1, background: "#1a2744", margin: "12px 0" }}/>
          {balances.map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#cbd5e1" }}>
                {Math.abs(b.balance) < 0.01 ? t("trips.even", "{name}: rozliczeni").replace("{name}", b.name)
                  : b.balance > 0 ? t("trips.owesYou", "{name} oddaje Ci {amount}").replace("{name}", b.name).replace("{amount}", fmtDisplay(b.balance))
                  : t("trips.youOwe", "Oddajesz: {name} — {amount}").replace("{name}", b.name).replace("{amount}", fmtDisplay(-b.balance))}
              </span>
              {Math.abs(b.balance) >= 0.01 && (
                <button onClick={() => settle(b)} style={{ background: "#10b98118", border: "1px solid #10b98155", color: "#34d399", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                  <Check size={11}/> {t("trips.settle", "Rozliczone")}
                </button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => openFriend()} style={{ flex: 1, background: "#0d1628", border: "1px solid #1a2744", color: "#cbd5e1", borderRadius: 10, padding: "9px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Users size={13}/> {t("trips.friendPaid", "Zapłacił ktoś inny")}
            </button>
            <button onClick={shareSettlement} style={{ flex: 1, background: "#0d1628", border: "1px solid #1a2744", color: "#cbd5e1", borderRadius: 10, padding: "9px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Share2 size={13}/> {t("trips.share", "Udostępnij")}
            </button>
          </div>
        </>}
      </div>

      {byCat.length > 0 && <>
        <div style={sectionTitle}>{t("trips.byCategory")}</div>
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

      {spent > 0 && d.total > 1 && <>
        <div style={sectionTitle}>{t("trips.byDay", "Dzień po dniu")}</div>
        <div style={{ ...card, padding: "12px 10px 8px", display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
          {days.map(x => (
            <div key={x.key} title={`${x.key}: ${fmtDisplay(x.value)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", maxWidth: 18, height: `${Math.max(2, (x.value / maxDay) * 60)}px`, background: x.key === today ? "#34d399" : (trip.color || ACCENT), opacity: x.value ? 0.85 : 0.2, borderRadius: 3 }}/>
              <span style={{ fontSize: 8, color: x.key === today ? "#34d399" : "#475569", fontFamily: "'DM Mono', monospace" }}>{x.label}</span>
            </div>
          ))}
        </div>
      </>}

      {cost && Object.keys(cost.byCurrency).length > 1 && <>
        <div style={sectionTitle}>{t("trips.byCurrency", "Wydatki według waluty")}</div>
        <div style={{ ...card, padding: "4px 14px" }}>
          {Object.entries(cost.byCurrency).map(([cur, v], i, arr) => (
            <div key={cur} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none", fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{fmtCurrency(v.orig, cur)}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: "#94a3b8" }}>{fmtDisplay(v.value)}</span>
            </div>
          ))}
        </div>
      </>}

      <div style={sectionTitle}>{t("trips.entries", "Wpisy")} · {entries.length}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{t("trips.noTx2", "Brak wydatków. Dodaj pierwszy przyciskiem „Wydatek” — od razu w walucie wyjazdu.")}</div>
      ) : (
        <div style={{ ...card, padding: "2px 14px" }}>
          {entries.map((en, i) => {
            const last = i === entries.length - 1;
            const rowStyle = { all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: last ? "none" : "1px solid #0f1a2e" };
            if (en.kind === "friend") {
              const e = en.e;
              return (
                <button key={"f" + e.id} onClick={() => openFriend(e)} style={rowStyle}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc || getCat(e.cat).label}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{e.date} · {t("trips.paidBy", "płacił(a): {name}").replace("{name}", nameOf(e.paidBy))} · ÷{e.split.length}</span>
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{fmtCurrency(e.amount, e.currency)}</span>
                </button>
              );
            }
            const tx = en.tx;
            const settleRow = en.kind === "settle";
            const fx = tx.origCurrency && tx.origAmount != null;
            const shared = Array.isArray(tx.tripSplit) && tx.tripSplit.length > 1;
            return (
              <button key={tx.id} onClick={() => !settleRow && setSplitTx({ tx, split: Array.isArray(tx.tripSplit) && tx.tripSplit.length ? tx.tripSplit : [ME] })} style={{ ...rowStyle, cursor: settleRow ? "default" : "pointer" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || getCat(tx.cat).label}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {tx.date} · {settleRow ? t("trips.settleDesc", "Rozliczenie") : getCat(tx.cat).label}{shared ? ` · ÷${tx.tripSplit.length}` : ""}
                  </span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: tx.amount < 0 ? "#f87171" : "#34d399" }}>
                  {fx ? fmtCurrency(Math.sign(tx.amount) * Math.abs(tx.origAmount), tx.origCurrency, true) : fmtCurrency(tx.amount, "PLN", true)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Podział Twojego wydatku */}
      <Modal open={!!splitTx} onClose={() => setSplitTx(null)} title={splitTx ? (splitTx.tx.desc || t("trips.expense", "Wydatek")) : ""}>
        {splitTx && <>
          {people.length > 0 ? <>
            <div style={fieldLabel}>{t("trips.splitWith", "Podziel po równo z")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {[ME, ...people.map(p => p.id)].map(id => (
                <Chip key={id} on={splitTx.split.includes(id)} color={ACCENT} onClick={() => setSplitTx(s => ({ ...s, split: toggleIn(s.split, id) }))}>{nameOf(id)}</Chip>
              ))}
            </div>
            <button onClick={saveSplit} disabled={!splitTx.split.length} style={{ ...primaryBtn, opacity: splitTx.split.length ? 1 : 0.5 }}>{t("common.save", "Zapisz")}</button>
          </> : (
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>{t("trips.splitNoCrew", "Dodaj ekipę, żeby dzielić wydatki ze znajomymi.")}</div>
          )}
          <button onClick={untag} style={{ ...dangerBtn, border: "none", color: "#64748b" }}><X size={14}/> {t("trips.removeTag", "Usuń z wyjazdu")}</button>
        </>}
      </Modal>

      {/* Zapłacił ktoś inny */}
      <Modal open={!!friendForm} onClose={() => setFriendForm(null)} title={t("trips.friendPaid", "Zapłacił ktoś inny")}>
        {friendForm && <>
          <div style={fieldLabel}>{t("trips.whoPaid", "Kto zapłacił")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {people.map(p => <Chip key={p.id} on={friendForm.paidBy === p.id} color={ACCENT} onClick={() => setFriendForm(f => ({ ...f, paidBy: p.id }))}>{p.name}</Chip>)}
          </div>
          <Input label={t("trips.what", "Za co")} placeholder={t("trips.whatPh", "np. kolacja, Airbnb")} value={friendForm.desc} onChange={e => setFriendForm(f => ({ ...f, desc: e.target.value }))}/>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.4 }}><Input label={t("trips.amount", "Kwota")} type="number" inputMode="decimal" step="0.01" value={friendForm.amount} onChange={e => setFriendForm(f => ({ ...f, amount: e.target.value }))}/></div>
            <div style={{ flex: 1 }}>
              <Select label={t("tx.currency", "Waluta")} value={friendForm.currency} onChange={e => setFriendForm(f => ({ ...f, currency: e.target.value }))}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
          <Input label={t("tx.date", "Data")} type="date" value={friendForm.date} onChange={e => setFriendForm(f => ({ ...f, date: e.target.value }))}/>
          <div style={fieldLabel}>{t("trips.tx.category", "Na co")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {TRIP_CATS.map(c => <Chip key={c} on={friendForm.cat === c} color={getCat(c).color} onClick={() => setFriendForm(f => ({ ...f, cat: c }))}>{getCat(c).label}</Chip>)}
          </div>
          <div style={fieldLabel}>{t("trips.splitWith", "Podziel po równo z")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {[ME, ...people.map(p => p.id)].map(id => (
              <Chip key={id} on={friendForm.split.includes(id)} color={ACCENT} onClick={() => setFriendForm(f => ({ ...f, split: toggleIn(f.split, id) }))}>{nameOf(id)}</Chip>
            ))}
          </div>
          <button onClick={saveFriend} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}</button>
          {friendForm.id && <button onClick={deleteFriend} style={dangerBtn}><Trash2 size={14}/> {t("common.delete", "Usuń")}</button>}
        </>}
      </Modal>
    </div>
  );
}

function TripModal({ trip, setTrip, onClose, onSave, onDelete, onArchive }) {
  const set = (patch) => setTrip({ ...trip, ...patch });
  return (
    <Modal open onClose={onClose} title={trip.id ? t("trips.editTitle", "Edytuj wyjazd") : t("trips.add")}>
      <Input label={t("trips.name")} value={trip.name} onChange={e => set({ name: e.target.value })} placeholder={t("trips.namePh", "np. Lizbona z przyjaciółmi")}/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label={t("trips.dateFrom")} type="date" value={trip.dateFrom} onChange={e => set({ dateFrom: e.target.value, dateTo: trip.dateTo < e.target.value ? e.target.value : trip.dateTo })}/>
        <Input label={t("trips.dateTo")} type="date" value={trip.dateTo} onChange={e => set({ dateTo: e.target.value })}/>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1.4 }}><Input label={t("trips.budgetOpt", "Budżet (opcjonalnie)")} type="number" inputMode="decimal" value={trip.budget} onChange={e => set({ budget: e.target.value })} placeholder="0"/></div>
        <div style={{ flex: 1 }}>
          <Select label={t("tx.currency", "Waluta")} value={trip.budgetCurrency || "PLN"} onChange={e => set({ budgetCurrency: e.target.value })}>
            {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>
      <Select label={t("trips.defaultCurrency", "Domyślna waluta wyjazdu")} value={trip.defaultCurrency || "PLN"} onChange={e => set({ defaultCurrency: e.target.value })}>
        {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
      </Select>
      <div style={{ fontSize: 11, color: "#64748b", margin: "-6px 0 14px", lineHeight: 1.45 }}>{t("trips.defaultCurrencyHint", "Wpisy dodawane w trakcie wyjazdu dostaną tę walutę automatycznie.")}</div>
      <div style={fieldLabel}>{t("trips.color")}</div>
      <div style={{ marginBottom: 14 }}><ColorPicker colors={DEFAULT_TRIP_COLORS} value={trip.color} onChange={c => set({ color: c })}/></div>
      <Input label={t("trips.notes")} value={trip.notes || ""} onChange={e => set({ notes: e.target.value })} placeholder={t("trips.notesPh", "np. hotel, atrakcje, kto płaci za co")}/>
      <button onClick={onSave} style={primaryBtn}>{t("common.save", "Zapisz")}</button>
      {onArchive && (
        <button onClick={onArchive} style={{ ...dangerBtn, border: "1px solid #1a2744", color: "#94a3b8" }}>
          {trip.archived ? <><RotateCcw size={14}/> {t("trips.restore", "Przywróć")}</> : <><Archive size={14}/> {t("trips.archive", "Archiwum")}</>}
        </button>
      )}
      {onDelete && <button onClick={onDelete} style={dangerBtn}><Trash2 size={14}/> {t("trips.delete", "Usuń wyjazd")}</button>}
    </Modal>
  );
}

export { TripsView };

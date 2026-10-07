import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Pencil, Trash2, Archive } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import {
  card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, ModuleHeader, PeriodChips, CheckRow, num, periodInSentence, monthInSentence,
} from "../components/ModuleUI.jsx";
import { fmtDisplay, fmtCurrency, todayLocal, monthName } from "../utils.js";
import { t, getLocale } from "../i18n.js";
import { SUPPORTED_CURRENCIES, getDisplayCurrency, txAmountForDisplay, amountForDisplay } from "../lib/fx.js";
import { newId, rateOnDate, makeTx, commitTxChanges } from "../lib/ledger.js";
import { MODULES, moduleLabel } from "../lib/modules.js";
import { KINDS, KIND_ORDER, kindOf, modeOf, shiftYm, rentStatus, arrears, rentalTotals, rentalYield, buildRentTx } from "../lib/rental.js";

const ACCENT = MODULES.rental.color;
const KIND_PL = { flat: "Mieszkanie", room: "Pokój", parking: "Miejsce parkingowe", garage: "Garaż / komórka", shortterm: "Krótkoterminowy (Airbnb)", gear: "Sprzęt / rzeczy", other: "Inne" };
const kindLabel = (k) => t(`rent.kind.${k}`, KIND_PL[k]);
const COSTS = [
  ["repair", "Naprawa"], ["fees", "Czynsz adm. / opłaty"], ["utilities", "Media"], ["tax", "Podatek"],
  ["insurance", "Ubezpieczenie"], ["platform", "Prowizja platformy"], ["cleaning", "Sprzątanie"], ["other", "Inne"],
];
const costLabel = (id) => t(`rent.cost.${id}`, (COSTS.find(c => c[0] === id) || COSTS[7])[1]);
const ymLabel = (ym, today) => (ym === today.slice(0, 7) ? t("period.month", "Ten miesiąc") : `${monthName(Number(ym.slice(5)) - 1)} ${ym.slice(0, 4)}`);
const fmtDay = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(getLocale(), { day: "numeric", month: "short" });

/**
 * Najem: mieszkania, pokoje, parkingi, garaże, najem krótkoterminowy i sprzęt.
 * Czynsz co miesiąc z terminem i zaległościami albo rezerwacje (Airbnb, wynajem sprzętu),
 * koszty i rentowność. Wszystko to zwykłe wpisy modułu Najem.
 */
function RentalView({ rentals = [], setRentals, transactions = [], setTransactions, setAccounts, defaultAcc = 1,
  month = null, onMonthChange, onBack, addSignal = 0, openAdd = false }) {
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const ym = month || today.slice(0, 7);
  const [form, setForm] = useState(null);      // miejsce: dodawanie / edycja
  const [money, setMoney] = useState(null);    // { place, kind: rent|booking|cost }
  const [openId, setOpenId] = useState(null);  // szczegóły miejsca
  const [showArchived, setShowArchived] = useState(false);

  const active = rentals.filter(p => !p.archived);
  const archived = rentals.filter(p => p.archived);
  const monthFrom = `${ym}-01`, monthTo = `${ym}-31`;
  const totals = useMemo(() => rentalTotals(transactions, { from: monthFrom, to: monthTo }), [transactions, ym]);
  const yearTotals = useMemo(() => rentalTotals(transactions, { from: `${ym.slice(0, 4)}-01-01`, to: `${ym.slice(0, 4)}-12-31` }), [transactions, ym]);
  const late = useMemo(() => active.map(p => ({ p, list: arrears(p, transactions, today) })).filter(x => x.list.length), [active, transactions, today]);
  const lateSum = late.reduce((s, x) => s + x.list.reduce((a, m) => a + amountForDisplay(m.missing, x.p.currency), 0), 0);

  // ── Miejsca ──────────────────────────────────────────────────────
  const blank = (kind = "flat") => ({ id: null, kind, mode: KINDS[kind].mode, name: "", tenant: "", rent: "", currency: getDisplayCurrency(), dueDay: "10", since: today, value: "", archived: false });
  const startAdd = (kind) => setForm(blank(kind || "flat"));
  const startEdit = (p) => {
    setOpenId(null);
    setForm({ ...p, rent: p.rent != null ? String(p.rent) : "", dueDay: String(p.dueDay || 10), value: p.value != null ? String(p.value) : "", tenant: p.tenant || "", since: p.since || today, mode: modeOf(p) });
  };
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) startAdd(); }, [addSignal]);

  const savePlace = () => {
    const f = form;
    const name = f.name.trim();
    if (!name) { showToast(t("rent.err.name", "Wpisz nazwę"), "error"); return; }
    const rent = num(f.rent), value = num(f.value), dueDay = Math.min(28, Math.max(1, parseInt(f.dueDay) || 10));
    if (f.mode === "monthly" && !(isFinite(rent) && rent > 0)) { showToast(t("rent.err.rent", "Wpisz kwotę czynszu"), "error"); return; }
    const old = f.id != null ? rentals.find(p => p.id === f.id) : null;
    const place = {
      ...(old || {}), id: old ? old.id : newId(), kind: f.kind, mode: f.mode, name, tenant: f.tenant.trim(),
      rent: isFinite(rent) && rent > 0 ? rent : null, currency: f.currency, dueDay,
      since: f.since || today, value: isFinite(value) && value > 0 ? value : null,
      archived: !!f.archived, createdAt: old?.createdAt || today,
    };
    setRentals(prev => old ? prev.map(p => p.id === place.id ? place : p) : [...prev, place]);
    setForm(null);
    showToast(old ? t("rent.toast.saved", "Zapisano ✓") : t("rent.toast.added", "Dodano ✓"));
  };
  const removePlace = (p) => {
    if (!window.confirm(t("rent.confirmDelete", "Usunąć „{name}”? Wpisy w Wpisach zostaną.").replace("{name}", p.name))) return;
    setRentals(prev => prev.filter(x => x.id !== p.id));
    setOpenId(null); setForm(null);
    showToast(t("rent.toast.deleted", "Usunięto"), "error");
  };

  // ── Wpisy ────────────────────────────────────────────────────────
  const saveMoney = async (m) => {
    const { place: p, kind } = m;
    const amount = num(m.amount);
    if (!(isFinite(amount) && amount > 0)) { showToast(t("tx.err.amount", "Wprowadź poprawną kwotę"), "error"); return false; }
    const date = m.date || today;
    const cur = p.currency || "PLN";
    const rate = await rateOnDate(cur, date);
    let tx;
    if (kind === "rent") {
      tx = buildRentTx(p, { ym: m.ym, date, amount, rate, acc: defaultAcc,
        desc: t("rent.tx.rent", "Czynsz {month}: {name}").replace("{month}", monthInSentence(m.ym)).replace("{name}", p.name) });
    } else if (kind === "booking") {
      const nights = parseInt(m.nights) || null;
      tx = makeTx({ date, desc: m.desc.trim() || t("rent.tx.booking", "Rezerwacja: {name}").replace("{name}", p.name), amount, currency: cur, rate, acc: defaultAcc,
        cat: "dodatkowe", module: "rental", rentalId: p.id, ...(nights ? { nights } : {}) });
    } else {
      tx = makeTx({ date, desc: m.desc.trim() || `${costLabel(m.cost)}: ${p.name}`, amount: -amount, currency: cur, rate, acc: defaultAcc,
        cat: "rachunki", module: "rental", rentalId: p.id, rentCost: m.cost });
    }
    commitTxChanges({ setTransactions, setAccounts }, { add: [tx] });
    showToast(kind === "cost" ? t("rent.toast.cost", "Koszt zapisany ✓") : t("rent.toast.income", "Przychód zapisany ✓"));
    return true;
  };
  const startRent = (p, forYm) => {
    const s = rentStatus(p, forYm, transactions, today);
    setMoney({ place: p, kind: "rent", ym: forYm, amount: String(Math.round((s.missing ?? p.rent) * 100) / 100), date: today, desc: "" });
  };
  const startMoney = (p, kind) => setMoney({ place: p, kind, ym, amount: kind === "booking" ? "" : "", date: today, desc: "", nights: "", cost: "repair" });

  const place = openId != null ? rentals.find(p => p.id === openId) : null;

  const statusChip = (p) => {
    const s = rentStatus(p, ym, transactions, today);
    if (s.state === "none") return null;
    const map = {
      paid: [t("rent.st.paid", "Zapłacone ✓"), "#34d399"],
      partial: [t("rent.st.partial", "Brakuje {amount}").replace("{amount}", fmtCurrency(s.missing, p.currency || "PLN")), "#f87171"],
      late: [t("rent.st.late", "Zaległe od {date}").replace("{date}", fmtDay(s.due)), "#f87171"],
      due: [s.days === 0 ? t("rent.st.today", "Płatne dziś") : t("rent.st.due", "Płatne do {date}").replace("{date}", fmtDay(s.due)), "#fbbf24"],
      upcoming: [t("rent.st.upcoming", "Termin {date}").replace("{date}", fmtDay(s.due)), "#64748b"],
    };
    const [label, color] = map[s.state];
    return { label, color, state: s.state };
  };

  const placeCard = (p) => {
    const k = kindOf(p); const K = KINDS[k]; const Icon = K.icon;
    const monthly = modeOf(p) === "monthly";
    const tm = rentalTotals(transactions, { rentalId: p.id, from: monthFrom, to: monthTo });
    const chip = monthly ? statusChip(p) : null;
    const meta = monthly
      ? [p.tenant, p.rent ? t("rent.perMonth", "{amount}/mies.").replace("{amount}", fmtCurrency(p.rent, p.currency || "PLN")) : null]
      : [kindLabel(k), tm.nights ? t("rent.nightsN", "nocy: {n}").replace("{n}", tm.nights) : null];
    return (
      <div key={p.id} style={{ ...card, padding: "12px 14px", opacity: p.archived ? 0.6 : 1 }}>
        <button onClick={() => setOpenId(p.id)} style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: K.color + "22", border: `1px solid ${K.color}55`, display: "grid", placeItems: "center" }}>
            <Icon size={16} color={K.color}/>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.filter(Boolean).join(" · ") || kindLabel(k)}</span>
          </span>
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{t("rent.netShort", "na czysto")}</span>
            <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: tm.net > 0 ? "#34d399" : tm.net < 0 ? "#f87171" : "#e2e8f0" }}>{fmtDisplay(tm.net, { showSign: tm.net !== 0 })}</span>
          </span>
          <ChevronRight size={14} color="#334155"/>
        </button>
        {!p.archived && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            {chip && <span style={{ fontSize: 11, fontWeight: 700, color: chip.color, flex: 1, minWidth: 0 }}>{chip.label}</span>}
            {!chip && <span style={{ flex: 1 }}/>}
            {monthly
              ? chip && chip.state !== "paid" && <button onClick={() => startRent(p, ym)} style={{ ...actionBtn("#34d399"), flex: "none", padding: "7px 12px" }}>{t("rent.act.paid", "Czynsz wpłynął")}</button>
              : <button onClick={() => startMoney(p, "booking")} style={{ ...actionBtn("#34d399"), flex: "none", padding: "7px 12px" }}>+ {t("rent.act.booking", "Rezerwacja")}</button>}
            <button onClick={() => startMoney(p, "cost")} style={{ ...actionBtn("#f87171"), flex: "none", padding: "7px 12px" }}>+ {t("rent.act.cost", "Koszt")}</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "0 16px" }}>
      <ModuleHeader Icon={MODULES.rental.icon} color={ACCENT} title={moduleLabel("rental")} onBack={onBack}
        addLabel={t("rent.place", "Miejsce")} onAdd={() => startAdd()}/>

      {rentals.length === 0 ? (
        <div style={{ ...card, padding: "24px 18px", marginTop: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center" }}>{t("rent.emptyTitle", "Co wynajmujesz?")}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5, textAlign: "center" }}>
            {t("rent.emptyDesc", "Czynsz z terminem i przypomnieniem o zaległościach, koszty, ile zostaje na czysto i jaka jest rentowność.")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
            {KIND_ORDER.map(k => {
              const K = KINDS[k]; const Icon = K.icon;
              return (
                <button key={k} onClick={() => startAdd(k)} style={{ background: "#060b14", border: "1px solid #1a2744", borderRadius: 12, padding: 10, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, color: "#cbd5e1", fontSize: 12, fontWeight: 600, textAlign: "left" }}>
                  <Icon size={15} color={K.color} style={{ flexShrink: 0 }}/> {kindLabel(k)}
                </button>
              );
            })}
          </div>
        </div>
      ) : <>
        <PeriodChips monthOnly month={ym} onMonthChange={onMonthChange}/>
        <div style={heroCard}>
          <div style={heroLabel}>{t("rent.netMonth", "Na czysto · {period}").replace("{period}", periodInSentence(ym))}</div>
          <div style={heroValue(totals.net >= 0)}>{fmtDisplay(totals.net, { showSign: totals.net !== 0 })}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Stat label={t("rent.income", "Przychód")} value={fmtDisplay(totals.income)} color="#34d399"/>
            <Stat label={t("rent.costs", "Koszty")} value={fmtDisplay(totals.costs)} color={totals.costs > 0 ? "#f87171" : "#e2e8f0"}/>
            <Stat label={t("rent.arrears", "Zaległe")} value={lateSum > 0 ? fmtDisplay(lateSum) : "—"} color={lateSum > 0 ? "#f87171" : "#e2e8f0"}/>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
            {t("rent.yearLine", "W roku {year}: na czysto {net} (przychód {income}, koszty {costs})")
              .replace("{year}", ym.slice(0, 4)).replace("{net}", fmtDisplay(yearTotals.net, { showSign: yearTotals.net !== 0 }))
              .replace("{income}", fmtDisplay(yearTotals.income)).replace("{costs}", fmtDisplay(yearTotals.costs))}
          </div>
        </div>

        {late.length > 0 && (
          <div style={{ ...card, marginTop: 10, padding: "12px 14px", background: "#f8717112", borderColor: "#f8717155" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5", marginBottom: 6 }}>{t("rent.lateTitle", "Zaległy czynsz")}</div>
            {late.map(({ p, list }) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#cbd5e1" }}>
                  <b>{p.name}</b>{p.tenant ? ` · ${p.tenant}` : ""}
                  <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>
                    {list.map(m => `${ymLabel(m.ym, "0000-00")} (${fmtCurrency(m.missing, p.currency || "PLN")})`).join(", ")}
                  </span>
                </span>
                <button onClick={() => startRent(p, list[list.length - 1].ym)} style={{ ...actionBtn("#34d399"), flex: "none", padding: "7px 12px" }}>{t("rent.act.paid", "Czynsz wpłynął")}</button>
              </div>
            ))}
          </div>
        )}

        <div style={sectionTitle}>{t("rent.places", "Miejsca")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map(placeCard)}
        </div>
        {archived.length > 0 && <>
          <button onClick={() => setShowArchived(v => !v)} style={{ ...sectionTitle, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "block" }}>
            {t("rent.archived", "Zakończony najem")} · {archived.length} {showArchived ? "▴" : "▾"}
          </button>
          {showArchived && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{archived.map(placeCard)}</div>}
        </>}
      </>}

      {form && <PlaceForm form={form} setForm={setForm} onSave={savePlace} onClose={() => setForm(null)} onDelete={form.id != null ? () => removePlace(rentals.find(p => p.id === form.id)) : null}/>}
      {money && <MoneyForm m={money} setM={setMoney} today={today} transactions={transactions} onClose={() => setMoney(null)} onSave={async () => { if (await saveMoney(money)) setMoney(null); }}/>}
      {place && <PlaceSheet p={place} today={today} transactions={transactions} onClose={() => setOpenId(null)} onEdit={() => startEdit(place)}
        onRent={(forYm) => { setOpenId(null); startRent(place, forYm); }} onMoney={(kind) => { setOpenId(null); startMoney(place, kind); }}
        onArchive={() => { setRentals(prev => prev.map(x => x.id === place.id ? { ...x, archived: !x.archived } : x)); setOpenId(null); }}/>}

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

function PlaceForm({ form, setForm, onSave, onClose, onDelete }) {
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const monthly = form.mode === "monthly";
  return (
    <Modal open onClose={onClose} title={form.id != null ? t("rent.editTitle", "Edytuj miejsce") : t("rent.newTitle", "Nowe miejsce")}>
      <div style={fieldLabel}>{t("rent.kindLabel", "Co wynajmujesz")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {KIND_ORDER.map(k => <Chip key={k} on={form.kind === k} color={KINDS[k].color} onClick={() => set({ kind: k, mode: KINDS[k].mode })}>{kindLabel(k)}</Chip>)}
      </div>
      <Input label={t("rent.name", "Nazwa")} value={form.name} onChange={e => set({ name: e.target.value })} placeholder={t("rent.namePh", "np. Kawalerka Mokotów")}/>

      <div style={fieldLabel}>{t("rent.modeLabel", "Jak zarabia")}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <Chip on={monthly} color={ACCENT} onClick={() => set({ mode: "monthly" })}>{t("rent.mode.monthly", "Czynsz co miesiąc")}</Chip>
        <Chip on={!monthly} color={ACCENT} onClick={() => set({ mode: "bookings" })}>{t("rent.mode.bookings", "Rezerwacje / na doby")}</Chip>
      </div>

      {monthly && <>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1.3 }}><Input label={t("rent.rent", "Czynsz miesięcznie")} type="number" inputMode="decimal" step="0.01" value={form.rent} onChange={e => set({ rent: e.target.value })} placeholder="0"/></div>
          <div style={{ flex: 0.9 }}>
            <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => set({ currency: e.target.value })}>
              {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><Input label={t("rent.dueDay", "Płatne do (dzień)")} type="number" inputMode="numeric" min="1" max="28" value={form.dueDay} onChange={e => set({ dueDay: e.target.value })}/></div>
          <div style={{ flex: 1.3 }}><Input label={t("rent.since", "Najem od")} type="date" value={form.since} onChange={e => set({ since: e.target.value })}/></div>
        </div>
        <Input label={t("rent.tenant", "Najemca (opcjonalnie)")} value={form.tenant} onChange={e => set({ tenant: e.target.value })} placeholder={t("rent.tenantPh", "np. Anna")}/>
      </>}
      {!monthly && (
        <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => set({ currency: e.target.value })}>
          {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      )}
      <Input label={t("rent.value", "Wartość (opcjonalnie — do rentowności)")} type="number" inputMode="decimal" step="0.01" value={form.value} onChange={e => set({ value: e.target.value })} placeholder={t("common.optional", "opcjonalnie")}/>

      {form.id != null && (
        <CheckRow checked={!!form.archived} onChange={(v) => set({ archived: v })}>{t("rent.archiveLabel", "Najem zakończony (zostaje w historii)")}</CheckRow>
      )}
      <button onClick={onSave} style={primaryBtn}>{t("common.save", "Zapisz")}</button>
      {onDelete && <button onClick={onDelete} style={dangerBtn}><Trash2 size={14}/> {t("rent.delete", "Usuń miejsce")}</button>}
    </Modal>
  );
}

function MoneyForm({ m, setM, today, transactions, onClose, onSave }) {
  const set = (patch) => setM(x => ({ ...x, ...patch }));
  const p = m.place;
  const cur = p.currency || "PLN";
  const title = m.kind === "rent" ? t("rent.act.paid", "Czynsz wpłynął") : m.kind === "booking" ? t("rent.act.booking", "Rezerwacja") : t("rent.act.cost", "Koszt");
  // Miesiące do wyboru przy czynszu: bieżący, 2 do przodu i zaległe/ostatnie 6
  const months = m.kind === "rent" ? [2, 1, 0, -1, -2, -3, -4, -5].map(d => shiftYm(today.slice(0, 7), d)).filter(x => !p.since || x >= p.since.slice(0, 7)) : [];
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`${title} · ${p.name}`}>
      {m.kind === "rent" && <>
        <div style={fieldLabel}>{t("rent.forMonth", "Za miesiąc")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {months.map(x => {
            const s = rentStatus(p, x, transactions, today);
            return <Chip key={x} on={m.ym === x} color={s.state === "late" || s.state === "partial" ? "#f87171" : ACCENT}
              onClick={() => set({ ym: x, amount: String(Math.round((s.missing ?? p.rent) * 100) / 100) })}>
              {ymLabel(x, today)}{s.state === "paid" ? " ✓" : ""}
            </Chip>;
          })}
        </div>
      </>}
      {m.kind === "cost" && <>
        <div style={fieldLabel}>{t("rent.costKind", "Na co")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {COSTS.map(([id]) => <Chip key={id} on={m.cost === id} color="#f87171" onClick={() => set({ cost: id })}>{costLabel(id)}</Chip>)}
        </div>
      </>}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1.2 }}><Input label={`${t("rent.amount", "Kwota")} · ${cur}`} type="number" inputMode="decimal" step="0.01" value={m.amount} onChange={e => set({ amount: e.target.value })} placeholder="0"/></div>
        <div style={{ flex: 1 }}><Input label={t("rent.date", "Data")} type="date" value={m.date} onChange={e => set({ date: e.target.value })}/></div>
      </div>
      {m.kind === "booking" && (
        <Input label={t("rent.nights", "Liczba nocy / dni (opcjonalnie)")} type="number" inputMode="numeric" value={m.nights} onChange={e => set({ nights: e.target.value })} placeholder={t("common.optional", "opcjonalnie")}/>
      )}
      {m.kind !== "rent" && (
        <Input label={t("rent.desc", "Opis (opcjonalnie)")} value={m.desc} onChange={e => set({ desc: e.target.value })}
          placeholder={m.kind === "booking" ? t("rent.bookingPh", "np. Airbnb, 3 noce") : `${costLabel(m.cost)}: ${p.name}`}/>
      )}
      <button onClick={async () => { setBusy(true); try { await onSave(); } finally { setBusy(false); } }} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
      </button>
    </Modal>
  );
}

function PlaceSheet({ p, today, transactions, onClose, onEdit, onRent, onMoney, onArchive }) {
  const monthly = modeOf(p) === "monthly";
  const k = kindOf(p);
  const year = today.slice(0, 4);
  const yt = rentalTotals(transactions, { rentalId: p.id, from: `${year}-01-01`, to: `${year}-12-31` });
  const all = rentalTotals(transactions, { rentalId: p.id });
  const y = rentalYield(p, transactions, today);
  const list = arrears(p, transactions, today);
  const entries = transactions.filter(tx => tx && tx.rentalId === p.id).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12);
  return (
    <Modal open onClose={onClose} title={p.name}>
      <div style={{ fontSize: 12, color: "#64748b", margin: "-12px 0 14px" }}>
        {[kindLabel(k), p.tenant, monthly && p.rent ? t("rent.perMonthDue", "{amount}/mies., płatne do {day}.").replace("{amount}", fmtCurrency(p.rent, p.currency || "PLN")).replace("{day}", p.dueDay || 10) : null].filter(Boolean).join(" · ")}
      </div>
      <div style={{ ...heroCard, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Stat label={t("rent.yearNet", "Na czysto {year}").replace("{year}", year)} value={fmtDisplay(yt.net, { showSign: yt.net !== 0 })} color={yt.net >= 0 ? "#34d399" : "#f87171"}/>
          <Stat label={t("rent.allNet", "Od początku")} value={fmtDisplay(all.net, { showSign: all.net !== 0 })} color={all.net >= 0 ? "#34d399" : "#f87171"}/>
          <Stat label={t("rent.yield", "Rentowność")} value={y != null ? `${y.toLocaleString(getLocale(), { maximumFractionDigits: 1 })}%` : "—"}/>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
          {t("rent.yearDetail", "W {year}: przychód {income}, koszty {costs}").replace("{year}", year).replace("{income}", fmtDisplay(yt.income)).replace("{costs}", fmtDisplay(yt.costs))}
          {!monthly && yt.nights > 0 && <span style={{ display: "block" }}>{t("rent.perNight", "Nocy: {n} · średnio {amount} za noc").replace("{n}", yt.nights).replace("{amount}", fmtDisplay(yt.income / yt.nights))}</span>}
          {y == null && <span style={{ display: "block" }}>{t("rent.yieldHint", "Wpisz wartość miejsca, żeby zobaczyć rentowność.")}</span>}
          {list.length > 0 && <span style={{ display: "block", color: "#f87171" }}>{t("rent.lateN", "Zaległe miesiące: {n}").replace("{n}", list.length)}</span>}
        </div>
      </div>

      {!p.archived && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {monthly
            ? <button onClick={() => onRent(list.length ? list[list.length - 1].ym : today.slice(0, 7))} style={{ ...actionBtn("#34d399"), padding: 11, fontSize: 12, borderRadius: 12 }}>{t("rent.act.paid", "Czynsz wpłynął")}</button>
            : <button onClick={() => onMoney("booking")} style={{ ...actionBtn("#34d399"), padding: 11, fontSize: 12, borderRadius: 12 }}>+ {t("rent.act.booking", "Rezerwacja")}</button>}
          <button onClick={() => onMoney("cost")} style={{ ...actionBtn("#f87171"), padding: 11, fontSize: 12, borderRadius: 12 }}>+ {t("rent.act.cost", "Koszt")}</button>
        </div>
      )}

      {entries.length > 0 && <>
        <div style={{ ...fieldLabel, marginTop: 16 }}>{t("rent.entries", "Ostatnie wpisy")}</div>
        <div style={{ ...card, background: "#060b14", padding: "2px 12px" }}>
          {entries.map((tx, i) => (
            <div key={tx.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < entries.length - 1 ? "1px solid #0f1a2e" : "none" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || "—"}</span>
                <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>{tx.date}</span>
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: tx.amount < 0 ? "#f87171" : "#34d399" }}>{fmtDisplay(txAmountForDisplay(tx), { showSign: true })}</span>
            </div>
          ))}
        </div>
      </>}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onEdit} style={{ ...dangerBtn, marginTop: 0, borderColor: "#1a2744", color: "#94a3b8" }}><Pencil size={13}/> {t("common.edit", "Edytuj")}</button>
        <button onClick={onArchive} style={{ ...dangerBtn, marginTop: 0, borderColor: "#1a2744", color: "#94a3b8" }}><Archive size={13}/> {p.archived ? t("rent.restore", "Przywróć") : t("rent.archive", "Zakończ najem")}</button>
      </div>
    </Modal>
  );
}

export { RentalView };

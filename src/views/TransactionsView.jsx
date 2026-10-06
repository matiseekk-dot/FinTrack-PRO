import { useState, useMemo, useEffect } from "react";
import { PlusCircle, Edit2, Trash2, Copy, Search, ChevronRight } from "lucide-react";
import { Card } from "../components/ui/Card.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Input } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { fmt, fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { useToast } from "../hooks/useToast.js";
import { useHaptic } from "../hooks/useHaptic.js";
import { t, getLang } from "../i18n.js";
import { checkLimit } from "../lib/rateLimit.js";
import { getActiveTrips, getSelectableTrips } from "../lib/trips.js";
import { getRate, getCurrentRates, getRateForDate, getDisplayCurrency, txAmountForDisplay, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { txAmountInAccountCurrency } from "../lib/accountTypes.js";
import { resolveCategory } from "../lib/categoryHelpers.js";
import { MODULES, SIDE_MODULES, getModule, moduleLabel } from "../lib/modules.js";
import { isRulesOnlyElsewhere } from "../lib/hobby.js";

// Kategoria wpisu wynika z modułu i typu. Wybiera się ją tylko przy Wyjazdach —
// tam dzieli budżet wyjazdu (noclegi, jedzenie, transport…).
const MODULE_DEFAULT_CAT = {
  betting:     { expense: "bukmacher", income: "bukmacherka" },
  reselling:   { expense: "zakupy", income: "sprzedaż" },
  freelance:   { expense: "zakupy", income: "dodatkowe" },
  collections: { expense: "zakupy", income: "sprzedaż" },
  investments: { expense: "inwestycje", income: "inwestycje" },
  rental:      { expense: "rachunki", income: "dodatkowe" },
  trips:       { expense: "jedzenie", income: "zwrot" },
  hobby:       { expense: "rozrywka", income: "zwrot" },
};
// Moduły, w których częściej zapisuje się przychód
const INCOME_FIRST = ["freelance", "reselling", "rental"];
const TRIP_CATS = ["noclegi", "jedzenie", "transport", "rozrywka", "zakupy", "kawiarnia", "alkohol", "prezenty", "zdrowie"];
// Hobby i subskrypcje: na co poszły pieniądze (subskrypcje cykliczne są w ekranie modułu)
const HOBBY_CATS = ["wydarzenia", "kino", "gry", "subskrypcje", "sport", "muzyka", "rozrywka"];
const CHIP_CATS = { trips: TRIP_CATS, hobby: HOBBY_CATS };
const catFor = (module, type, pickedCat) =>
  type === "expense" && CHIP_CATS[module] && CHIP_CATS[module].includes(pickedCat)
    ? pickedCat
    : (MODULE_DEFAULT_CAT[module] && MODULE_DEFAULT_CAT[module][type]) || (type === "income" ? "dodatkowe" : "zakupy");

function TransactionsView({ transactions, setTransactions, setAccounts, allCats, presetModule = null, presetTripId = null, _forceOpenModal, _onClose, _onModalClose, defaultAcc = 1, trips = [], modules = null, hobbies = [], moduleFilter, onModuleFilterChange, onOpenLinked }) {
  const getLocalCat = (id) => resolveCategory(id, allCats);
  const { toast, showToast } = useToast();
  const { success: hapticSuccess, error: hapticError } = useHaptic();
  const [swipedId, setSwipedId] = useState(null); // id of swiped transaction
  const [modal, setModal] = useState(_forceOpenModal || false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Filtr modułu: kontrolowany z App (klik w moduł na Home) albo lokalny
  const [localModFilter, setLocalModFilter] = useState("all");
  const modFilter = onModuleFilterChange ? (moduleFilter || "all") : localModFilter;
  const setModFilter = onModuleFilterChange || setLocalModFilter;
  const lang = getLang();
  // Moduły do wyboru przy wpisie: włączone moduły dochodu pobocznego + Wyjazdy (gdy jest wyjazd,
  // do którego można przypisać wydatek). Wydatki osobiste nie są już częścią apki — stare wpisy
  // tego typu zostają w danych i w eksporcie, ale nie pokazujemy ich.
  const selectableTrips = getSelectableTrips(trips || []);
  const enabled = Array.isArray(modules) ? modules : [];
  const formModules = [
    ...SIDE_MODULES.filter(id => enabled.includes(id)),
    ...(enabled.includes("hobby") ? ["hobby"] : []),
    ...((enabled.includes("trips") && selectableTrips.length > 0) || presetTripId != null ? ["trips"] : []),
  ];
  const filterModules = enabled.filter(id => id !== "personal" && MODULES[id]);
  const [editingId, setEditingId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  // Kolekcje, do których można przypisać wpis modułu Kolekcje — bez tego wpis
  // nie pojawia się w żadnej kolekcji (ani w jej wydatkach, ani w katalogu).
  const activeCollections = (hobbies || []).filter(h => !h.archived && !h.movedToHobby && !isRulesOnlyElsewhere(h));
  const defaultCollectionId = () => {
    const last = transactions.find(tx => tx.hobbyId != null && activeCollections.some(h => h.id === tx.hobbyId));
    return last ? last.hobbyId : (activeCollections[0]?.id ?? null);
  };
  // Wyjazd domyślny: trwający, a jeśli żaden nie trwa — najbliższy do wyboru
  const defaultTrip = () => getActiveTrips(trips || [])[0] || selectableTrips[0] || null;
  const lastModule = () => {
    const tx = transactions.find(x => x.module && formModules.includes(x.module));
    return tx ? tx.module : (formModules[0] || null);
  };
  // Pola zależne od modułu: typ, kolekcja, wyjazd i jego waluta
  const moduleFields = (module, f = {}) => {
    const trip = module === "trips" ? ((trips || []).find(x => x.id === f.tripId) || defaultTrip()) : null;
    return {
      // Wyjazd ze znajomymi: domyślnie dzielony po równo na całą ekipę
      tripSplit: trip && (trip.participants || []).length ? ["me", ...trip.participants.map(p => p.id)] : null,
      module,
      type: INCOME_FIRST.includes(module) ? "income" : "expense",
      hobbyId: module === "collections" ? (f.hobbyId ?? defaultCollectionId()) : null,
      tripId: trip ? trip.id : null,
      currency: trip && trip.defaultCurrency && (!f.currency || f.currency === getDisplayCurrency()) ? trip.defaultCurrency : (f.currency || getDisplayCurrency()),
    };
  };
  const getEmptyForm = () => {
    const module = formModules.includes(presetModule) ? presetModule : formModules.includes(modFilter) ? modFilter : lastModule();
    return { date: todayLocal(), desc: "", amount: "", acc: defaultAcc, tripCat: "jedzenie", hobbyCat: "wydarzenia", currency: getDisplayCurrency(), ...moduleFields(module, { tripId: presetTripId }) };
  };
  // Formularz z istniejącego wpisu (edycja albo kopia)
  const formFromTx = (tx, copy) => {
    // Kopia też zostaje w walucie oryginału — kurs pobierze się na nowo z dnia kopii
    const hasFx = tx.origCurrency && tx.origCurrency !== "PLN" && tx.origAmount != null;
    const module = tx.module || getModule(tx, hobbies);
    return {
      date: copy ? todayLocal() : tx.date, desc: tx.desc,
      amount: String(Math.abs(hasFx ? tx.origAmount : tx.amount)),
      acc: tx.acc ?? defaultAcc,
      type: tx.amount > 0 ? "income" : "expense",
      currency: hasFx ? tx.origCurrency : "PLN",
      module, hobbyId: tx.hobbyId ?? null, tripId: tx.tripId ?? null, tripSplit: Array.isArray(tx.tripSplit) ? tx.tripSplit : null,
      tripCat: TRIP_CATS.includes(tx.cat) ? tx.cat : "jedzenie",
      hobbyCat: HOBBY_CATS.includes(tx.cat) ? tx.cat : "wydarzenia",
    };
  };
  const [form, setForm] = useState(getEmptyForm);
  const [saving, setSaving] = useState(false); // spinner gdy fetch historycznego kursu leci
  // v1.6.2: lokalna kontrola pokazywania dropdown sugestii. User pisze "Biedronka Mokotów"
  // a sugestia "Biedronka" zasłaniała pole Kwota poniżej — i gdy próbował kliknąć w Kwotę,
  // trafiał na sugestię i nadpisywał własny wpis. Teraz Esc/blur/Enter/X-button ukrywa.
  const [showDescSuggestions, setShowDescSuggestions] = useState(true);

  // v1.6.1: gdy parent zmieni _forceOpenModal z false→true (np. user klika FAB w bottom
  // nav będąc już w tabie transactions), wcześniej `useState(initial)` ignorował zmianę
  // i modal się NIE otwierał. Teraz reagujemy reaktywnie. Reset form na świeży gdy
  // otwieramy z external trigger (żeby nie pokazywać starych danych z poprzedniej edycji).
  useEffect(() => {
    if (_forceOpenModal) {
      setModal(true);
      setEditingId(null);
      setForm(getEmptyForm());
    }
  }, [_forceOpenModal]);

  const addTx = async () => {
    if (saving) return;
    if (!form.desc || !form.amount) return;
    if (!form.module) { showToast(t("tx.err.module", "Wybierz moduł"), "error"); return; }
    if (form.module === "trips" && form.tripId == null) { showToast(t("tx.err.trip", "Wybierz wyjazd"), "error"); return; }
    // Rate limit - zapobiega przypadkowym pętlom / atakom
    if (!editingId) {
      const rateCheck = checkLimit("addTransaction");
      if (!rateCheck.allowed) {
        alert(t("tx.rateLimit", "Za dużo wpisów naraz. Spróbuj za {s} s.").replace("{s}", Math.ceil(rateCheck.resetIn/1000)));
        return;
      }
    }
    // Walidacja kwoty: nie może być NaN, Infinity, ujemna lub zero
    const parsedAmount = parseFloat(String(form.amount).replace(",", "."));
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast(t("tx.err.amount", "Wprowadź poprawną kwotę"), "error");
      return;
    }
    // Walidacja daty: musi być poprawną datą
    if (!form.date || isNaN(new Date(form.date).getTime())) {
      showToast(t("tx.err.date", "Wprowadź poprawną datę"), "error");
      return;
    }
    const finalCat = catFor(form.module, form.type, form.module === "hobby" ? form.hobbyCat : form.tripCat);
    // Multi-currency (v1.4.1): dla nie-PLN pobierz HISTORYCZNY kurs z dnia tx,
    // nie dzisiejszy. NBP /tables/A/{date} z fallbackiem do najbliższego dnia
    // roboczego wstecz; offline → dzisiejszy kurs jako last resort.
    let safeRate = 1;
    let fxMeta = null; // { origAmount, origCurrency, fxRate, fxDate } albo null dla PLN
    if (form.currency && form.currency !== "PLN") {
      setSaving(true);
      try {
        const r = await getRateForDate(form.currency, form.date);
        safeRate = isFinite(r) ? r : (isFinite(getRate(form.currency)) ? getRate(form.currency) : 1);
        fxMeta = {
          origAmount:   parseFloat(Math.abs(parsedAmount).toFixed(2)),
          origCurrency: form.currency.toUpperCase(),
          fxRate:       parseFloat(safeRate.toFixed(6)),
          fxDate:       form.date,
        };
      } catch (e) {
        console.warn("[tx] FX fetch failed, using today's rate", e);
        const r = getRate(form.currency);
        safeRate = isFinite(r) ? r : 1;
        fxMeta = {
          origAmount:   parseFloat(Math.abs(parsedAmount).toFixed(2)),
          origCurrency: form.currency.toUpperCase(),
          fxRate:       parseFloat(safeRate.toFixed(6)),
          fxDate:       form.date,
        };
      } finally {
        setSaving(false);
      }
    }
    const rawAmt = Math.abs(parsedAmount) * safeRate;

    const amt    = form.type === "expense" ? -rawAmt : rawAmt;
    const txData = { date: form.date, desc: form.desc, amount: parseFloat(amt.toFixed(2)), cat: finalCat, acc: parseInt(form.acc) || defaultAcc, module: form.module };
    // Wyjazd i kolekcja tylko w swoich modułach (edycja czyści stare przypisanie)
    if (form.module === "trips" && form.tripId != null) {
      txData.tripId = form.tripId;
      const split = Array.isArray(form.tripSplit) ? form.tripSplit : null;
      txData.tripSplit = split && (split.length > 1 || (split.length === 1 && split[0] !== "me")) ? split : null;
    } else if (editingId) { txData.tripId = null; txData.tripSplit = null; }
    if (form.module === "collections" && form.hobbyId != null) txData.hobbyId = form.hobbyId;
    else if (editingId) txData.hobbyId = null;
    // v1.4.1: dorzuć metadane FX dla tx walutowych. Tx w PLN nie mają tych pól
    // (oszczędność miejsca + backward compat — stare tx czytane jako PLN).
    // Edge case: edit walutowej → PLN MUSI explicit-null'ować stare pola,
    // inaczej spread { ...t, ...txData } zachowa stare origCurrency.
    if (fxMeta) {
      txData.origAmount   = fxMeta.origAmount;
      txData.origCurrency = fxMeta.origCurrency;
      txData.fxRate       = fxMeta.fxRate;
      txData.fxDate       = fxMeta.fxDate;
    } else if (editingId) {
      txData.origAmount   = null;
      txData.origCurrency = null;
      txData.fxRate       = null;
      txData.fxDate       = null;
    }
    if (editingId) {
      // reverse old tx on old account, apply new tx on new account
      // v1.5.0: każda strona księgowania używa konwersji na walutę konta
      const oldTx = transactions.find(t => t.id === editingId);
      if (oldTx && setAccounts) {
        setAccounts(accs => accs.map(a => {
          if (a.type === "invest") return a; // skip invest accounts
          if (a.id === oldTx.acc && a.id === txData.acc) {
            const delta = -txAmountInAccountCurrency(a, oldTx) + txAmountInAccountCurrency(a, txData);
            return { ...a, balance: parseFloat((a.balance + delta).toFixed(2)) };
          }
          if (a.id === oldTx.acc)
            return { ...a, balance: parseFloat((a.balance - txAmountInAccountCurrency(a, oldTx)).toFixed(2)) };
          if (a.id === txData.acc)
            return { ...a, balance: parseFloat((a.balance + txAmountInAccountCurrency(a, txData)).toFixed(2)) };
          return a;
        }));
      }
      setTransactions(tx => tx.map(t => t.id === editingId ? { ...t, ...txData } : t));
      setEditingId(null);
      showToast(t("tx.toast.updated", "Wpis zaktualizowany ✓"));
      hapticSuccess();
    } else {
      // apply amount to linked account (only savings/checking, not invest)
      if (setAccounts) {
        setAccounts(accs => accs.map(a => {
          if (a.id !== txData.acc) return a;
          if (a.type === "invest") return a; // investment accounts managed separately
          return { ...a, balance: parseFloat((a.balance + txAmountInAccountCurrency(a, txData)).toFixed(2)) };
        }));
      }
      setTransactions(tx => [{ id: Date.now(), ...txData }, ...tx]);
      showToast(t("tx.toast.added", "Wpis dodany ✓"));
      hapticSuccess();
    }
    setModal(false);
    if (_onModalClose) _onModalClose();
  };

  const todayStr2 = todayLocal();
  const labelStyle = { fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" };
  const chip = (on, color) => ({
    padding: "6px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
    background: on ? color + "22" : "#060b14", border: `1px solid ${on ? color : "#1a2744"}`, color: on ? color : "#64748b",
  });

  // Memoized filter + grouping - jedna pętla zamiast 4 filter + forEach
  const { filtered, grouped } = useMemo(() => {
    const searchLower = search.toLowerCase();
    const result = [];
    const groupMap = {};

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      // Single-pass filter
      if (t.date > todayStr2) continue;
      if (filter === "income" && t.amount <= 0) continue;
      if (filter === "expense" && t.amount >= 0) continue;
      const mod = getModule(t, hobbies);
      if (mod === "personal") continue;   // stare wydatki osobiste: zostają w danych, nie na liście
      if (modFilter !== "all" && mod !== modFilter) continue;
      if (searchLower !== "") {
        const descMatch = t.desc && t.desc.toLowerCase().includes(searchLower);
        const modMatch = moduleLabel(mod, lang).toLowerCase().includes(searchLower);
        if (!descMatch && !modMatch) continue;
      }
      result.push(t);
      if (!groupMap[t.date]) groupMap[t.date] = [];
      groupMap[t.date].push(t);
    }

    const sorted = Object.entries(groupMap).sort((a, b) => b[0].localeCompare(a[0]));
    return { filtered: result, grouped: sorted };
  }, [transactions, filter, search, todayStr2, modFilter, hobbies, lang]);

  // Podpis wpisu: moduł + kolekcja / wyjazd i kategoria wyjazdu
  const rowMeta = (tx) => {
    const mod = getModule(tx, hobbies);
    const parts = [moduleLabel(mod, lang)];
    if (mod === "collections" && tx.hobbyId != null) {
      const h = (hobbies || []).find(x => x.id === tx.hobbyId);
      if (h) parts.push(h.name);
    }
    if (mod === "hobby" && tx.amount < 0) parts.push(getLocalCat(tx.cat).label);
    if (mod === "trips") {
      const trip = (trips || []).find(x => x.id === tx.tripId);
      if (trip) parts.push(trip.name);
      if (tx.amount < 0) parts.push(getLocalCat(tx.cat).label);
    }
    return { mod, text: parts.join(" · ") };
  };

  return (
    <div style={{ padding: "0 16px 100px" }}>
      <div style={{ paddingTop: 4, paddingBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all",t("tx.all")],["income",t("tx.income")],["expense",t("tx.expense")]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? "#1e3a5f" : "#0d1628", border: `1px solid ${filter === v ? "#2563eb" : "#1a2744"}`, color: filter === v ? "#60a5fa" : "#64748b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={() => { setForm(getEmptyForm()); setEditingId(null); setModal(true); }} style={{ background: "#1e3a5f", border: "1px solid #2563eb44", color: "#60a5fa", borderRadius: 10, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600 }}>
            <PlusCircle size={13}/> {t("common.add", "Dodaj")}
          </button>
        </div>

        {/* Filtr modułów Sidegig */}
        {filterModules.length > 1 && (
          <div role="group" aria-label={t("tx.module.filter", "Filtr modułu")} style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
            {["all", ...filterModules].map(id => {
              const on = modFilter === id;
              const color = id === "all" ? "#34d399" : MODULES[id].color;
              const Icon = id === "all" ? null : MODULES[id].icon;
              return (
                <button key={id} onClick={() => setModFilter(id)} aria-pressed={on} style={{
                  display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
                  padding: "6px 10px", borderRadius: 9, cursor: "pointer", whiteSpace: "nowrap",
                  fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                  background: on ? color + "22" : "#0d1628",
                  border: `1px solid ${on ? color : "#1a2744"}`,
                  color: on ? color : "#64748b",
                }}>
                  {Icon && <Icon size={12}/>}
                  {id === "all" ? t("tx.module.all", "Wszystkie moduły") : moduleLabel(id, lang)}
                </button>
              );
            })}
          </div>
        )}

        {/* Wyszukiwanie — zawsze widoczne */}
        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={14} color="#475569" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("tx.search")}
              style={{ width: "100%", background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: "9px 14px 9px 34px", color: "#e2e8f0", fontSize: 15, fontFamily: "'Space Grotesk', sans-serif", outline: "none", boxSizing: "border-box", WebkitAppearance: "none" }}
            />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2 }}>✕</button>}
          </div>
        </div>

        {search && (
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>
            {t("tx.foundCount")}: <span style={{ color: "#60a5fa", fontWeight: 700 }}>{filtered.length}</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
              {search ? t("tx.empty.noResults", "Brak wyników") : t("tx.empty.noTx", "Brak wpisów")}
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
              {search
                ? t("tx.empty.tryFilters", "Spróbuj zmienić filtry wyszukiwania")
                : t("tx.empty.addFirst", "Dodaj pierwszy wpis przyciskiem poniżej")}
            </div>
            {!search && (
              <button onClick={() => { setForm(getEmptyForm()); setEditingId(null); setModal(true); }} style={{
                background: "linear-gradient(135deg,#059669,#10b981)", border: "none",
                borderRadius: 12, padding: "12px 24px", color: "white",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>{t("tx.add", "+ Dodaj wpis")}</button>
            )}
          </div>
        )}
        {grouped.map(([date, txs]) => (
          <div key={date}>
            {(() => {
              const dayTotal = txs.filter(t => t.cat !== "inne").reduce((s,t) => s + txAmountForDisplay(t), 0);
              const dayExp   = txs.filter(t => t.amount < 0 && t.cat !== "inne").reduce((s,t) => s + Math.abs(txAmountForDisplay(t)), 0);
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{date}</div>
                  {dayExp > 0 && (
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700,
                      color: dayTotal >= 0 ? "#10b981" : "#ef4444" }}>
                      {dayTotal >= 0 ? "+" : "−"}{fmtDisplay(Math.abs(dayTotal))}
                    </div>
                  )}
                </div>
              );
            })()}
            <Card style={{ padding: "4px 16px" }}>
              {txs.map((tx, i) => {
                const meta = rowMeta(tx);
                const mdef = MODULES[meta.mod] || MODULES.personal;
                const Icon = mdef.icon;
                // Kwota w walucie głównej; gdy wpis był w tej walucie — dokładnie ta kwota (bez dryfu kursu).
                // Oryginalna waluta pod spodem tylko gdy różni się od głównej.
                const dispCur = getDisplayCurrency();
                const nativeCur = (tx.origCurrency && tx.origAmount != null) ? tx.origCurrency.toUpperCase() : "PLN";
                const nativeAmt = Math.abs(nativeCur === "PLN" ? tx.amount : tx.origAmount);
                const mainAmt = nativeCur === dispCur ? fmtCurrency(nativeAmt, dispCur) : fmtDisplay(Math.abs(tx.amount));
                // Wpis kuponu albo przedmiotu: edycja w ekranie modułu, żeby kurs/prowizja zgadzały się z kwotą
                const linked = !!onOpenLinked && (!!tx.bet || !!tx.betTransfer || !!tx.tripSettle || tx.resaleItemId != null || tx.gigId != null || tx.collectionItemId != null || tx.subscriptionId != null);
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
                      if (linked) return; // kupon/przedmiot usuwa się w jego ekranie
                      const dx = e.changedTouches[0].clientX - (e.currentTarget._swipeX || 0);
                      if (dx < -50) { setSwipedId(tx.id); hapticError(); }
                      else if (dx > 30) setSwipedId(null);
                    }}
                  >
                    {/* Icon */}
                    <div style={{ background: mdef.color+"1a", borderRadius: 10, padding: 8, flexShrink: 0 }}>
                      <Icon size={14} color={mdef.color}/>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2, display: "flex", alignItems: "center", gap: 5, overflow: "hidden", whiteSpace: "nowrap" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta.text}</span>
                      </div>
                    </div>

                    {/* Amount + opcjonalnie oryginalna waluta */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600,
                        color: tx.amount > 0 ? "#10b981" : "#ef4444" }}>
                        {tx.amount > 0 ? "+" : "−"}{mainAmt}
                      </div>
                      {nativeCur !== dispCur && (
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#64748b", marginTop: 1 }}>
                          {fmtCurrency(nativeAmt, nativeCur)}
                        </div>
                      )}
                    </div>

                    {/* Swipe delete reveal */}
                    {swipedId === tx.id && (
                      <button
                        onClick={() => {
                          setAccounts(accs => accs.map(a =>
                            a.id === tx.acc && a.type !== "invest"
                              ? { ...a, balance: parseFloat((a.balance - txAmountInAccountCurrency(a, tx)).toFixed(2)) } : a
                          ));
                          setTransactions(t => t.filter(x => x.id !== tx.id));
                          setSwipedId(null);
                          showToast(t("tx.deleted", "Usunięto: {desc}").replace("{desc}", tx.desc), "error", 3000);
                          hapticError();
                        }}
                        style={{
                          position: "absolute", right: -72, top: 0, bottom: 0, width: 64,
                          background: "#7f1d1d", border: "none", cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center",
                          justifyContent: "center", gap: 2, borderRadius: "0 8px 8px 0",
                        }}>
                        <span style={{ fontSize: 16 }}>🗑</span>
                        <span style={{ fontSize: 9, color: "#fca5a5", fontWeight: 700 }}>{t("common.delete", "Usuń")}</span>
                      </button>
                    )}

                    {/* Action buttons   always visible */}
                    {linked ? (
                      <button onClick={() => onOpenLinked(tx)} title={t("tx.openLinked", "Otwórz w module")}
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#a78bfa", flexShrink: 0 }}>
                        <ChevronRight size={12}/>
                      </button>
                    ) : (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          // Copy: nowa tx z dzisiejszą datą + tych samych pól.
                          // editingId=null żeby zapis był jako NOWA, nie nadpisywał oryginału.
                          setEditingId(null);
                          setForm(formFromTx(tx, true));
                          setModal(true);
                        }}
                        title={t("tx.copy", "Kopiuj")}
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#475569" }}>
                        <Copy size={12}/>
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(tx.id);
                          setForm(formFromTx(tx, false));
                          setModal(true);
                        }}
                        title={t("common.edit", "Edytuj")}
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#60a5fa" }}>
                        <Edit2 size={12}/>
                      </button>
                      <button
                        onClick={() => {
                          // Remove transaction and reverse account balance
                          setAccounts(accs => accs.map(a =>
                            a.id === tx.acc && a.type !== "invest"
                              ? { ...a, balance: parseFloat((a.balance - txAmountInAccountCurrency(a, tx)).toFixed(2)) }
                              : a
                          ));
                          setTransactions(t => t.filter(x => x.id !== tx.id));
                          showToast(t("tx.deleted", "Usunięto: {desc}").replace("{desc}", tx.desc), "error", 3000);
                        }}
                        title={t("common.delete", "Usuń")}
                        style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 7,
                          padding: "5px 7px", cursor: "pointer", color: "#f87171" }}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
      </div>

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
      <Modal open={modal} onClose={() => {
        setModal(false);
        setEditingId(null);
        // v1.6.1: inform parent (App.jsx quickAddOpen / FAB) że modal zamknięty
        // — bez tego klik X w external-triggered modalu nie resetuje parent state,
        // i kolejny klik "+" jest no-op (state już true → useEffect nie reaguje).
        if (_onModalClose) _onModalClose();
        if (_onClose) _onClose();
      }} title={editingId ? t("tx.editTitle", "Edytuj wpis") : t("tx.newTitle", "Nowy wpis")}>
        {formModules.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 14 }}>
            {t("tx.noModules", "Włącz moduł w Więcej → Moduły, żeby dodawać wpisy.")}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>{t("tx.module.label", "Moduł")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(formModules.includes(form.module) || !form.module ? formModules : [form.module, ...formModules]).map(id => {
                const on = form.module === id;
                const color = MODULES[id].color;
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => setForm(f => f.module === id ? f : { ...f, ...moduleFields(id, f) })} style={chip(on, color)}>
                    {moduleLabel(id, lang)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            ["expense", t("tx.type.expense", "Wydatek"), "#ef4444"],
            ["income",  t("tx.type.income", "Przychód"), "#10b981"],
          ].map(([v, l, c]) => (
            <button key={v} type="button" onClick={() => setForm(f => ({ ...f, type: v }))} style={{ flex: 1, background: form.type === v ? c + "22" : "#060b14", border: `1px solid ${form.type === v ? c : "#1a2744"}`, color: form.type === v ? c : "#64748b", borderRadius: 10, padding: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
              {l}
            </button>
          ))}
        </div>

        {form.module === "collections" && (
          activeCollections.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>{t("tx.collection.label", "Kolekcja")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {activeCollections.map(h => (
                  <button key={h.id} type="button" aria-pressed={form.hobbyId === h.id} onClick={() => setForm(f => ({ ...f, hobbyId: h.id }))} style={chip(form.hobbyId === h.id, h.color)}>{h.name}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#64748b", margin: "-6px 0 14px" }}>
              {t("tx.collection.none", "Załóż kolekcję w module Kolekcje, żeby wpis trafił do niej.")}
            </div>
          )
        )}

        {form.module === "trips" && (() => {
          // Do wyboru: wyjazdy trwające, nadchodzące i niedawno zakończone (+ ten edytowanego wpisu)
          const options = [...selectableTrips];
          if (form.tripId != null && !options.some(x => x.id === form.tripId)) {
            const orphan = (trips || []).find(x => x.id === form.tripId);
            if (orphan) options.unshift(orphan);
          }
          const activeIds = new Set(getActiveTrips(trips || []).map(x => x.id));
          return <>
            <div style={{ marginBottom: 14 }}>
              <div style={labelStyle}>{t("tx.trip.label", "Wyjazd")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {options.map(trip => (
                  <button key={trip.id} type="button" aria-pressed={form.tripId === trip.id} onClick={() => setForm(f => ({
                    ...f, tripId: trip.id,
                    // Waluta wyjazdu, chyba że ktoś świadomie wybrał inną
                    currency: trip.defaultCurrency && f.currency === getDisplayCurrency() ? trip.defaultCurrency : f.currency,
                  }))} style={{ ...chip(form.tripId === trip.id, trip.color), display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {activeIds.has(trip.id) && <span style={{ color: "#10b981", fontSize: 8 }}>●</span>}
                    {trip.name}
                  </button>
                ))}
              </div>
            </div>
            {form.type === "expense" && (() => {
              const trip = (trips || []).find(x => x.id === form.tripId);
              const people = (trip && trip.participants) || [];
              if (!people.length) return null;
              const split = Array.isArray(form.tripSplit) ? form.tripSplit : ["me"];
              const toggle = (id) => setForm(f => {
                const cur = Array.isArray(f.tripSplit) ? f.tripSplit : ["me"];
                return { ...f, tripSplit: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
              });
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={labelStyle}>{t("trips.splitWith", "Podziel po równo z")}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[{ id: "me", name: t("trips.me", "Ja") }, ...people].map(p => (
                      <button key={p.id} type="button" aria-pressed={split.includes(p.id)} onClick={() => toggle(p.id)} style={chip(split.includes(p.id), trip.color || "#3b82f6")}>{p.name}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {form.type === "expense" && (
              <div style={{ marginBottom: 14 }}>
                <div style={labelStyle}>{t("tx.trip.category", "Na co")}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TRIP_CATS.map(id => {
                    const c = getLocalCat(id);
                    return <button key={id} type="button" aria-pressed={form.tripCat === id} onClick={() => setForm(f => ({ ...f, tripCat: id }))} style={chip(form.tripCat === id, c.color)}>{c.label}</button>;
                  })}
                </div>
              </div>
            )}
          </>;
        })()}

        {form.module === "hobby" && form.type === "expense" && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>{t("tx.trip.category", "Na co")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {HOBBY_CATS.map(id => {
                const c = getLocalCat(id);
                return <button key={id} type="button" aria-pressed={form.hobbyCat === id} onClick={() => setForm(f => ({ ...f, hobbyCat: id }))} style={chip(form.hobbyCat === id, c.color)}>{c.label}</button>;
              })}
            </div>
          </div>
        )}

        {/* Description with autocomplete */}
        <div style={{ marginBottom: 14, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6,
            textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("tx.field.desc", "Opis")}</div>
          <input
            value={form.desc}
            onChange={e => {
              setForm(f => ({...f, desc: e.target.value}));
              setShowDescSuggestions(true); // pokaż sugestie przy każdej zmianie
            }}
            onKeyDown={e => {
              // Esc / Enter ukrywa dropdown żeby user mógł przejść do następnego pola
              if (e.key === "Escape" || e.key === "Enter") {
                if (e.key === "Enter") e.preventDefault(); // nie submituj formy
                setShowDescSuggestions(false);
              }
            }}
            // blur z opóźnieniem żeby klik na sugestię mógł się załapać
            onBlur={() => setTimeout(() => setShowDescSuggestions(false), 150)}
            placeholder={t("tx.placeholder.desc", "np. Biedronka")}
            autoComplete="off"
            style={{ width: "100%", background: "#060b14", border: "1px solid #1a2744",
              borderRadius: 10, padding: "12px 14px", color: "#e2e8f0", fontSize: 16,
              fontFamily: "'Space Grotesk', sans-serif", outline: "none", WebkitAppearance: "none" }}
          />
          {/* Suggestions */}
          {showDescSuggestions && form.desc.length >= 2 && (() => {
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
                {/* v1.6.2: Header z X — żeby user mógł explicit ukryć dropdown gdy chce wpisać
                    własną wartość podobną do sugestii (np. "Biedronka Mokotów" vs "Biedronka") */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px 4px 14px", borderBottom: "1px solid #0f1a2e",
                  background: "#0a1120" }}>
                  <span style={{ fontSize: 9, color: "#475569", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {t("tx.suggestionsHint", "Podpowiedzi · Esc albo X, by ukryć")}
                  </span>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setShowDescSuggestions(false); }}
                    style={{
                      background: "#1a2744", border: "none", borderRadius: 6,
                      width: 22, height: 22, cursor: "pointer", color: "#94a3b8",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, lineHeight: 1, padding: 0,
                    }}>
                    ✕
                  </button>
                </div>
                {suggestions.map(s => {
                  // find last transaction with this desc to pre-fill cat & acc
                  const prev = transactions.find(t => t.desc === s);
                  return (
                    <button key={s}
                      // onMouseDown zamiast onClick — onClick na buttonie odpala się po blur
                      // inputa (przez timeout 150ms), ale onMouseDown odpala się PRZED blur,
                      // więc na pewno zdąży się wybrać sugestia.
                      onMouseDown={e => {
                        e.preventDefault();
                        setForm(f => {
                          if (!prev) return { ...f, desc: s };
                          const prevMod = prev.module || getModule(prev, hobbies);
                          const sameMod = formModules.includes(prevMod) ? prevMod : f.module;
                          return {
                            ...f, ...(sameMod !== f.module ? moduleFields(sameMod, f) : {}), desc: s,
                            type: prev.amount > 0 ? "income" : "expense",
                            hobbyId: sameMod === "collections" ? (prev.hobbyId ?? f.hobbyId) : null,
                            tripCat: TRIP_CATS.includes(prev.cat) ? prev.cat : f.tripCat,
                          };
                        });
                        setShowDescSuggestions(false);
                      }}
                      style={{
                        width: "100%", background: "none", border: "none",
                        borderBottom: "1px solid #0f1a2e", padding: "11px 14px",
                        cursor: "pointer", textAlign: "left", display: "flex",
                        alignItems: "center", justifyContent: "space-between",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#1a2744"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ fontSize: 14, color: "#e2e8f0" }}>{s}</span>
                      {prev && <span style={{ fontSize: 11, color: "#475569" }}>{moduleLabel(prev.module || getModule(prev, hobbies), lang)}</span>}
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
            textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("tx.amount", "Kwota")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" inputMode="decimal" value={form.amount}
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
              {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Currency conversion preview — live z NBP (24h cache). Pokazujemy równowartość
              w walucie głównej; gdy wpis jest w walucie głównej, podgląd jest zbędny. */}
          {form.currency && form.amount && form.currency !== getDisplayCurrency() && (() => {
            const r  = form.currency === "PLN" ? 1 : getRate(form.currency);
            const safeRate = isFinite(r) ? r : 1;
            const plnValue = parseFloat(form.amount) * safeRate;
            const dispIsPLN = getDisplayCurrency() === "PLN";
            return (
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#475569" }}>
                  {form.amount} {form.currency}{dispIsPLN ? ` × ${safeRate.toFixed(4)} =` : " ≈"}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>
                  {fmtDisplay(plnValue)}
                </span>
              </div>
            );
          })()}
          {/* Rate note — pokazuje źródło i datę kursu */}
          {form.currency && form.currency !== getDisplayCurrency() && (() => {
            const fx = getCurrentRates();
            const sourceLabel = fx.source === "nbp" || fx.source === "cache"
              ? t("tx.fx.source", "Kurs NBP (Tabela A) z {date}").replace("{date}", fx.date)
              : t("tx.fx.offline", "Kurs offline (z {date}) — sprawdź połączenie").replace("{date}", fx.date);
            return (
              <div style={{ fontSize: 10, color: fx.source === "fallback" ? "#f59e0b" : "#334155", marginTop: 4 }}>
                {sourceLabel}
              </div>
            );
          })()}
        </div>
        <Input label={t("tx.date", "Data")} type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))}/>
        <button onClick={addTx} disabled={saving} style={{ width: "100%", background: saving ? "#1e3a5f" : "linear-gradient(135deg, #1e40af, #3b82f6)", border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer", fontFamily: "'Space Grotesk', sans-serif", opacity: saving ? 0.7 : 1 }}>
          {saving ? t("tx.fetchingRate", "Pobieram kurs…") : (editingId ? t("tx.saveChanges", "Zapisz zmiany") : t("tx.save", "Zapisz"))}
        </button>
      </Modal>
    </div>
  );
};


export { TransactionsView };

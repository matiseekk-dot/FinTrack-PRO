import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, Pencil, Trash2, HandCoins, ChevronRight, ExternalLink, Link2, ScanBarcode } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import {
  card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, ModuleHeader, EmptyCard, PeriodChips, CheckRow, num, periodInSentence,
} from "../components/ModuleUI.jsx";
import { HobbyDetails, HobbyModal } from "./HobbyView.jsx";
import { fmtDisplay, fmtCurrency, todayLocal, monthName } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { getDisplayCurrency, SUPPORTED_CURRENCIES, amountForDisplay, txAmountForDisplay } from "../lib/fx.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { getHobbyExpenses, pickHobbyColor, txMatchesHobby, isRulesOnlyElsewhere } from "../lib/hobby.js";
import { getModule } from "../lib/modules.js";
import { guessHobby } from "../lib/hobbyMove.js";
import { DiscogsModal, shiftDays } from "../components/DiscogsModal.jsx";
import { ScanModal } from "../components/ScanModal.jsx";
import { getSaved as getDiscogsSaved, needsPricing } from "../lib/discogs.js";
import { matchPurchases, matchDuplicates, linkPurchase, mergeDuplicate, convertValue } from "../lib/collectionMatch.js";
import { itemProfit } from "../lib/reselling.js";
import {
  KINDS, CONDITIONS, collectionKind, conditionLabel, itemTitle, itemState,
  buildPurchaseTx, toResaleItem, collectionStats, itemGain, salesMedian,
} from "../lib/collections.js";

const ACCENT = "#34d399";
const STATE_COLORS = { owned: "#34d399", wishlist: "#f59e0b", selling: "#ec4899", sold: "#64748b" };

/**
 * Kolekcje: katalog pozycji w każdej kolekcji (= hobby) + dotychczasowe wydatki hobby.
 * Sprzedaż pozycji przechodzi do modułu Sprzedaż z kosztem zakupu z katalogu.
 */
function CollectionsView({ hobbies = [], setHobbies, items = [], setItems, resaleItems = [], setResaleItems,
  transactions, setTransactions, setAccounts, defaultAcc = 1, allCats, month = null, onMonthChange,
  onBack, onOpenResale, onMoveToHobby, addSignal = 0, openAdd = false, focusItemId = null, onFocusHandled }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const [openId, setOpenId] = useState(null);       // otwarta kolekcja (hobby.id)
  const [detailTab, setDetailTab] = useState("catalog");
  const [shelf, setShelf] = useState("owned");     // owned | wishlist | sold
  const [sortBy, setSortBy] = useState("recent");  // recent | value | gain
  const [form, setForm] = useState(null);
  const [hobbyForm, setHobbyForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Stare „hobby” z FinTracka, które łapały tylko kupony/sprzedaż, nie są kolekcjami — nie pokazujemy ich
  // (zostają w danych). Kolekcja z pozycjami w katalogu zawsze zostaje widoczna.
  const isCollection = (h) => (!isRulesOnlyElsewhere(h) && !h.movedToHobby) || items.some(it => it.hobbyId === h.id);
  const active = hobbies.filter(h => !h.archived && isCollection(h));
  const looksLikeHobby = (h) => !items.some(it => it.hobbyId === h.id)
    && [h.name, ...(Array.isArray(h.keywords) ? h.keywords : [])].some(w => guessHobby(w))
    && getHobbyExpenses(transactions, h).length > 0;
  const hobbyLike = onMoveToHobby ? active.filter(looksLikeHobby) : [];
  const archived = hobbies.filter(h => h.archived && isCollection(h));
  const open = openId != null ? hobbies.find(h => h.id === openId) : null;

  const { by, total, resaleById } = useMemo(
    () => collectionStats(items, resaleItems),
    [items, resaleItems, getDisplayCurrency()]
  );
  // Wybrany miesiąc (ten sam co na Starcie i w innych modułach, ze strzałkami)
  const ym = month || today.slice(0, 7);
  const monthPool = useMemo(() => (transactions || []).filter(tx => (tx.date || "").startsWith(ym)), [transactions, ym]);
  const monthLabel = ym === today.slice(0, 7) ? t("period.month", "Ten miesiąc") : `${monthName(Number(ym.slice(5)) - 1)} ${ym.slice(0, 4)}`;
  // Wydatki kolekcji w miesiącu i w roku — każdy wpis liczony raz, nawet gdy pasuje do dwóch kolekcji
  const spend = useMemo(() => {
    const by = {}, byYear = {};
    const seenMonth = new Set(), seenYear = new Set();
    let monthTotal = 0, yearTotal = 0;
    for (const h of hobbies) {
      if (h.archived || !isCollection(h)) continue;
      let m = 0, y = 0;
      for (const tx of getHobbyExpenses(transactions, h)) {
        const d = tx.date || "";
        if (!d.startsWith(ym.slice(0, 4))) continue;
        const amt = Math.abs(txAmountForDisplay(tx));
        y += amt;
        if (!seenYear.has(tx.id)) { seenYear.add(tx.id); yearTotal += amt; }
        if (d.startsWith(ym)) { m += amt; if (!seenMonth.has(tx.id)) { seenMonth.add(tx.id); monthTotal += amt; } }
      }
      by[h.id] = m; byYear[h.id] = y;
    }
    return { by, byYear, monthTotal, yearTotal };
  }, [hobbies, transactions, ym, items]);

  // Wyceny z Discogs (EUR) zaimportowane przed 2.10.1 — przeliczamy na walutę aplikacji,
  // żeby w kolekcji nie mieszały się euro i złotówki. Tylko pozycje bez ceny zakupu.
  useEffect(() => {
    const disp = getDisplayCurrency();
    const fix = new Set(items.filter(it => it.discogs && it.currency === "EUR" && disp !== "EUR"
      && it.buyPrice == null && it.buyTxId == null && it.resaleItemId == null).map(it => it.id));
    if (!fix.size) return;
    // Warunek sprawdzany jeszcze raz na aktualnych danych — drugie wywołanie nie przelicza drugi raz
    setItems(prev => prev.map(it => !fix.has(it.id) || it.currency !== "EUR" ? it : {
      ...it, currency: disp,
      value: convertValue(it.value, "EUR", disp), targetPrice: convertValue(it.targetPrice, "EUR", disp),
      ...(it.value != null && it.valueSource === "discogs" ? { valueCur: disp } : {}),
    }));
  }, []);

  // ── Kolekcje (hobby) ────────────────────────────────────────────────
  const newCollection = () => setHobbyForm({
    id: null, name: "", color: pickHobbyColor(hobbies), categories: [], keywords: [], yearlyTarget: "", archived: false,
  });
  const editCollection = (h) => setHobbyForm({ ...h, yearlyTarget: h.yearlyTarget ? String(h.yearlyTarget) : "" });
  const saveCollection = () => {
    const f = hobbyForm;
    if (!f || !f.name.trim()) return;
    const yt = num(f.yearlyTarget);
    const payload = {
      id: f.id || Date.now(), name: f.name.trim(), color: f.color,
      categories: Array.isArray(f.categories) ? f.categories : [],
      keywords: Array.isArray(f.keywords) ? f.keywords.map(k => String(k).trim()).filter(Boolean) : [],
      yearlyTarget: isFinite(yt) && yt > 0 ? yt : null,
      archived: !!f.archived, createdAt: f.createdAt || new Date().toISOString(),
    };
    setHobbies(f.id ? hobbies.map(h => h.id === f.id ? payload : h) : [...hobbies, payload]);
    setHobbyForm(null);
    if (!f.id) setOpenId(payload.id);
  };
  const deleteCollection = (h) => {
    const count = items.filter(it => it.hobbyId === h.id).length;
    const msg = count > 0
      ? t("coll.confirmDeleteWithItems", "Usunąć kolekcję „{name}” i {n} pozycji katalogu? Wpisy w Wpisach zostaną.").replace("{name}", h.name).replace("{n}", count)
      : t("coll.confirmDelete", "Usunąć kolekcję „{name}”? Wpisy w Wpisach zostaną.").replace("{name}", h.name);
    if (!window.confirm(msg)) return;
    setItems(prev => prev.filter(it => it.hobbyId !== h.id));
    setHobbies(hobbies.filter(x => x.id !== h.id));
    setOpenId(null);
  };

  // ── Wpisy bez kolekcji ─────────────────────────────────────────────
  // Wpis z modułem Kolekcje dodany w Wpisach bez wybranej kolekcji (albo z kolekcją,
  // którą usunięto) nie pasuje do żadnej — pokazujemy go, żeby nie przepadł z widoku.
  const unassigned = useMemo(() => transactions
    .filter(tx => tx && tx.date && tx.collectionItemId == null && getModule(tx, hobbies) === "collections"
      && !hobbies.some(h => txMatchesHobby(tx, h)))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")), [transactions, hobbies]);
  const [assignTx, setAssignTx] = useState(null);
  const assignToCollection = (txId, hobbyId) => {
    setTransactions(prev => prev.map(x => x.id === txId ? { ...x, module: "collections", hobbyId } : x));
  };

  // ── Pozycje katalogu ───────────────────────────────────────────────
  const linkedTxIds = useMemo(() => new Set(items.filter(i => i.buyTxId != null).map(i => i.buyTxId)), [items]);
  // Zakupy z kolekcji spoza katalogu (np. dodane w Wpisach) — do szybkiego dopisania
  const [pickFromLedger, setPickFromLedger] = useState(false);
  const [discogsOpen, setDiscogsOpen] = useState(false);
  const [scanMode, setScanMode] = useState(null); // null | "batch" | "single" (do formularza pozycji)
  const offCatalog = useMemo(() => open
    ? getHobbyExpenses(transactions, open).filter(tx => !linkedTxIds.has(tx.id))
    : [], [open, transactions, linkedTxIds]);

  // Stare wpisy pasujące do pozycji (np. zakupy i ręczne pozycje sprzed importu z Discogs)
  const linkSuggestions = useMemo(() => {
    if (!open) return { dups: [], buys: [] };
    const mineHere = items.filter(it => it.hobbyId === open.id);
    const dups = matchDuplicates(mineHere);
    const dupIds = new Set(dups.map(p => p.dup.id));
    const pool = [...offCatalog, ...unassigned.filter(tx => tx.amount < 0 && !linkedTxIds.has(tx.id))];
    return { dups, buys: matchPurchases(mineHere.filter(it => !dupIds.has(it.id)), pool) };
  }, [open, items, offCatalog, unassigned, linkedTxIds]);
  const [linkPicks, setLinkPicks] = useState(null); // otwarte okno: { [klucz]: false = odznaczone }
  const linkChosen = linkPicks ? {
    dups: linkSuggestions.dups.filter(p => linkPicks["d" + p.dup.id] !== false),
    buys: linkSuggestions.buys.filter(p => linkPicks["b" + p.tx.id] !== false),
  } : { dups: [], buys: [] };
  const applyLinks = () => {
    const { dups, buys } = linkChosen;
    if (!open || (!dups.length && !buys.length)) return;
    const patch = new Map();
    const drop = new Set();
    for (const p of dups) { patch.set(p.item.id, mergeDuplicate(p.item, p.dup)); drop.add(p.dup.id); }
    for (const p of buys) patch.set(p.item.id, linkPurchase(patch.get(p.item.id) || p.item, p.tx));
    setItems(prev => prev.filter(it => !drop.has(it.id)).map(it => patch.get(it.id) || it));
    // Zakup podpięty z Wpisów liczy się w wydatkach tej kolekcji (jak przy ręcznym podpięciu)
    const txIds = new Set(buys.map(p => p.tx.id));
    if (txIds.size) setTransactions(prev => prev.map(x => txIds.has(x.id) ? { ...x, module: "collections", hobbyId: open.id } : x));
    setLinkPicks(null);
    showToast(t("coll.link.done", "Połączone: {n} ✓").replace("{n}", dups.length + buys.length));
  };

  const blankItem = (hobbyId, patch = {}) => ({
    editingId: null, hobbyId, status: "owned", title: "", creator: "", format: "", condition: "mint",
    currency: getDisplayCurrency(), acc: defaultAcc,
    buyMode: "new", buyPrice: "", buyDate: today, buyTxId: null,
    value: "", targetPrice: "", valueSource: null, valueAt: null, valueTouched: false, ...patch,
  });
  const formFromItem = (it) => ({
    editingId: it.id, hobbyId: it.hobbyId, status: it.status, title: it.title, creator: it.creator || "",
    format: it.format || "", condition: it.condition || "mint",
    currency: it.currency || "PLN", acc: it.acc ?? defaultAcc,
    buyMode: it.buyTxOwned ? "new" : it.buyTxId != null ? "ledger" : "none",
    buyPrice: it.buyPrice != null ? String(it.buyPrice) : "", buyDate: it.buyDate || today, buyTxId: it.buyTxId ?? null,
    value: it.value != null ? String(it.value) : "", targetPrice: it.targetPrice != null ? String(it.targetPrice) : "",
    valueSource: it.valueSource || null, valueAt: it.valueAt || null, valueTouched: false,
  });

  const startFromTx = (tx, hobbyId) => {
    const fx = tx.origCurrency && tx.origAmount != null;
    setForm(blankItem(hobbyId, {
      title: tx.desc || "", buyMode: "ledger", buyTxId: tx.id, buyDate: tx.date,
      buyPrice: String(Math.abs(fx ? tx.origAmount : tx.amount)), currency: fx ? tx.origCurrency : "PLN",
    }));
  };

  const startAdd = () => {
    const target = open || active[0];
    if (!target) { newCollection(); return; }
    setForm(blankItem(target.id, shelf === "wishlist" ? { status: "wishlist" } : {}));
  };

  // Przycisk + z dolnego paska (licznik wspólny dla ekranów modułów)
  // openAdd: ekran otwarty skrótem — formularz od razu
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) startAdd(); }, [addSignal]);
  // Wpis z katalogu kliknięty w Wpisach
  useEffect(() => {
    if (focusItemId == null) return;
    const it = items.find(x => x.id === focusItemId);
    if (it) { setOpenId(it.hobbyId); setForm(formFromItem(it)); }
    if (onFocusHandled) onFocusHandled();
  }, [focusItemId]);

  const setF = (patch) => setForm(f => ({ ...f, ...patch }));
  // Zmiana waluty pozycji przelicza wycenę z Discogs (wpisanej ręcznie nie ruszamy)
  const setCurrency = (cur) => setForm(f => {
    const auto = !f.valueTouched && f.valueSource === "discogs" && isFinite(num(f.value));
    return { ...f, currency: cur, ...(auto ? { value: String(convertValue(num(f.value), f.currency, cur)) } : {}) };
  });
  const formHobby = form ? hobbies.find(h => h.id === form.hobbyId) : null;
  const kind = collectionKind(formHobby);

  // Wydatki tej kolekcji z Wpisów, których nie przypięto jeszcze do żadnej pozycji
  const candidates = useMemo(() => {
    if (!form || !formHobby) return [];
    let pool = [...getHobbyExpenses(transactions, formHobby), ...unassigned.filter(tx => tx.amount < 0)]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (pool.length === 0) {
      pool = transactions.filter(tx => tx.amount < 0 && tx.cat !== "inne" && tx.cat !== "inwestycje")
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    }
    return pool.filter(tx => !linkedTxIds.has(tx.id) || tx.id === form.buyTxId).slice(0, 8);
  }, [form?.hobbyId, form?.buyTxId, formHobby, transactions, linkedTxIds, unassigned]);

  const pickLedgerTx = (tx) => {
    const fx = tx.origCurrency && tx.origAmount != null;
    setF({ buyTxId: tx.id, buyPrice: String(Math.abs(fx ? tx.origAmount : tx.amount)), currency: fx ? tx.origCurrency : "PLN", buyDate: tx.date });
  };

  const saveItem = async () => {
    if (!form || saving) return;
    const title = form.title.trim();
    if (!title) { showToast(t("coll.err.title", "Wpisz tytuł"), "error"); return; }
    if (!formHobby) return;
    const old = form.editingId != null ? items.find(x => x.id === form.editingId) : null;
    const owned = form.status === "owned";
    const price = num(form.buyPrice);
    if (owned && form.buyMode === "new" && (!isFinite(price) || price <= 0)) { showToast(t("coll.err.price", "Wpisz cenę zakupu albo wybierz „Bez wpisu”"), "error"); return; }
    if (owned && form.buyMode === "ledger" && form.buyTxId == null) { showToast(t("coll.err.pickTx", "Wybierz wpis z listy"), "error"); return; }

    const item = {
      ...(old || {}),
      id: old ? old.id : newId(), hobbyId: form.hobbyId, status: form.status,
      title, creator: form.creator.trim(), format: form.format.trim(), condition: owned ? form.condition : null,
      currency: form.currency, acc: parseInt(form.acc) || defaultAcc,
      value: isFinite(num(form.value)) && num(form.value) > 0 ? num(form.value) : null,
      // Wycena wpisana ręcznie nie jest nadpisywana przez Discogs; wyczyszczona — można wycenić znowu
      ...(form.valueTouched
        ? (isFinite(num(form.value)) && num(form.value) > 0 ? { valueSource: "manual", valueAt: today, valueCur: form.currency } : { valueSource: null, valueAt: null })
        : old && old.value != null && old.valueSource === "discogs" && form.currency !== (old.currency || "PLN") ? { valueCur: form.currency } : {}),
      targetPrice: !owned && isFinite(num(form.targetPrice)) && num(form.targetPrice) > 0 ? num(form.targetPrice) : null,
      buyPrice: owned && isFinite(price) && price > 0 ? price : null,
      buyDate: owned ? form.buyDate : null,
      buyTxId: owned && form.buyMode === "ledger" ? form.buyTxId : (owned && form.buyMode === "new" && old?.buyTxOwned ? old.buyTxId : null),
      buyTxOwned: owned && form.buyMode === "new",
      createdAt: old?.createdAt || today,
      ...(form.barcode ? { barcode: form.barcode } : {}),
      ...(form.year ? { year: form.year } : {}),
      ...(form.discogs ? { discogs: form.discogs } : {}),
    };

    const oldOwnedTx = old?.buyTxOwned ? transactions.find(tx => tx.id === old.buyTxId) : null;

    setSaving(true);
    try {
      if (item.buyTxOwned) {
        const reuse = oldOwnedTx && oldOwnedTx.date === item.buyDate && (oldOwnedTx.origCurrency || "PLN") === item.currency;
        const rate = reuse ? (oldOwnedTx.fxRate || 1) : await rateOnDate(item.currency, item.buyDate);
        const tx = buildPurchaseTx(item, formHobby, rate);
        item.buyTxId = tx.id;
        commitTxChanges({ setTransactions, setAccounts }, { add: [tx], remove: oldOwnedTx ? [oldOwnedTx] : [] });
      } else if (oldOwnedTx) {
        commitTxChanges({ setTransactions, setAccounts }, { remove: [oldOwnedTx] });
      }
      // Zakup podpięty z Wpisów liczy się w wydatkach tej kolekcji
      if (!item.buyTxOwned && item.buyTxId != null) assignToCollection(item.buyTxId, item.hobbyId);
      setItems(prev => old ? prev.map(x => x.id === item.id ? item : x) : [item, ...prev]);
      setOpenId(item.hobbyId);
      setShelf(item.status === "wishlist" ? "wishlist" : "owned");
      showToast(old ? t("coll.toast.updated", "Zapisano ✓") : t("coll.toast.added", "Dodano do kolekcji ✓"));
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = () => {
    const old = items.find(x => x.id === form?.editingId);
    if (!old || !window.confirm(t("coll.confirmDeleteItem", "Usunąć pozycję z katalogu?"))) return;
    const ownedTx = old.buyTxOwned ? transactions.find(tx => tx.id === old.buyTxId) : null;
    if (ownedTx) commitTxChanges({ setTransactions, setAccounts }, { remove: [ownedTx] });
    setItems(prev => prev.filter(x => x.id !== old.id));
    showToast(t("coll.toast.deleted", "Pozycja usunięta"), "error");
    setForm(null);
  };

  const sellItem = () => {
    const it = items.find(x => x.id === form?.editingId);
    if (!it) return;
    const hobby = hobbies.find(h => h.id === it.hobbyId);
    const r = toResaleItem(it, hobby, today);
    setResaleItems(prev => [r, ...prev]);
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, resaleItemId: r.id } : x));
    setForm(null);
    if (onOpenResale) onOpenResale(r.id);
  };

  // ── Widoki ─────────────────────────────────────────────────────────
  // Zmiana tylko z pozycji z ceną zakupu i wyceną (płyta bez ceny zakupu to nie „zysk”)
  const changeOf = (s) => s.paidValue - s.paidCost;
  const changeColor = (v) => v > 0 ? "#34d399" : v < 0 ? "#f87171" : "#e2e8f0";
  const pairedNote = (s) => s.paired > 0 && s.paired < s.owned + s.selling && (
    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>
      {t("coll.pairedNote", "Zmiana liczona z pozycji, które mają cenę zakupu i wycenę: {n} z {all}.").replace("{n}", s.paired).replace("{all}", s.owned + s.selling)}
    </div>
  );
  const spendRow = (amount, yearAmount, one = false) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12, paddingTop: 10, borderTop: "1px solid #1a2744" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#94a3b8" }}>
        {(one ? t("coll.spentPeriodOne", "Wydane · {period}") : t("coll.spentPeriod", "Wydane na kolekcje · {period}")).replace("{period}", periodInSentence(ym))}
        {yearAmount != null && <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
          {t("coll.spentYearLine", "w roku {year}: {amount}").replace("{year}", ym.slice(0, 4)).replace("{amount}", fmtDisplay(yearAmount))}
        </span>}
      </span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 800, color: amount > 0 ? "#f87171" : "#e2e8f0" }}>{fmtDisplay(amount)}</span>
    </div>
  );
  const txLabel = (tx) => tx.origCurrency && tx.origAmount != null
    ? fmtCurrency(Math.sign(tx.amount) * Math.abs(tx.origAmount), tx.origCurrency, true)
    : fmtCurrency(tx.amount, "PLN", true);

  const collectionRow = (h, dimmed = false) => {
    const s = by[h.id];
    const Icon = KINDS[collectionKind(h)].icon;
    const owned = s ? s.owned + s.selling : 0;
    const parts = [
      `${owned} ${t("coll.itemsShort", "poz.")}`,
      s && s.value > 0 ? `${t("coll.worth", "wartość")} ${fmtDisplay(s.value)}` : null,
      s && s.wishlist > 0 ? `${s.wishlist} ${t("coll.onWishlist", "na liście")}` : null,
      spend.byYear[h.id] > 0 ? t("coll.yearSpendShort", "{year}: {amount}").replace("{year}", ym.slice(0, 4)).replace("{amount}", fmtDisplay(spend.byYear[h.id])) : null,
    ].filter(Boolean);
    return (
      <button key={h.id} onClick={() => { setOpenId(h.id); setDetailTab("catalog"); setShelf("owned"); }} style={{
        all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", ...card, padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12, opacity: dimmed ? 0.6 : 1,
      }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: h.color + "22", border: `1px solid ${h.color}66`, display: "grid", placeItems: "center" }}>
          <Icon size={17} color={h.color}/>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
          <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parts.join(" · ")}</span>
        </span>
        <span style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{t("coll.spentIn", "wydane · {period}").replace("{period}", periodInSentence(ym))}</span>
          <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: spend.by[h.id] > 0 ? "#f87171" : "#475569" }}>{fmtDisplay(spend.by[h.id] || 0)}</span>
        </span>
        <ChevronRight size={14} color="#334155"/>
      </button>
    );
  };

  const recent = (a, b) => (b.it.buyDate || b.it.createdAt || "").localeCompare(a.it.buyDate || a.it.createdAt || "");
  const dispValue = (it) => it.value != null ? amountForDisplay(it.value, it.currency) : -Infinity;
  const dispGain = (it) => { const g = itemGain(it); return g == null ? -Infinity : amountForDisplay(g, it.currency); };
  const byNumber = (f) => (a, b) => {
    const x = f(a.it), y = f(b.it);
    return x === y ? recent(a, b) : y > x ? 1 : -1;
  };
  const sorter = shelf === "owned" && sortBy === "value" ? byNumber(dispValue)
    : shelf === "owned" && sortBy === "gain" ? byNumber(dispGain)
    : recent;
  const shelfItems = open ? items.filter(it => it.hobbyId === open.id).map(it => ({ it, ...itemState(it, resaleById) }))
    .filter(x => shelf === "owned" ? (x.state === "owned" || x.state === "selling") : x.state === shelf)
    .sort(sorter) : [];
  const money = (amount, cur, sign = false) => fmtDisplay(amountForDisplay(amount, cur), sign ? { showSign: true } : undefined);

  return (
    <div style={{ padding: "0 16px" }}>
      {!open ? <>
        <ModuleHeader Icon={Disc3} color={ACCENT} title={t("coll.title", "Kolekcje")} onBack={onBack}
          addLabel={active.length ? t("coll.addItem", "Pozycja") : t("coll.addCollection", "Kolekcja")} onAdd={startAdd}/>
        {active.length > 0 && <PeriodChips monthOnly month={ym} onMonthChange={onMonthChange}/>}

        {active.length > 0 && (
          <div style={heroCard}>
            <div style={heroLabel}>{t("coll.value", "Wartość kolekcji")}</div>
            <div style={{ ...heroValue(true), color: "#e2e8f0" }}>{fmtDisplay(total.value)}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <Stat label={t("coll.items", "Pozycje")} value={String(total.owned + total.selling)}/>
              <Stat label={t("coll.cost", "Koszt")} value={fmtDisplay(total.cost)}/>
              <Stat label={t("coll.change", "Zmiana")} value={total.paired > 0 ? fmtDisplay(changeOf(total), { showSign: true }) : "—"}
                color={changeColor(changeOf(total))}/>
              <Stat label={t("coll.wishlist", "Lista życzeń")} value={String(total.wishlist)}/>
            </div>
            {pairedNote(total)}
            {total.sold > 0 && (
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
                {t("coll.soldLine", "Sprzedane z kolekcji: {n} · zysk {amount}").replace("{n}", total.sold).replace("{amount}", fmtDisplay(total.realized, { showSign: true }))}
              </div>
            )}
            {total.unvalued > 0 && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>
                {t("coll.unvaluedNote", "Bez wyceny: {n} — liczone po cenie zakupu.").replace("{n}", total.unvalued)}
              </div>
            )}
            {spendRow(spend.monthTotal, spend.yearTotal)}
          </div>
        )}

        {unassigned.length > 0 && <>
          <div style={sectionTitle}>{t("coll.unassigned", "Wpisy bez kolekcji")} · {unassigned.length}</div>
          <div style={{ fontSize: 12, color: "#64748b", margin: "-4px 2px 8px", lineHeight: 1.45 }}>
            {t("coll.unassignedHint", "Dodane w Wpisach bez wybranej kolekcji. Stuknij, żeby przypisać albo dodać do katalogu.")}
          </div>
          <div style={{ ...card, padding: "2px 14px", marginBottom: 6 }}>
            {unassigned.slice(0, 20).map((tx, i, arr) => (
              <button key={tx.id} onClick={() => setAssignTx(tx)} style={{
                all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none",
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || "—"}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>{tx.date}</span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: tx.amount < 0 ? "#f87171" : "#34d399" }}>
                  {txLabel(tx)}
                </span>
                <ChevronRight size={14} color="#334155"/>
              </button>
            ))}
          </div>
        </>}

        {active.length === 0 && archived.length === 0 ? (
          <EmptyCard title={t("coll.emptyTitle", "Załóż pierwszą kolekcję")}
            desc={t("coll.emptyDesc", "Winyle, książki, gry — zapisuj pozycje, ich wartość i to, co sprzedałeś.")}
            cta={t("coll.addCollection", "Kolekcja")} onCta={newCollection}/>
        ) : <>
          {hobbyLike.length > 0 && (
            <div style={{ ...card, marginTop: 14, padding: "12px 14px", background: "#f9731612", borderColor: "#f9731655" }}>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 8 }}>
                {t("coll.hobbyLike", "Te kolekcje wyglądają na wydatki na hobby (subskrypcje, kino, koncerty), a nie na rzeczy do zbierania:")}
              </div>
              {hobbyLike.map(h => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: h.color, flexShrink: 0 }}/>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                  <button onClick={() => onMoveToHobby(h.id)} style={{ ...actionBtn("#f97316"), flex: "none", padding: "6px 12px" }}>
                    {t("coll.moveToHobby", "Przenieś do Hobby")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={sectionTitle}>{t("coll.collections", "Twoje kolekcje")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map(h => collectionRow(h))}
            <button onClick={newCollection} style={{ background: "none", border: "1px dashed #1a2744", borderRadius: 14, padding: 12, color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              + {t("coll.newCollection", "Nowa kolekcja")}
            </button>
          </div>
          {archived.length > 0 && <>
            <div style={sectionTitle}>{t("coll.archived", "Archiwum")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{archived.map(h => collectionRow(h, true))}</div>
          </>}
        </>}
      </> : <>
        {/* Szczegóły kolekcji */}
        <ModuleHeader Icon={KINDS[collectionKind(open)].icon} color={open.color} title={open.name}
          onBack={() => setOpenId(null)} addLabel={t("coll.addItem", "Pozycja")} onAdd={startAdd}
          extra={<button onClick={() => editCollection(open)} aria-label={t("common.edit", "Edytuj")} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: 7, cursor: "pointer", color: "#94a3b8", display: "grid", placeItems: "center" }}><Pencil size={14}/></button>}/>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <Chip on={detailTab === "catalog"} color={ACCENT} onClick={() => setDetailTab("catalog")}>{t("coll.tab.catalog", "Katalog")}</Chip>
          <Chip on={detailTab === "spending"} color={ACCENT} onClick={() => setDetailTab("spending")}>{t("coll.tab.spending", "Wydatki")}</Chip>
        </div>
        <PeriodChips monthOnly month={ym} onMonthChange={onMonthChange}/>

        {onMoveToHobby && looksLikeHobby(open) && (
          <button onClick={() => onMoveToHobby(open.id)} style={{
            all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginBottom: 12, padding: "10px 14px", borderRadius: 12,
            background: "#f9731612", border: "1px solid #f9731655", fontSize: 12, color: "#cbd5e1", lineHeight: 1.45, display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ flex: 1 }}>{t("move.fromCollectionCta", "To nie kolekcja (subskrypcje, kino, koncerty)? Przenieś do Hobby")}</span>
            <ChevronRight size={14} color="#f97316"/>
          </button>
        )}

        {detailTab === "spending" ? (
          <HobbyDetails embedded hobby={open} transactions={transactions} cyclePool={monthPool} periodLabel={monthLabel} allCats={allCats}/>
        ) : <>
          {(() => {
            const s = by[open.id] || { owned: 0, selling: 0, wishlist: 0, sold: 0, cost: 0, value: 0, realized: 0, paired: 0, paidCost: 0, paidValue: 0 };
            return (
              <div style={{ ...heroCard, padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <Stat label={t("coll.value", "Wartość kolekcji")} value={fmtDisplay(s.value)}/>
                  <Stat label={t("coll.cost", "Koszt")} value={fmtDisplay(s.cost)}/>
                  <Stat label={t("coll.change", "Zmiana")} value={s.paired > 0 ? fmtDisplay(changeOf(s), { showSign: true }) : "—"} color={changeColor(changeOf(s))}/>
                </div>
                {s.sold > 0 && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
                    {t("coll.soldLine", "Sprzedane z kolekcji: {n} · zysk {amount}").replace("{n}", s.sold).replace("{amount}", fmtDisplay(s.realized, { showSign: true }))}
                  </div>
                )}
                {pairedNote(s)}
                {spendRow(spend.by[open.id] || 0, null, true)}
              </div>
            );
          })()}

          <button onClick={() => setScanMode("batch")} style={{
            all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginTop: 10, padding: "10px 14px", borderRadius: 12,
            background: ACCENT + "14", border: `1px solid ${ACCENT}44`, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45,
          }}>
            <ScanBarcode size={16} color={ACCENT}/>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontWeight: 700, color: "#e2e8f0" }}>{t("scan.cardTitle", "Skanuj kody kreskowe")}</span>
              {collectionKind(open) === "books" ? t("scan.cardBooks", "ISBN z okładki — tytuł i autor wpiszą się same. Cała półka w kilka minut.")
                : collectionKind(open) === "vinyl" ? t("scan.cardVinyl", "Kod z okładki — tytuł, wykonawca i numer Discogs do wyceny.")
                : t("scan.cardOther", "Kod z pudełka — tytuł wpisze się sam, jeśli jest w bazie. Dodawaj seriami.")}
            </span>
            <ChevronRight size={14} color={ACCENT}/>
          </button>

          {collectionKind(open) === "vinyl" && (() => {
            const mineHere = items.filter(it => it.hobbyId === open.id);
            const fromDiscogs = mineHere.filter(it => it.discogs).length;
            const stale = mineHere.filter(it => needsPricing(it, shiftDays(today, -30))).length;
            const synced = getDiscogsSaved().syncedAt;
            return (
              <button onClick={() => setDiscogsOpen(true)} style={{
                all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginTop: 10, padding: "10px 14px", borderRadius: 12,
                background: "#0d1628", border: "1px solid #1a2744", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#cbd5e1",
              }}>
                <Disc3 size={15} color={ACCENT}/>
                <span style={{ flex: 1 }}>
                  {fromDiscogs > 0
                    ? t("discogs.cardSynced", "Z Discogs: {n} · dociągnij nowe płyty i wyceny").replace("{n}", fromDiscogs)
                    : t("discogs.card", "Masz kolekcję na Discogs? Zaimportuj ją razem z wycenami")}
                  {fromDiscogs > 0 && (stale > 0 || synced) && (
                    <span style={{ display: "block", fontSize: 11, marginTop: 2, color: stale > 0 ? "#f59e0b" : "#64748b" }}>
                      {stale > 0
                        ? t("discogs.staleCard", "Wyceny do odświeżenia: {n}").replace("{n}", stale)
                        : t("discogs.lastSync", "Ostatnio: {date}.").replace("{date}", synced)}
                    </span>
                  )}
                </span>
                <ChevronRight size={14} color="#334155"/>
              </button>
            );
          })()}

          {linkSuggestions.dups.length + linkSuggestions.buys.length > 0 && (
            <button onClick={() => setLinkPicks({})} style={{
              all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginTop: 10, padding: "10px 14px", borderRadius: 12,
              background: "#f59e0b14", border: "1px solid #f59e0b55", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.45,
            }}>
              <Link2 size={15} color="#f59e0b"/>
              <span style={{ flex: 1 }}>{t("coll.link.card", "Stare wpisy pasują do pozycji w katalogu: {n}. Połącz je — cena zakupu trafi do pozycji, bez duplikatów.").replace("{n}", linkSuggestions.dups.length + linkSuggestions.buys.length)}</span>
              <ChevronRight size={14} color="#f59e0b"/>
            </button>
          )}

          {offCatalog.length > 0 && (
            <button onClick={() => setPickFromLedger(true)} style={{
              all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", marginTop: 10, padding: "10px 14px", borderRadius: 12,
              background: ACCENT + "14", border: `1px solid ${ACCENT}44`, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#cbd5e1",
            }}>
              <span style={{ flex: 1 }}>{t("coll.offCatalog", "Zakupy spoza katalogu: {n}. Dodaj je jako pozycje.").replace("{n}", offCatalog.length)}</span>
              <ChevronRight size={14} color={ACCENT}/>
            </button>
          )}

          <div style={{ display: "flex", gap: 6, margin: "14px 0 10px", flexWrap: "wrap" }}>
            {[["owned", t("coll.shelf.owned", "Mam")], ["wishlist", t("coll.shelf.wishlist", "Lista życzeń")], ["sold", t("coll.shelf.sold", "Sprzedane")]].map(([id, label]) => {
              const s = by[open.id];
              const n = !s ? 0 : id === "owned" ? s.owned + s.selling : s[id];
              return <Chip key={id} on={shelf === id} color={ACCENT} onClick={() => setShelf(id)}>{label} · {n}</Chip>;
            })}
          </div>
          {shelf === "owned" && shelfItems.length >= 3 && (
            <div style={{ display: "flex", gap: 6, margin: "-2px 0 10px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b", marginRight: 2 }}>{t("coll.sort", "Sortuj:")}</span>
              {[["recent", t("coll.sort.recent", "Najnowsze")], ["value", t("coll.sort.value", "Najcenniejsze")], ["gain", t("coll.sort.gain", "Największy zysk")]].map(([id, label]) => (
                <Chip key={id} on={sortBy === id} color={ACCENT} onClick={() => setSortBy(id)}>{label}</Chip>
              ))}
            </div>
          )}

          {shelfItems.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b", padding: "8px 2px", lineHeight: 1.5 }}>
              {shelf === "owned" ? t("coll.emptyOwned", "Brak pozycji. Dodaj pierwszą — możesz podpiąć zakup, który już jest w Wpisach.")
                : shelf === "wishlist" ? t("coll.emptyWishlist", "Lista życzeń jest pusta.")
                : t("coll.emptySold", "Nic jeszcze nie sprzedane. Użyj „Sprzedaj” przy pozycji.")}
            </div>
          ) : (
            <div style={{ ...card, padding: "2px 14px" }}>
              {shelfItems.map(({ it, state, resale }, i) => {
                const owned = state === "owned" || state === "selling";
                const gain = owned ? itemGain(it) : null;
                const meta = [it.creator, it.format, it.condition ? conditionLabel(it.condition, lang) : null,
                  owned && it.value != null && it.buyPrice != null ? `${t("coll.paid", "kupione")} ${money(it.buyPrice, it.currency)}` : null,
                ].filter(Boolean).join(" · ");
                let right, rightLabel, rightColor = "#e2e8f0", sub = null;
                if (state === "sold") {
                  const p = itemProfit(resale);
                  right = fmtDisplay(amountForDisplay(p, resale.currency, resale.sellFxRate), { showSign: true }); rightLabel = t("coll.profit", "zysk"); rightColor = p >= 0 ? "#34d399" : "#f87171";
                } else if (state === "wishlist") {
                  right = it.targetPrice ? money(it.targetPrice, it.currency) : "—"; rightLabel = t("coll.target", "kupię do");
                } else {
                  right = it.value != null ? money(it.value, it.currency) : it.buyPrice != null ? money(it.buyPrice, it.currency) : "—";
                  rightLabel = it.value != null ? t("coll.worthShort", "wartość") : t("coll.paid", "kupione");
                  if (gain != null) sub = (
                    <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, marginTop: 1, color: gain >= 0 ? "#34d399" : "#f87171" }}>
                      {money(gain, it.currency, true)}{it.buyPrice > 0 ? ` (${gain >= 0 ? "+" : ""}${Math.round(gain / it.buyPrice * 100)}%)` : ""}
                    </span>
                  );
                }
                return (
                  <button key={it.id} onClick={() => setForm(formFromItem(it))} style={{
                    all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                    borderBottom: i < shelfItems.length - 1 ? "1px solid #0f1a2e" : "none",
                  }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                        {state === "selling" && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: STATE_COLORS.selling + "22", color: STATE_COLORS.selling, flexShrink: 0 }}>{t("coll.selling", "NA SPRZEDAŻ")}</span>}
                      </span>
                      {meta && <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>}
                    </span>
                    <span style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{rightLabel}</span>
                      <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: rightColor }}>{right}</span>
                      {sub}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {onMoveToHobby && !items.some(it => it.hobbyId === open.id) && (
            <button onClick={() => onMoveToHobby(open.id)} style={{ width: "100%", marginTop: 26, background: "none", border: "1px solid #1a2744", borderRadius: 12, padding: 11, color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {t("move.fromCollectionCta", "To nie kolekcja (subskrypcje, kino, koncerty)? Przenieś do Hobby")}
            </button>
          )}
          <button onClick={() => deleteCollection(open)} style={{ ...dangerBtn, marginTop: 10, border: "none", color: "#64748b", fontSize: 12 }}>
            <Trash2 size={12}/> {t("coll.deleteCollection", "Usuń kolekcję")}
          </button>
        </>}
      </>}

      {/* Formularz pozycji */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.editingId != null ? t("coll.editItem", "Pozycja") : t("coll.newItem", "Nowa pozycja")}>
        {form && (() => {
          const state = form.editingId != null ? itemState(items.find(x => x.id === form.editingId) || {}, resaleById).state : "owned";
          const formats = KINDS[kind].formats[lang] || KINDS[kind].formats.en;
          return <>
            {active.length > 1 && form.editingId == null && (
              <Select label={t("coll.collection", "Kolekcja")} value={form.hobbyId} onChange={e => setF({ hobbyId: Number(e.target.value) || e.target.value, buyTxId: null })}>
                {active.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            )}

            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <Chip on={form.status === "owned"} color={STATE_COLORS.owned} onClick={() => setF({ status: "owned" })}>{t("coll.shelf.owned", "Mam")}</Chip>
              <Chip on={form.status === "wishlist"} color={STATE_COLORS.wishlist} onClick={() => setF({ status: "wishlist" })}>{t("coll.shelf.wishlist", "Lista życzeń")}</Chip>
            </div>

            {form.editingId == null && (
              <button type="button" onClick={() => setScanMode("single")} style={{
                width: "100%", marginBottom: 14, background: ACCENT + "14", border: `1px solid ${ACCENT}55`, borderRadius: 12, padding: "11px 14px",
                color: ACCENT, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <ScanBarcode size={16}/> {form.barcode ? t("scan.again", "Zeskanuj inny kod") : t("scan.fill", "Skanuj kod — tytuł wpisze się sam")}
              </button>
            )}
            <Input label={t("coll.itemTitle", "Tytuł")} value={form.title} onChange={e => setF({ title: e.target.value })}
              placeholder={kind === "vinyl" ? "OK Computer" : kind === "books" ? t("coll.titlePhBook", "np. Diuna") : kind === "games" ? "Elden Ring" : ""}/>
            <Input label={kind === "vinyl" ? t("coll.artist", "Wykonawca") : kind === "books" ? t("coll.author", "Autor") : kind === "games" ? t("coll.studio", "Studio / wydawca") : t("coll.creator", "Twórca")}
              value={form.creator} onChange={e => setF({ creator: e.target.value })}/>

            {formats.length > 0 && <>
              <div style={fieldLabel}>{t("coll.format", "Format")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {formats.map(f => <Chip key={f} on={form.format === f} color={ACCENT} onClick={() => setF({ format: form.format === f ? "" : f })}>{f}</Chip>)}
              </div>
            </>}

            {form.status === "owned" ? <>
              <div style={fieldLabel}>{t("coll.condition", "Stan")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {CONDITIONS.map(c => <Chip key={c.id} on={form.condition === c.id} color={ACCENT} onClick={() => setF({ condition: c.id })}>{c.label[lang] || c.label.en}</Chip>)}
              </div>

              <div style={fieldLabel}>{t("coll.purchase", "Zakup")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                <Chip on={form.buyMode === "new"} color={ACCENT} onClick={() => setF({ buyMode: "new", buyTxId: null })}>{t("coll.buy.new", "Nowy wydatek")}</Chip>
                <Chip on={form.buyMode === "ledger"} color={ACCENT} onClick={() => setF({ buyMode: "ledger" })}>{t("coll.buy.ledger", "Już w Wpisach")}</Chip>
                <Chip on={form.buyMode === "none"} color={ACCENT} onClick={() => setF({ buyMode: "none", buyTxId: null })}>{t("coll.buy.none", "Bez wpisu")}</Chip>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, lineHeight: 1.45 }}>
                {form.buyMode === "new" ? t("coll.buy.newHint", "Zapiszemy wydatek w Wpisach i w tej kolekcji.")
                  : form.buyMode === "ledger" ? t("coll.buy.ledgerHint", "Wybierz zakup, który już zapisałeś — nic się nie zdubluje.")
                  : t("coll.buy.noneHint", "Masz to od dawna albo w prezencie. Cena jest opcjonalna — posłuży do liczenia zysku przy sprzedaży.")}
              </div>

              {form.buyMode === "ledger" ? (
                <div style={{ ...card, background: "#060b14", padding: "2px 12px", marginBottom: 14 }}>
                  {candidates.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#64748b", padding: "12px 0" }}>{t("coll.buy.noCandidates", "Brak pasujących wydatków w Wpisach.")}</div>
                  ) : candidates.map((tx, i) => {
                    const on = form.buyTxId === tx.id;
                    return (
                      <button key={tx.id} type="button" onClick={() => pickLedgerTx(tx)} style={{
                        all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 0", borderBottom: i < candidates.length - 1 ? "1px solid #0f1a2e" : "none",
                      }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: `1.5px solid ${on ? ACCENT : "#475569"}`, background: on ? ACCENT : "transparent" }}/>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                          <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</span>
                          <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>{tx.date}</span>
                        </span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                          {tx.origCurrency && tx.origAmount != null ? fmtCurrency(-tx.origAmount, tx.origCurrency) : fmtCurrency(tx.amount, "PLN")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1.3 }}><Input label={t("coll.price", "Cena")} type="text" inputMode="decimal" step="0.01" placeholder={form.buyMode === "none" ? t("common.optional", "opcjonalnie") : "0"} value={form.buyPrice} onChange={e => setF({ buyPrice: e.target.value })}/></div>
                  <div style={{ flex: 0.9 }}>
                    <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setCurrency(e.target.value)}>
                      {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                  <div style={{ flex: 1.4 }}><Input label={t("coll.boughtOn", "Kupione")} type="date" value={form.buyDate} onChange={e => setF({ buyDate: e.target.value })}/></div>
                </div>
              )}

              <Input label={`${t("coll.estValue", "Szacowana wartość dziś")} · ${form.currency}`} type="text" inputMode="decimal" step="0.01" placeholder={t("common.optional", "opcjonalnie")} value={form.value} onChange={e => setF({ value: e.target.value, valueTouched: true })}/>
              {(() => {
                const v = num(form.value), p = num(form.buyPrice);
                const fromDiscogs = !form.valueTouched && form.valueSource === "discogs" && form.valueAt;
                const gain = isFinite(v) && v > 0 && isFinite(p) && p > 0 ? v - p : null;
                const hint = !form.value && salesMedian(formHobby, items, resaleItems, form.currency);
                if (hint) return (
                  <button type="button" onClick={() => setF({ value: String(hint.median), valueTouched: true })} style={{
                    display: "block", margin: "-6px 0 14px", background: "none", border: "none", padding: 0, color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.45,
                  }}>
                    {t("coll.medianHint", "Wstaw medianę Twoich sprzedaży: {amount} (z {n})").replace("{amount}", fmtCurrency(hint.median, form.currency)).replace("{n}", hint.n)}
                  </button>
                );
                if (gain == null && !fromDiscogs) return null;
                return (
                  <div style={{ fontSize: 12, color: "#94a3b8", margin: "-6px 0 14px", lineHeight: 1.5 }}>
                    {gain != null && <span style={{ display: "block", color: gain >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
                      {t("coll.paperGain", "Na papierze: {amount} ({pct})").replace("{amount}", fmtCurrency(gain, form.currency, true)).replace("{pct}", `${gain >= 0 ? "+" : ""}${Math.round(gain / p * 100)}%`)}
                    </span>}
                    {fromDiscogs && <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{t("coll.valueFromDiscogs", "Wycena z Discogs z {date} (najniższa oferta).").replace("{date}", form.valueAt)}</span>}
                  </div>
                );
              })()}

            </> : (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1.3 }}><Input label={t("coll.targetPrice", "Kupię do")} type="text" inputMode="decimal" step="0.01" placeholder={t("common.optional", "opcjonalnie")} value={form.targetPrice} onChange={e => setF({ targetPrice: e.target.value })}/></div>
                <div style={{ flex: 0.9 }}>
                  <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setCurrency(e.target.value)}>
                    {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
            )}

            <button onClick={saveItem} disabled={saving} style={{ ...primaryBtn, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
            </button>
            {form.editingId != null && state === "owned" && (
              <button onClick={sellItem} style={{ ...actionBtn("#ec4899"), width: "100%", marginTop: 8, padding: 12, fontSize: 13, borderRadius: 12 }}>
                <HandCoins size={14}/> {t("coll.sell", "Sprzedaj — przenieś do Sprzedaży")}
              </button>
            )}
            {form.editingId != null && (state === "selling" || state === "sold") && (
              <button onClick={() => { const it = items.find(x => x.id === form.editingId); setForm(null); if (it && onOpenResale) onOpenResale(it.resaleItemId); }}
                style={{ ...actionBtn("#ec4899"), width: "100%", marginTop: 8, padding: 12, fontSize: 13, borderRadius: 12 }}>
                <ExternalLink size={14}/> {t("coll.openResale", "Otwórz w Sprzedaży")}
              </button>
            )}
            {form.editingId != null && (
              <button onClick={deleteItem} style={dangerBtn}><Trash2 size={14}/> {t("coll.deleteItem", "Usuń pozycję")}</button>
            )}
          </>;
        })()}
      </Modal>

      <Modal open={!!assignTx} onClose={() => setAssignTx(null)} title={t("coll.assignTitle", "Przypisz do kolekcji")}>
        {assignTx && <>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 14 }}>{assignTx.desc || "—"} · {assignTx.date} · {txLabel(assignTx)}</div>
          {active.length === 0 ? <>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>{t("coll.assignNoCollections", "Nie masz jeszcze kolekcji. Załóż pierwszą, a potem przypisz do niej ten wpis.")}</div>
            <button onClick={() => { setAssignTx(null); newCollection(); }} style={primaryBtn}>+ {t("coll.newCollection", "Nowa kolekcja")}</button>
          </> : <>
            <div style={fieldLabel}>{t("tx.collection.label", "Kolekcja")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {active.map(h => (
                <div key={h.id} style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { assignToCollection(assignTx.id, h.id); setAssignTx(null); showToast(t("coll.toast.assigned", "Przypisano do: {name} ✓").replace("{name}", h.name)); }} style={{
                    flex: 1, ...card, padding: "11px 14px", cursor: "pointer", textAlign: "left", color: "#e2e8f0", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: h.color, flexShrink: 0 }}/>{h.name}
                  </button>
                  {assignTx.amount < 0 && (
                    <button onClick={() => { const tx = assignTx; assignToCollection(tx.id, h.id); setAssignTx(null); setOpenId(h.id); setDetailTab("catalog"); startFromTx(tx, h.id); }}
                      style={{ ...actionBtn(ACCENT), padding: "0 12px", borderRadius: 14, fontSize: 12, whiteSpace: "nowrap" }}>
                      + {t("coll.toCatalog", "Do katalogu")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>}
        </>}
      </Modal>

      <Modal open={pickFromLedger} onClose={() => setPickFromLedger(false)} title={t("coll.offCatalogTitle", "Dodaj zakup do katalogu")}>
        <div style={{ ...card, background: "#060b14", padding: "2px 12px" }}>
          {offCatalog.slice(0, 30).map((tx, i, arr) => (
            <button key={tx.id} onClick={() => { setPickFromLedger(false); if (open) startFromTx(tx, open.id); }} style={{
              all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #0f1a2e" : "none",
            }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || "—"}</span>
                <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>{tx.date}</span>
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "#f87171" }}>{txLabel(tx)}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={!!linkPicks} onClose={() => setLinkPicks(null)} title={t("coll.link.title", "Połącz stare wpisy")}>
        {linkPicks && <>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
            {t("coll.link.desc", "Te wpisy pasują do pozycji w katalogu. Zaznaczone połączymy — nic nie znika z Wpisów i nic się nie dubluje.")}
          </div>
          {linkSuggestions.dups.length > 0 && <>
            <div style={fieldLabel}>{t("coll.link.dups", "Ta sama pozycja dodana dwa razy")}</div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, marginBottom: 8 }}>
              {t("coll.link.dupsHint", "Zostaje Twoja pozycja (z ceną zakupu), dostaje numer i wycenę z Discogs; kopia z importu znika.")}
            </div>
            {linkSuggestions.dups.map(p => {
              const key = "d" + p.dup.id;
              return (
                <CheckRow key={key} checked={linkPicks[key] !== false} onChange={(v) => setLinkPicks(m => ({ ...m, [key]: v }))} style={{ marginBottom: 6 }}>
                  <span style={{ display: "block", fontWeight: 700 }}>{itemTitle(p.item)}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>= {itemTitle(p.dup)} · Discogs</span>
                </CheckRow>
              );
            })}
          </>}
          {linkSuggestions.buys.length > 0 && <>
            <div style={{ ...fieldLabel, marginTop: 10 }}>{t("coll.link.buys", "Zakupy z Wpisów")}</div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45, marginBottom: 8 }}>
              {t("coll.link.buysHint", "Pozycja dostanie cenę i datę zakupu z wpisu — zobaczysz, ile zyskała.")}
            </div>
            {linkSuggestions.buys.map(p => {
              const key = "b" + p.tx.id;
              return (
                <CheckRow key={key} checked={linkPicks[key] !== false} onChange={(v) => setLinkPicks(m => ({ ...m, [key]: v }))} style={{ marginBottom: 6 }}>
                  <span style={{ display: "block", fontWeight: 700 }}>{itemTitle(p.item)}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b" }}>← {p.tx.desc || "—"} · {p.tx.date} · {txLabel(p.tx)}</span>
                </CheckRow>
              );
            })}
          </>}
          <button onClick={applyLinks} disabled={!linkChosen.dups.length && !linkChosen.buys.length}
            style={{ ...primaryBtn, marginTop: 8, opacity: linkChosen.dups.length + linkChosen.buys.length ? 1 : 0.5 }}>
            {t("coll.link.apply", "Połącz zaznaczone ({n})").replace("{n}", linkChosen.dups.length + linkChosen.buys.length)}
          </button>
        </>}
      </Modal>

      {scanMode && (scanMode === "single" ? formHobby : open) && (
        <ScanModal hobby={scanMode === "single" ? formHobby : open} items={items} setItems={setItems} today={today} mode={scanMode}
          initialStatus={shelf === "wishlist" ? "wishlist" : "owned"}
          salesHint={salesMedian(open, items, resaleItems, getDisplayCurrency())}
          onClose={() => setScanMode(null)}
          onAdded={(n) => { setScanMode(null); setShelf("owned"); showToast(t("scan.added", "Dodano: {n} ✓").replace("{n}", n)); }}
          onPick={(r) => {
            setScanMode(null);
            const fmts = KINDS[kind].formats[lang] || KINDS[kind].formats.en;
            // Wpisane ręcznie zostaje, gdy baza czegoś nie zna; dane z poprzedniego skanu — zastępujemy
            setForm(f => f && ({
              ...f, barcode: r.code,
              title: r.title || (f.barcode ? "" : f.title),
              creator: r.creator || (f.barcode ? "" : f.creator),
              format: fmts.includes(r.format) ? r.format : (f.barcode ? "" : f.format),
              year: r.year || null, discogs: r.discogs || null,
            }));
            if (r.dup) showToast(t("scan.youHave", "Już masz: {title}").replace("{title}", r.dup), "error", 3500);
            else if (!r.found) showToast(t("scan.notFoundToast", "Nie ma tego kodu w bazach — wpisz tytuł, kod zapiszemy."), "error", 3500);
          }}/>
      )}

      {discogsOpen && open && (
        <DiscogsModal hobby={open} items={items} setItems={setItems} today={today} onClose={() => setDiscogsOpen(false)}/>
      )}

      {hobbyForm && (
        <HobbyModal hobby={hobbyForm} setHobby={setHobbyForm} allCats={allCats} onClose={() => setHobbyForm(null)} onSave={saveCollection}/>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { CollectionsView };

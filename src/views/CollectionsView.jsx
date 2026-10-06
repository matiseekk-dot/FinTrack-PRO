import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, Pencil, Trash2, HandCoins, ChevronRight, ExternalLink } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { useToast } from "../hooks/useToast.js";
import {
  card, heroCard, sectionTitle, fieldLabel, heroLabel, primaryBtn, dangerBtn, heroValue, actionBtn,
  Chip, Stat, ModuleHeader, EmptyCard, num,
} from "../components/ModuleUI.jsx";
import { HobbyDetails, HobbyModal } from "./HobbyView.jsx";
import { fmtDisplay, fmtCurrency, todayLocal, cycleTxs } from "../utils.js";
import { t, getLang } from "../i18n.js";
import { getDisplayCurrency, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { canAddTransaction } from "../lib/tier.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import { getHobbyStats, getHobbyExpenses, pickHobbyColor, txMatchesHobby } from "../lib/hobby.js";
import { getModule } from "../lib/modules.js";
import { itemProfit } from "../lib/reselling.js";
import {
  KINDS, CONDITIONS, collectionKind, conditionLabel, itemTitle, itemState,
  buildPurchaseTx, toResaleItem, collectionStats,
} from "../lib/collections.js";

const ACCENT = "#34d399";
const STATE_COLORS = { owned: "#34d399", wishlist: "#f59e0b", selling: "#ec4899", sold: "#64748b" };

/**
 * Kolekcje: katalog pozycji w każdej kolekcji (= hobby) + dotychczasowe wydatki hobby.
 * Sprzedaż pozycji przechodzi do modułu Sprzedaż z kosztem zakupu z katalogu.
 */
function CollectionsView({ hobbies = [], setHobbies, items = [], setItems, resaleItems = [], setResaleItems,
  transactions, setTransactions, accounts, setAccounts, defaultAcc = 1, allCats, month, cycleDay,
  proStatus, openUpgrade, onBack, onOpenResale, addSignal = 0, focusItemId = null, onFocusHandled }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const today = todayLocal();
  const [openId, setOpenId] = useState(null);       // otwarta kolekcja (hobby.id)
  const [detailTab, setDetailTab] = useState("catalog");
  const [shelf, setShelf] = useState("owned");     // owned | wishlist | sold
  const [form, setForm] = useState(null);
  const [hobbyForm, setHobbyForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const active = hobbies.filter(h => !h.archived);
  const archived = hobbies.filter(h => h.archived);
  const open = openId != null ? hobbies.find(h => h.id === openId) : null;

  const { by, total, resaleById } = useMemo(
    () => collectionStats(items, resaleItems),
    [items, resaleItems, getDisplayCurrency()]
  );
  const yearSpend = useMemo(() => {
    const m = {};
    for (const h of hobbies) m[h.id] = getHobbyStats(transactions, h).thisYear || 0;
    return m;
  }, [hobbies, transactions]);
  const cyclePool = useMemo(() => cycleTxs(transactions || [], month, cycleDay), [transactions, month, cycleDay]);

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
  const offCatalog = useMemo(() => open
    ? getHobbyExpenses(transactions, open).filter(tx => !linkedTxIds.has(tx.id))
    : [], [open, transactions, linkedTxIds]);

  const blankItem = (hobbyId, patch = {}) => ({
    editingId: null, hobbyId, status: "owned", title: "", creator: "", format: "", condition: "mint",
    currency: getDisplayCurrency(), acc: defaultAcc,
    buyMode: "new", buyPrice: "", buyDate: today, buyTxId: null,
    value: "", targetPrice: "", ...patch,
  });
  const formFromItem = (it) => ({
    editingId: it.id, hobbyId: it.hobbyId, status: it.status, title: it.title, creator: it.creator || "",
    format: it.format || "", condition: it.condition || "mint",
    currency: it.currency || "PLN", acc: it.acc ?? defaultAcc,
    buyMode: it.buyTxOwned ? "new" : it.buyTxId != null ? "ledger" : "none",
    buyPrice: it.buyPrice != null ? String(it.buyPrice) : "", buyDate: it.buyDate || today, buyTxId: it.buyTxId ?? null,
    value: it.value != null ? String(it.value) : "", targetPrice: it.targetPrice != null ? String(it.targetPrice) : "",
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
  const firstAddSignal = useRef(addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) startAdd(); }, [addSignal]);
  // Wpis z katalogu kliknięty w Wpisach
  useEffect(() => {
    if (focusItemId == null) return;
    const it = items.find(x => x.id === focusItemId);
    if (it) { setOpenId(it.hobbyId); setForm(formFromItem(it)); }
    if (onFocusHandled) onFocusHandled();
  }, [focusItemId]);

  const setF = (patch) => setForm(f => ({ ...f, ...patch }));
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
      targetPrice: !owned && isFinite(num(form.targetPrice)) && num(form.targetPrice) > 0 ? num(form.targetPrice) : null,
      buyPrice: owned && isFinite(price) && price > 0 ? price : null,
      buyDate: owned ? form.buyDate : null,
      buyTxId: owned && form.buyMode === "ledger" ? form.buyTxId : (owned && form.buyMode === "new" && old?.buyTxOwned ? old.buyTxId : null),
      buyTxOwned: owned && form.buyMode === "new",
      createdAt: old?.createdAt || today,
    };

    const oldOwnedTx = old?.buyTxOwned ? transactions.find(tx => tx.id === old.buyTxId) : null;
    if (item.buyTxOwned && !oldOwnedTx && !canAddTransaction(transactions, proStatus?.isPro).allowed) { if (openUpgrade) openUpgrade("limit"); return; }

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
  const valueChange = total.value - total.cost;
  const fmtItem = (amount, it) => fmtCurrency(amount, it.currency || "PLN");
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
          <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{t("coll.spentYear", "wydane w tym roku")}</span>
          <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{fmtDisplay(yearSpend[h.id] || 0)}</span>
        </span>
        <ChevronRight size={14} color="#334155"/>
      </button>
    );
  };

  const shelfItems = open ? items.filter(it => it.hobbyId === open.id).map(it => ({ it, ...itemState(it, resaleById) }))
    .filter(x => shelf === "owned" ? (x.state === "owned" || x.state === "selling") : x.state === shelf)
    .sort((a, b) => (b.it.buyDate || b.it.createdAt || "").localeCompare(a.it.buyDate || a.it.createdAt || "")) : [];

  return (
    <div style={{ padding: "0 16px" }}>
      {!open ? <>
        <ModuleHeader Icon={Disc3} color={ACCENT} title={t("coll.title", "Kolekcje")} onBack={onBack}
          addLabel={active.length ? t("coll.addItem", "Pozycja") : t("coll.addCollection", "Kolekcja")} onAdd={startAdd}/>

        {active.length > 0 && (
          <div style={heroCard}>
            <div style={heroLabel}>{t("coll.value", "Wartość kolekcji")}</div>
            <div style={{ ...heroValue(true), color: "#e2e8f0" }}>{fmtDisplay(total.value)}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <Stat label={t("coll.items", "Pozycje")} value={String(total.owned + total.selling)}/>
              <Stat label={t("coll.cost", "Koszt")} value={fmtDisplay(total.cost)}/>
              <Stat label={t("coll.change", "Zmiana")} value={total.cost > 0 ? fmtDisplay(valueChange, { showSign: true }) : "—"}
                color={valueChange > 0 ? "#34d399" : valueChange < 0 ? "#f87171" : "#e2e8f0"}/>
              <Stat label={t("coll.wishlist", "Lista życzeń")} value={String(total.wishlist)}/>
            </div>
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

        {detailTab === "spending" ? (
          <HobbyDetails embedded hobby={open} transactions={transactions} cyclePool={cyclePool} allCats={allCats}/>
        ) : <>
          {(() => {
            const s = by[open.id] || { owned: 0, selling: 0, wishlist: 0, sold: 0, cost: 0, value: 0, realized: 0 };
            return (
              <div style={{ ...heroCard, padding: "12px 16px", display: "flex", gap: 10 }}>
                <Stat label={t("coll.value", "Wartość kolekcji")} value={fmtDisplay(s.value)}/>
                <Stat label={t("coll.cost", "Koszt")} value={fmtDisplay(s.cost)}/>
                <Stat label={t("coll.items", "Pozycje")} value={String(s.owned + s.selling)}/>
                {s.sold > 0 && <Stat label={t("coll.soldProfit", "Zysk ze sprzedaży")} value={fmtDisplay(s.realized, { showSign: true })} color={s.realized >= 0 ? "#34d399" : "#f87171"}/>}
              </div>
            );
          })()}

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

          {shelfItems.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b", padding: "8px 2px", lineHeight: 1.5 }}>
              {shelf === "owned" ? t("coll.emptyOwned", "Brak pozycji. Dodaj pierwszą — możesz podpiąć zakup, który już jest w Wpisach.")
                : shelf === "wishlist" ? t("coll.emptyWishlist", "Lista życzeń jest pusta.")
                : t("coll.emptySold", "Nic jeszcze nie sprzedane. Użyj „Sprzedaj” przy pozycji.")}
            </div>
          ) : (
            <div style={{ ...card, padding: "2px 14px" }}>
              {shelfItems.map(({ it, state, resale }, i) => {
                const meta = [it.creator, it.format, it.condition ? conditionLabel(it.condition, lang) : null].filter(Boolean).join(" · ");
                let right, rightLabel, rightColor = "#e2e8f0";
                if (state === "sold") {
                  const p = itemProfit(resale);
                  right = fmtCurrency(p, resale.currency || "PLN", true); rightLabel = t("coll.profit", "zysk"); rightColor = p >= 0 ? "#34d399" : "#f87171";
                } else if (state === "wishlist") {
                  right = it.targetPrice ? fmtItem(it.targetPrice, it) : "—"; rightLabel = t("coll.target", "kupię do");
                } else {
                  right = it.value != null ? fmtItem(it.value, it) : it.buyPrice != null ? fmtItem(it.buyPrice, it) : "—";
                  rightLabel = it.value != null ? t("coll.worthShort", "wartość") : t("coll.paid", "kupione");
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
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={() => deleteCollection(open)} style={{ ...dangerBtn, marginTop: 26, border: "none", color: "#64748b", fontSize: 12 }}>
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
                  <div style={{ flex: 1.3 }}><Input label={t("coll.price", "Cena")} type="number" inputMode="decimal" step="0.01" placeholder={form.buyMode === "none" ? t("common.optional", "opcjonalnie") : "0"} value={form.buyPrice} onChange={e => setF({ buyPrice: e.target.value })}/></div>
                  <div style={{ flex: 0.9 }}>
                    <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
                      {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                  <div style={{ flex: 1.4 }}><Input label={t("coll.boughtOn", "Kupione")} type="date" value={form.buyDate} onChange={e => setF({ buyDate: e.target.value })}/></div>
                </div>
              )}

              <Input label={t("coll.estValue", "Szacowana wartość dziś")} type="number" inputMode="decimal" step="0.01" placeholder={t("common.optional", "opcjonalnie")} value={form.value} onChange={e => setF({ value: e.target.value })}/>

              {form.buyMode === "new" && (
                <Select label={t("tx.account", "Konto")} value={form.acc} onChange={e => setF({ acc: parseInt(e.target.value) })}>
                  {accounts.filter(a => a.type !== "invest").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              )}
            </> : (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1.3 }}><Input label={t("coll.targetPrice", "Kupię do")} type="number" inputMode="decimal" step="0.01" placeholder={t("common.optional", "opcjonalnie")} value={form.targetPrice} onChange={e => setF({ targetPrice: e.target.value })}/></div>
                <div style={{ flex: 0.9 }}>
                  <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
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

      {hobbyForm && (
        <HobbyModal hobby={hobbyForm} setHobby={setHobbyForm} allCats={allCats} onClose={() => setHobbyForm(null)} onSave={saveCollection}/>
      )}

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { CollectionsView };

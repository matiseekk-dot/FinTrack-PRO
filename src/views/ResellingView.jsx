import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Check, Trash2, ShoppingBag, Tag, HandCoins } from "lucide-react";
import { Modal } from "../components/ui/Modal.jsx";
import { Input, Select } from "../components/ui/Input.jsx";
import { Toast } from "../components/ui/Toast.jsx";
import { BRAND, card, sectionTitle, fieldLabel, Chip, Stat, actionBtn, PeriodChips, inPeriodFn, num } from "../components/ModuleUI.jsx";
import { useToast } from "../hooks/useToast.js";
import { fmtDisplay, fmtCurrency, todayLocal } from "../utils.js";
import { t, getLang, getLocale } from "../i18n.js";
import { getModule } from "../lib/modules.js";
import { getDisplayCurrency, SUPPORTED_CURRENCIES } from "../lib/fx.js";
import { newId, rateOnDate, commitTxChanges } from "../lib/ledger.js";
import {
  PLATFORMS, ITEM_CATEGORIES, marketPlatforms, platformName, itemCategory, feeRule, rememberFeeRule, calcFee,
  saleNet, itemProfit, daysBetween, buildItemTxs, resellingStats, dac7Stats, DAC7_SALES, DAC7_EUR,
} from "../lib/reselling.js";

const ACCENT = "#ec4899";
const STATUS_COLORS = { stock: "#64748b", listed: "#f59e0b", sold: "#10b981" };

const pct = (x) => x == null ? "—" : `${(x * 100).toFixed(1)}%`;
// Progi DAC7 w pełnych euro
const eur0 = (v) => { try { return new Intl.NumberFormat(getLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v); } catch { return `${Math.round(v)} €`; } };

/**
 * Sprzedaż: przedmioty od zakupu do sprzedaży. Zakup i sprzedaż to wpisy w Wpisach
 * (moduł reselling), więc Start i saldo konta zgadzają się bez osobnego liczenia.
 */
function ResellingView({ items = [], setItems, transactions, setTransactions, setAccounts, defaultAcc = 1, hobbies = [],
  collectionItems = [], setCollectionItems,
  onBack, addSignal = 0, openAdd = false, month = null, onMonthChange, focusItemId = null, onFocusHandled }) {
  const lang = getLang();
  const { toast, showToast } = useToast();
  const [period, setPeriod] = useState("month");
  const [list, setList] = useState("stock"); // stock | sold
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const today = todayLocal();
  const viewMonth = month || today.slice(0, 7);
  const inPeriod = inPeriodFn(period, viewMonth);

  const moduleTxs = useMemo(
    () => transactions.filter(tx => tx && tx.date && getModule(tx, hobbies) === "reselling"),
    [transactions, hobbies]
  );
  const stats = useMemo(
    () => resellingStats(items, moduleTxs, inPeriod),
    [items, moduleTxs, period, viewMonth, getDisplayCurrency()]
  );
  const year = today.slice(0, 4);
  const dac7 = useMemo(() => dac7Stats(items, year), [items, year]);
  const stock = items.filter(it => it.status !== "sold")
    .sort((a, b) => (b.buyDate || b.createdAt || "").localeCompare(a.buyDate || a.createdAt || ""));
  const sold = items.filter(it => it.status === "sold" && inPeriod(it.sellDate))
    .sort((a, b) => (b.sellDate || "").localeCompare(a.sellDate || ""));
  // Sprzedaże zapisane w Wpisach bez przedmiotu (np. stare „Sprzedaż Vinted”) — też są sprzedanymi rzeczami
  const looseSales = moduleTxs.filter(tx => tx.resaleItemId == null && tx.amount > 0 && inPeriod(tx.date))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const soldRows = [
    ...sold.map(it => ({ key: "i" + it.id, date: it.sellDate || "", item: it })),
    ...looseSales.map(tx => ({ key: "t" + tx.id, date: tx.date || "", tx })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  // Pozycje kolekcji, które można sprzedać (posiadane, jeszcze niepowiązane ze sprzedażą)
  const sellableFromCollection = collectionItems.filter(ci => ci.status === "owned" && ci.resaleItemId == null);

  // Ostatnio używane platformy na początku listy chipów
  const platformOrder = useMemo(() => {
    const used = [];
    [...items].sort((a, b) => (b.sellDate || b.createdAt || "").localeCompare(a.sellDate || a.createdAt || ""))
      .forEach(it => { if (it.platform && !used.includes(it.platform)) used.push(it.platform); });
    const known = marketPlatforms(lang);
    return [...used.filter(id => known.includes(id)), ...known.filter(id => !used.includes(id))];
  }, [items]);

  const blankForm = (patch = {}) => {
    const platform = platformOrder[0] || "vinted";
    const rule = feeRule(platform);
    const last = [...items].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || (b.id > a.id ? 1 : -1))[0];
    return {
      editingId: null, name: "", category: last?.category || "other", status: "stock",
      currency: last?.currency || getDisplayCurrency(), acc: defaultAcc, hours: "",
      adoptTxId: null, fromCollectionItemId: null,
      buyPrice: "", buyDate: today, recordPurchase: true,
      platform, customPlatform: false, listPrice: "",
      sellPrice: "", sellDate: today, feePct: String(rule.pct), feeFixed: String(rule.fixed), shipping: "",
      ...patch,
    };
  };

  const formFromItem = (it, patch = {}) => {
    const platform = it.platform || platformOrder[0] || "vinted";
    const rule = it.feePct != null ? { pct: it.feePct, fixed: it.feeFixed ?? 0 } : feeRule(platform);
    return {
      editingId: it.id, name: it.name, category: it.category || "other", status: it.status,
      currency: it.currency || "PLN", acc: it.acc ?? defaultAcc,
      buyPrice: it.buyPrice != null ? String(it.buyPrice) : "", buyDate: it.buyDate || it.createdAt || today,
      recordPurchase: !!it.recordPurchase,
      platform, customPlatform: !!it.platform && !PLATFORMS.some(p => p.id === it.platform),
      listPrice: it.listPrice != null ? String(it.listPrice) : "",
      sellPrice: it.sellPrice != null ? String(it.sellPrice) : (it.listPrice != null ? String(it.listPrice) : ""),
      sellDate: it.sellDate || today,
      feePct: String(rule.pct), feeFixed: String(rule.fixed), shipping: it.shipping != null ? String(it.shipping) : "",
      hours: it.hours != null ? String(it.hours) : "",
      ...patch,
    };
  };

  // Licznik jest wspólny dla ekranów modułów — reagujemy tylko na kliknięcia po wejściu na ekran
  // Uzupełnienie starej sprzedaży: wpis staje się sprzedażą przedmiotu (ten sam wpis, bez dublowania)
  const guessPlatform = (desc) => {
    const d = (desc || "").toLowerCase();
    const p = PLATFORMS.find(x => d.includes(x.id) || (typeof x.name === "string" && d.includes(x.name.toLowerCase())));
    return p ? p.id : (platformOrder[0] || "vinted");
  };
  const formFromLooseTx = (tx) => {
    const fx = tx.origCurrency && tx.origAmount != null;
    return blankForm({
      name: tx.desc || "", status: "sold", platform: guessPlatform(tx.desc), customPlatform: false,
      currency: fx ? tx.origCurrency : "PLN", acc: tx.acc ?? defaultAcc,
      sellPrice: String(Math.abs(fx ? tx.origAmount : tx.amount)), sellDate: tx.date,
      // Kwota wpisu była już „na konto” — bez prowizji, żeby się nie zmieniła
      feePct: "0", feeFixed: "0", shipping: "", recordPurchase: false, buyDate: tx.date,
      adoptTxId: tx.id,
    });
  };
  const pickCollectionItem = (ci) => {
    setForm(f => ({
      ...f, fromCollectionItemId: ci ? ci.id : null,
      ...(ci ? {
        name: f.name || ci.title,
        buyPrice: ci.buyPrice != null && (ci.currency || "PLN") === f.currency ? String(ci.buyPrice) : f.buyPrice,
        buyDate: ci.buyDate || f.buyDate,
        recordPurchase: false, // zakup jest już w Kolekcjach
      } : {}),
    }));
  };

  // openAdd: ekran otwarty skrótem „Dodaj przedmiot” — formularz od razu
  const firstAddSignal = useRef(openAdd ? null : addSignal);
  useEffect(() => { if (addSignal !== firstAddSignal.current) setForm(blankForm()); }, [addSignal]);
  useEffect(() => {
    if (focusItemId == null) return;
    const it = items.find(x => x.id === focusItemId);
    if (it) setForm(formFromItem(it));
    if (onFocusHandled) onFocusHandled();
  }, [focusItemId]);

  const setF = (patch) => setForm(f => ({ ...f, ...patch }));
  const pickPlatform = (id) => {
    const rule = feeRule(id);
    setF({ platform: id, customPlatform: false, feePct: String(rule.pct), feeFixed: String(rule.fixed) });
  };

  const fee = form ? calcFee(num(form.sellPrice), { pct: num(form.feePct) || 0, fixed: num(form.feeFixed) || 0 }) : 0;
  const previewItem = form ? { sellPrice: num(form.sellPrice) || 0, fees: fee, shipping: num(form.shipping) || 0, buyPrice: num(form.buyPrice) || 0 } : null;

  const save = async () => {
    if (!form || saving) return;
    const name = form.name.trim();
    if (!name) { showToast(t("resale.err.name", "Wpisz nazwę przedmiotu"), "error"); return; }
    const buyPrice = num(form.buyPrice);
    if (form.buyPrice !== "" && (!isFinite(buyPrice) || buyPrice < 0)) { showToast(t("resale.err.buyPrice", "Niepoprawna cena zakupu"), "error"); return; }
    const sellPrice = num(form.sellPrice);
    if (form.status === "sold" && (!isFinite(sellPrice) || sellPrice <= 0)) { showToast(t("resale.err.sellPrice", "Wpisz cenę sprzedaży"), "error"); return; }

    const old = form.editingId != null ? items.find(x => x.id === form.editingId) : null;
    const platform = form.platform.trim();
    const item = {
      ...(old || {}), // zachowuje pola spoza formularza (np. fromCollectionItemId)
      id: old ? old.id : newId(),
      name, category: form.category, status: form.status,
      currency: form.currency, acc: parseInt(form.acc) || defaultAcc,
      buyPrice: isFinite(buyPrice) && buyPrice > 0 ? buyPrice : null,
      buyDate: form.buyDate, recordPurchase: !!form.recordPurchase && isFinite(buyPrice) && buyPrice > 0,
      platform: form.status === "stock" ? (old?.platform || null) : (platform || null),
      listPrice: form.status === "listed" && isFinite(num(form.listPrice)) ? num(form.listPrice) : (old?.listPrice ?? null),
      sellPrice: form.status === "sold" ? sellPrice : null,
      sellDate: form.status === "sold" ? form.sellDate : null,
      feePct: form.status === "sold" ? (num(form.feePct) || 0) : null,
      feeFixed: form.status === "sold" ? (num(form.feeFixed) || 0) : null,
      fees: form.status === "sold" ? fee : null,
      shipping: form.status === "sold" ? (num(form.shipping) || 0) : null,
      hours: isFinite(num(form.hours)) && num(form.hours) > 0 ? num(form.hours) : null,
      buyTxId: old?.buyTxId ?? null, sellTxId: old?.sellTxId ?? (form.adoptTxId ?? null),
      fromCollectionItemId: old?.fromCollectionItemId ?? (form.fromCollectionItemId ?? null),
      createdAt: old?.createdAt || today,
    };

    const oldTxs = [old?.buyTxId, old?.sellTxId, old ? null : form.adoptTxId]
      .filter(id => id != null)
      .map(id => transactions.find(tx => tx.id === id))
      .filter(Boolean);
    const createsTx = (item.recordPurchase && item.buyTxId == null) || (item.status === "sold" && item.sellTxId == null);

    setSaving(true);
    try {
      const oldBuy = oldTxs.find(tx => tx.id === item.buyTxId);
      const oldSell = oldTxs.find(tx => tx.id === item.sellTxId);
      const reuse = (oldTx, date) => oldTx && oldTx.date === date && (oldTx.origCurrency || "PLN") === item.currency ? (oldTx.fxRate || 1) : null;
      const rates = {
        buy: item.recordPurchase ? (reuse(oldBuy, item.buyDate) ?? await rateOnDate(item.currency, item.buyDate)) : 1,
        sell: item.status === "sold" ? (reuse(oldSell, item.sellDate) ?? await rateOnDate(item.currency, item.sellDate)) : 1,
      };
      const { buy, sell } = buildItemTxs(item, rates, lang);
      item.buyTxId = buy ? buy.id : null;
      item.sellTxId = sell ? sell.id : null;
      item.sellFxRate = sell ? (sell.fxRate || 1) : null;

      commitTxChanges({ setTransactions, setAccounts }, { add: [buy, sell].filter(Boolean), remove: oldTxs });
      setItems(prev => old ? prev.map(x => x.id === item.id ? item : x) : [item, ...prev]);
      // Rzecz z kolekcji: w Kolekcjach pokaże się jako wystawiona / sprzedana
      if (!old && item.fromCollectionItemId != null && setCollectionItems) {
        setCollectionItems(prev => prev.map(ci => ci.id === item.fromCollectionItemId ? { ...ci, resaleItemId: item.id } : ci));
      }
      if (item.status === "sold" && item.platform) rememberFeeRule(item.platform, item.feePct, item.feeFixed);
      showToast(item.status === "sold" && old?.status !== "sold"
        ? `${t("resale.toast.sold", "Sprzedane")} · ${fmtCurrency(itemProfit(item), item.currency)} ${t("resale.profitWord", "zysku")}`
        : old ? t("resale.toast.updated", "Zapisano ✓") : t("resale.toast.added", "Przedmiot dodany ✓"));
      if (item.status === "sold") setList("sold"); else setList("stock");
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    const old = items.find(x => x.id === form?.editingId);
    if (!old || !window.confirm(t("resale.confirmDelete", "Usunąć przedmiot razem z jego wpisami zakupu i sprzedaży?"))) return;
    const linked = [old.buyTxId, old.sellTxId].filter(id => id != null).map(id => transactions.find(tx => tx.id === id)).filter(Boolean);
    commitTxChanges({ setTransactions, setAccounts }, { remove: linked });
    setItems(prev => prev.filter(x => x.id !== old.id));
    if (setCollectionItems) setCollectionItems(prev => prev.map(ci => ci.resaleItemId === old.id ? { ...ci, resaleItemId: null } : ci));
    showToast(t("resale.toast.deleted", "Przedmiot usunięty"), "error");
    setForm(null);
  };

  const fmtItem = (amount, it) => fmtCurrency(amount, it.currency || "PLN");

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
        <button onClick={onBack} aria-label={t("common.back", "Wstecz")} style={{ background: "#0d1628", border: "1px solid #1a2744", borderRadius: 10, padding: 7, cursor: "pointer", color: "#94a3b8", display: "grid", placeItems: "center" }}>
          <ArrowLeft size={16}/>
        </button>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: ACCENT + "22", border: `1px solid ${ACCENT}55`, display: "grid", placeItems: "center" }}>
          <ShoppingBag size={15} color={ACCENT}/>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", flex: 1 }}>{t("resale.title", "Sprzedaż")}</h1>
        <button onClick={() => setForm(blankForm())} style={{ background: BRAND, border: "none", borderRadius: 10, padding: "8px 12px", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
          <Plus size={14}/> {t("resale.add", "Przedmiot")}
        </button>
      </div>

      <PeriodChips value={period} onChange={setPeriod} month={viewMonth} onMonthChange={onMonthChange}/>

      {/* Zysk */}
      <div style={{ ...card, padding: 16, background: "linear-gradient(135deg,#0d1628,#111827)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("resale.profit", "Zysk ze sprzedanych")}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 30, fontWeight: 800, color: stats.profit >= 0 ? "#34d399" : "#f87171", marginTop: 4, letterSpacing: "-0.02em" }}>
          {fmtDisplay(stats.profit, { showSign: true })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Stat label={t("resale.soldCount", "Sprzedane")} value={String(stats.sold)}/>
          <Stat label={t("resale.revenue", "Na konto")} value={fmtDisplay(stats.revenue)}/>
          <Stat label={t("resale.margin", "Marża")} value={pct(stats.margin)}/>
          <Stat label={t("resale.avgDays", "Śr. czas")} value={stats.avgDays != null ? `${stats.avgDays} ${t("resale.daysShort", "dni")}` : "—"}/>
        </div>
        {stats.fees > 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 12 }}>
            {t("resale.feesLine", "Prowizje i wysyłka: {amount}").replace("{amount}", fmtDisplay(stats.fees))}
          </div>
        )}
        {stats.hourly != null && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
            {t("resale.hourlyLine", "Zysk na godzinę: {amount} (przedmioty z wpisanym czasem: {n})").replace("{amount}", fmtDisplay(stats.hourly)).replace("{n}", stats.hoursCount)}
          </div>
        )}
        {stats.looseCount > 0 && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, lineHeight: 1.45 }}>
            {t("resale.looseNote", "Wpisy bez przedmiotu ({n}): {amount}").replace("{n}", stats.looseCount).replace("{amount}", fmtDisplay(stats.looseNet, { showSign: true }))}
          </div>
        )}
      </div>

      {/* Magazyn */}
      {stats.stockCount > 0 && (
        <div style={{ ...card, padding: "12px 16px", marginTop: 10, display: "flex", gap: 10 }}>
          <Stat label={t("resale.inStock", "Na stanie")} value={String(stats.stockCount)}/>
          <Stat label={t("resale.capital", "Zamrożone")} value={fmtDisplay(stats.capital)}/>
          <Stat label={t("resale.listedValue", "Wystawione za")} value={stats.listedCount > 0 ? fmtDisplay(stats.listedValue) : "—"}/>
        </div>
      )}

      {dac7.length > 0 && (
        <div style={{ ...card, padding: "12px 16px", marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {t("resale.dac7.title", "Próg DAC7 · {year}").replace("{year}", year)}
          </div>
          {dac7.slice(0, 4).map(g => {
            const color = g.reached ? "#f87171" : g.progress >= 0.8 ? "#fbbf24" : "#34d399";
            return (
              <div key={g.platform} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{platformName(g.platform, lang)}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color, fontWeight: 700 }}>
                    {g.count}/{DAC7_SALES} · {eur0(g.eur)}/{eur0(DAC7_EUR)}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "#060b14", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, g.progress * 100)}%`, height: "100%", background: color, borderRadius: 3 }}/>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
            {dac7.some(g => g.reached)
              ? t("resale.dac7.reached", "Na platformie zaznaczonej na czerwono przekroczyłeś próg — zgłosi ona Twoje sprzedaże do urzędu skarbowego. To raport, nie podatek: sprawdź, czy Twoja sprzedaż podlega opodatkowaniu.")
              : t("resale.dac7.hint", "Platformy w UE zgłaszają do urzędu skarbowego sprzedawców z co najmniej 30 sprzedażami albo 2000 € w roku — osobno na każdej platformie. To raport, nie podatek.")}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ ...card, padding: "28px 20px", textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t("resale.emptyTitle", "Dodaj pierwszy przedmiot")}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>
            {t("resale.emptyDesc", "Zapisz, za ile kupiłeś i gdzie sprzedałeś — prowizję i zysk policzymy sami.")}
          </div>
          <button onClick={() => setForm(blankForm())} style={{ marginTop: 16, background: BRAND, border: "none", borderRadius: 12, padding: "11px 18px", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            + {t("resale.add", "Przedmiot")}
          </button>
        </div>
      ) : <>
        <div style={{ display: "flex", gap: 6, margin: "18px 0 10px" }}>
          <Chip on={list === "stock"} color={ACCENT} onClick={() => setList("stock")}>{t("resale.tab.stock", "Na stanie")} · {stock.length}</Chip>
          <Chip on={list === "sold"} color={ACCENT} onClick={() => setList("sold")}>{t("resale.tab.sold", "Sprzedane")} · {soldRows.length}</Chip>
        </div>

        {list === "stock" && (stock.length === 0
          ? <div style={{ fontSize: 13, color: "#64748b", padding: "8px 2px" }}>{t("resale.stockEmpty", "Wszystko sprzedane.")}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stock.map(it => {
                const cat = itemCategory(it.category);
                const Icon = cat.icon;
                const days = daysBetween(it.buyDate || it.createdAt, today);
                return (
                  <div key={it.id} style={{ ...card, padding: 14 }}>
                    <button onClick={() => setForm(formFromItem(it))} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", width: "100%" }}>
                      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: cat.color + "22", border: `1px solid ${cat.color}55`, display: "grid", placeItems: "center" }}>
                        <Icon size={16} color={cat.color}/>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.status === "listed"
                            ? `${t("resale.listedOn", "Wystawione")}${it.platform ? ` · ${platformName(it.platform, lang)}` : ""}${it.listPrice ? ` · ${fmtItem(it.listPrice, it)}` : ""}`
                            : t("resale.status.stock", "Na stanie")}
                          {days != null ? ` · ${days} ${t("resale.daysShort", "dni")}` : ""}
                        </span>
                      </span>
                      <span style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ display: "block", fontSize: 10, color: "#64748b" }}>{t("resale.bought", "kupione")}</span>
                        <span style={{ display: "block", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>{it.buyPrice ? fmtItem(it.buyPrice, it) : "—"}</span>
                      </span>
                    </button>
                    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                      {it.status === "stock" && (
                        <button onClick={() => setForm(formFromItem(it, { status: "listed" }))} style={actionBtn(STATUS_COLORS.listed)}>
                          <Tag size={12}/> {t("resale.list", "Wystaw")}
                        </button>
                      )}
                      <button onClick={() => setForm(formFromItem(it, { status: "sold", sellDate: today }))} style={actionBtn(STATUS_COLORS.sold)}>
                        <HandCoins size={12}/> {t("resale.markSold", "Sprzedane")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
        )}

        {list === "sold" && (soldRows.length === 0
          ? <div style={{ fontSize: 13, color: "#64748b", padding: "8px 2px" }}>{t("resale.soldEmpty", "Nic nie sprzedane w tym okresie.")}</div>
          : <div style={{ ...card, padding: "2px 14px" }}>
              {soldRows.map((row, i) => {
                const last = i === soldRows.length - 1;
                if (row.tx) {
                  const tx = row.tx;
                  const fx = tx.origCurrency && tx.origAmount != null;
                  return (
                    <button key={row.key} onClick={() => setForm(formFromLooseTx(tx))} style={{
                      all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                      borderBottom: last ? "none" : "1px solid #0f1a2e",
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc || "—"}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {tx.date} · <span style={{ color: "#fbbf24" }}>{t("resale.loose.fill", "uzupełnij szczegóły")}</span>
                        </span>
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, flexShrink: 0, color: "#94a3b8" }}>
                        +{fx ? fmtCurrency(Math.abs(tx.origAmount), tx.origCurrency) : fmtCurrency(tx.amount, "PLN")}
                      </span>
                    </button>
                  );
                }
                const it = row.item;
                const profit = itemProfit(it);
                return (
                  <button key={row.key} onClick={() => setForm(formFromItem(it))} style={{
                    all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
                    borderBottom: last ? "none" : "1px solid #0f1a2e",
                  }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[platformName(it.platform, lang), it.sellDate, `${t("resale.soldFor", "za")} ${fmtItem(it.sellPrice, it)}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, flexShrink: 0, color: profit >= 0 ? "#34d399" : "#f87171" }}>
                      {fmtCurrency(profit, it.currency || "PLN", true)}
                    </span>
                  </button>
                );
              })}
            </div>
        )}

        {stats.byPlatform.length > 0 && <>
          <div style={sectionTitle}>{t("resale.byPlatform", "Platformy")}</div>
          <div style={{ ...card, padding: "4px 14px" }}>
            {stats.byPlatform.map((r, i) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < stats.byPlatform.length - 1 ? "1px solid #0f1a2e" : "none" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{r.key === "other" ? t("resale.noPlatform", "Bez platformy") : platformName(r.key, lang)}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {r.count} · {t("resale.revenue", "Na konto")} {fmtDisplay(r.revenue)}{r.fees > 0 ? ` · ${t("resale.feesShort", "opłaty")} ${fmtDisplay(r.fees)}` : ""}
                  </span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: r.profit >= 0 ? "#34d399" : "#f87171" }}>{fmtDisplay(r.profit, { showSign: true })}</span>
              </div>
            ))}
          </div>
        </>}
      </>}

      {/* Formularz przedmiotu */}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.editingId != null ? t("resale.editTitle", "Przedmiot") : t("resale.newTitle", "Nowy przedmiot")}>
        {form && <>
          {form.adoptTxId != null && (
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginBottom: 12 }}>
              {t("resale.loose.hint", "Ta sprzedaż jest już w Wpisach. Uzupełnij koszt zakupu i platformę, a policzymy zysk — wpis się nie zdubluje.")}
            </div>
          )}
          {form.editingId == null && sellableFromCollection.length > 0 && (
            <Select label={t("resale.fromCollection", "Z kolekcji (opcjonalnie)")} value={form.fromCollectionItemId ?? ""} onChange={e => {
              const ci = sellableFromCollection.find(x => String(x.id) === e.target.value);
              pickCollectionItem(ci || null);
            }}>
              <option value="">{t("resale.fromCollection.none", "— nie z kolekcji —")}</option>
              {sellableFromCollection.map(ci => {
                const h = hobbies.find(x => x.id === ci.hobbyId);
                return <option key={ci.id} value={ci.id}>{ci.title}{h ? ` · ${h.name}` : ""}</option>;
              })}
            </Select>
          )}
          <Input label={t("resale.name", "Nazwa")} placeholder={t("resale.namePh", "np. Pink Floyd – The Wall (LP)")} value={form.name} onChange={e => setF({ name: e.target.value })}/>

          <div style={fieldLabel}>{t("resale.category", "Kategoria")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {ITEM_CATEGORIES.map(c => <Chip key={c.id} on={form.category === c.id} color={c.color} onClick={() => setF({ category: c.id })}>{c.label[lang] || c.label.en}</Chip>)}
          </div>

          <div style={fieldLabel}>{t("resale.statusLabel", "Status")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[["stock", t("resale.status.stock", "Na stanie")], ["listed", t("resale.status.listed", "Wystawione")], ["sold", t("resale.status.sold", "Sprzedane")]].map(([id, label]) => (
              <Chip key={id} on={form.status === id} color={STATUS_COLORS[id]} onClick={() => setF({ status: id, ...(id === "sold" && !form.sellPrice && form.listPrice ? { sellPrice: form.listPrice } : {}) })}>{label}</Chip>
            ))}
          </div>

          {/* Zakup */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1.3 }}><Input label={t("resale.buyPrice", "Koszt zakupu")} type="number" inputMode="decimal" step="0.01" placeholder="0" value={form.buyPrice} onChange={e => setF({ buyPrice: e.target.value })}/></div>
            <div style={{ flex: 0.9 }}>
              <Select label={t("tx.currency", "Waluta")} value={form.currency} onChange={e => setF({ currency: e.target.value })}>
                {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div style={{ flex: 1.4 }}><Input label={t("resale.buyDate", "Kupione")} type="date" value={form.buyDate} onChange={e => setF({ buyDate: e.target.value })}/></div>
          </div>
          {num(form.buyPrice) > 0 && (
            <button type="button" role="checkbox" aria-checked={form.recordPurchase} onClick={() => setF({ recordPurchase: !form.recordPurchase })} style={{
              width: "100%", display: "flex", alignItems: "flex-start", gap: 10, margin: "-4px 0 14px", padding: "10px 12px",
              background: "#060b14", border: "1px solid #1a2744", borderRadius: 10, cursor: "pointer", textAlign: "left",
              color: "#cbd5e1", fontSize: 12, lineHeight: 1.45, fontFamily: "inherit",
            }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${form.recordPurchase ? "#10b981" : "#475569"}`, background: form.recordPurchase ? "#10b981" : "transparent", display: "grid", placeItems: "center" }}>
                {form.recordPurchase && <Check size={12} color="white" strokeWidth={3}/>}
              </span>
              <span>{t("resale.recordPurchase", "Zapisz zakup jako wydatek. Odznacz, jeśli sprzedajesz coś, co już miałeś.")}</span>
            </button>
          )}

          {/* Platforma (wystawione / sprzedane) */}
          {form.status !== "stock" && <>
            <div style={fieldLabel}>{t("resale.platform", "Platforma")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {platformOrder.map(id => <Chip key={id} on={!form.customPlatform && form.platform === id} color={ACCENT} onClick={() => pickPlatform(id)}>{platformName(id, lang)}</Chip>)}
              <Chip on={form.customPlatform} color={ACCENT} onClick={() => setF({ customPlatform: true, platform: "", feePct: "0", feeFixed: "0" })}>{t("resale.otherPlatform", "Inna…")}</Chip>
            </div>
            {form.customPlatform && <Input placeholder={t("resale.platformName", "Nazwa platformy")} value={form.platform} onChange={e => setF({ platform: e.target.value })}/>}
          </>}

          {form.status === "listed" && (
            <Input label={t("resale.listPrice", "Cena wystawienia")} type="number" inputMode="decimal" step="0.01" value={form.listPrice} onChange={e => setF({ listPrice: e.target.value })}/>
          )}

          {form.status === "sold" && <>
            <div style={{ display: "flex", gap: 8, marginTop: form.customPlatform ? 0 : 6 }}>
              <div style={{ flex: 1.4 }}><Input label={t("resale.sellPrice", "Cena sprzedaży")} type="number" inputMode="decimal" step="0.01" value={form.sellPrice} onChange={e => setF({ sellPrice: e.target.value })}/></div>
              <div style={{ flex: 1 }}><Input label={t("resale.feePct", "Prowizja %")} type="number" inputMode="decimal" step="0.1" value={form.feePct} onChange={e => setF({ feePct: e.target.value })}/></div>
              <div style={{ flex: 1 }}><Input label={t("resale.feeFixed", "+ stała")} type="number" inputMode="decimal" step="0.01" value={form.feeFixed} onChange={e => setF({ feeFixed: e.target.value })}/></div>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", margin: "-6px 0 14px", lineHeight: 1.45 }}>
              {t("resale.feeHint", "Typowe opłaty sprzedającego — zależą od kraju i kategorii. Zmienione zapamiętamy dla tej platformy.")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><Input label={t("resale.shipping", "Wysyłka (płacisz Ty)")} type="number" inputMode="decimal" step="0.01" placeholder="0" value={form.shipping} onChange={e => setF({ shipping: e.target.value })}/></div>
              <div style={{ flex: 1 }}><Input label={t("resale.sellDate", "Sprzedane")} type="date" value={form.sellDate} onChange={e => setF({ sellDate: e.target.value })}/></div>
            </div>
            {num(form.sellPrice) > 0 && (
              <div style={{ ...card, background: "#060b14", padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#94a3b8", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("resale.fee", "Prowizja")}</span><span style={{ fontFamily: "'DM Mono', monospace" }}>−{fmtCurrency(fee, form.currency)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("resale.revenue", "Na konto")}</span><span style={{ fontFamily: "'DM Mono', monospace", color: "#e2e8f0" }}>{fmtCurrency(saleNet(previewItem), form.currency)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>{t("resale.profitOne", "Zysk")}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: itemProfit(previewItem) >= 0 ? "#34d399" : "#f87171" }}>{fmtCurrency(itemProfit(previewItem), form.currency, true)}</span>
                </div>
              </div>
            )}
          </>}

          <Input label={t("resale.hours", "Czas pracy (h, opcjonalnie)")} type="number" inputMode="decimal" step="0.25" placeholder={t("resale.hoursPh", "szukanie, zdjęcia, wysyłka")}
            value={form.hours} onChange={e => setF({ hours: e.target.value })}/>

          <button onClick={save} disabled={saving} style={{ width: "100%", background: BRAND, border: "none", borderRadius: 12, padding: 14, color: "white", fontWeight: 700, fontSize: 15, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
            {saving ? t("common.saving", "Zapisuję…") : t("common.save", "Zapisz")}
          </button>
          {form.editingId != null && (
            <button onClick={remove} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #7f1d1d", borderRadius: 12, padding: 12, color: "#f87171", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Trash2 size={14}/> {t("resale.delete", "Usuń przedmiot")}
            </button>
          )}
        </>}
      </Modal>

      <Toast message={toast.message} type={toast.type} visible={toast.visible}/>
    </div>
  );
}

export { ResellingView };

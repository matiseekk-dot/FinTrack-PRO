// Moduł Sprzedaż: przedmioty na sprzedaż, prowizje platform i statystyki.
//
// Przedmiot (kolekcja `resaleItems`) to metadane: zakup, wystawienie, sprzedaż.
// Pieniądze idą przez zwykłe transakcje modułu "reselling" powiązane z przedmiotem
// (resaleItemId): zakup → wydatek, sprzedaż → przychód netto po prowizji i wysyłce.
// Start liczy więc przepływ gotówki, a ten moduł — zysk na każdym przedmiocie.

import { Disc3, BookOpen, Gamepad2, Shirt, Smartphone, Gem, Package } from "lucide-react";
import { round2, makeTx } from "./ledger.js";
import { amountForDisplay, txAmountForDisplay } from "./fx.js";

// Typowe prowizje sprzedającego (procent + stała kwota w walucie transakcji).
// Zależą od kraju, kategorii i typu konta — dlatego zawsze edytowalne w formularzu,
// a ostatnio użyte wartości zapamiętujemy per platforma (ft_resale_fees).
const PLATFORMS = [
  { id: "vinted",   name: "Vinted",          pct: 0,    fixed: 0 },
  { id: "allegro",  name: "Allegro",         pct: 10,   fixed: 0 },
  { id: "olx",      name: "OLX",             pct: 0,    fixed: 0 },
  { id: "fbm",      name: "FB Marketplace",  pct: 0,    fixed: 0 },
  { id: "ebay",     name: "eBay",            pct: 13,   fixed: 0.30 },
  { id: "depop",    name: "Depop",           pct: 3.3,  fixed: 0.45 },
  { id: "wallapop", name: "Wallapop",        pct: 0,    fixed: 0 },
  { id: "etsy",     name: "Etsy",            pct: 9.5,  fixed: 0.45 },
  { id: "discogs",  name: "Discogs",         pct: 12,   fixed: 0.30 },
  { id: "mercari",  name: "Mercari",         pct: 10,   fixed: 0.50 },
  // v2.4.0: lokalne serwisy nowych rynków — sprzedający prywatny zwykle bez prowizji
  { id: "kleinanzeigen", name: "Kleinanzeigen",  pct: 0,    fixed: 0 },
  { id: "leboncoin",     name: "Leboncoin",      pct: 0,    fixed: 0 },
  { id: "subito",        name: "Subito",         pct: 0,    fixed: 0 },
  { id: "marktplaats",   name: "Marktplaats",    pct: 0,    fixed: 0 },
  { id: "mercadolivre",  name: "Mercado Livre",  pct: 12,   fixed: 0 },
  { id: "local",    name: { en: "In person", pl: "Osobiście", de: "Persönlich", es: "En persona", fr: "En main propre", pt: "Pessoalmente", it: "Di persona", nl: "Persoonlijk", uk: "Особисто" }, pct: 0, fixed: 0 },
];
const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));

// Kolejność platform na danym rynku (język apki); reszta po nich
const MARKET_PLATFORMS = {
  pl: ["vinted", "allegro", "olx", "fbm", "ebay", "local"],
  en: ["ebay", "vinted", "depop", "etsy", "mercari", "fbm", "local"],
  de: ["vinted", "kleinanzeigen", "ebay", "local", "etsy"],
  es: ["wallapop", "vinted", "ebay", "local"],
  fr: ["vinted", "leboncoin", "ebay", "local", "etsy"],
  pt: ["mercadolivre", "olx", "fbm", "local"],
  it: ["vinted", "subito", "ebay", "wallapop", "local"],
  nl: ["vinted", "marktplaats", "ebay", "local"],
  uk: ["olx", "fbm", "local"],
};
function marketPlatforms(lang) {
  const first = MARKET_PLATFORMS[lang] || MARKET_PLATFORMS.en;
  return [...first, ...PLATFORMS.map(p => p.id).filter(id => !first.includes(id))];
}

const ITEM_CATEGORIES = [
  { id: "vinyl",       icon: Disc3,      color: "#34d399", label: { en: "Vinyl & music", pl: "Winyle i muzyka", de: "Vinyl & Musik", es: "Vinilos y música", fr: "Vinyles et musique", pt: "Vinis e música", it: "Vinili e musica", nl: "Vinyl en muziek", uk: "Вініл і музика" } },
  { id: "books",       icon: BookOpen,   color: "#f59e0b", label: { en: "Books", pl: "Książki", de: "Bücher", es: "Libros", fr: "Livres", pt: "Livros", it: "Libri", nl: "Boeken", uk: "Книги" } },
  { id: "games",       icon: Gamepad2,   color: "#a78bfa", label: { en: "Games", pl: "Gry", de: "Spiele", es: "Juegos", fr: "Jeux", pt: "Jogos", it: "Giochi", nl: "Games", uk: "Ігри" } },
  { id: "clothes",     icon: Shirt,      color: "#ec4899", label: { en: "Clothes", pl: "Ubrania", de: "Kleidung", es: "Ropa", fr: "Vêtements", pt: "Roupas", it: "Abbigliamento", nl: "Kleding", uk: "Одяг" } },
  { id: "electronics", icon: Smartphone, color: "#06b6d4", label: { en: "Electronics", pl: "Elektronika", de: "Elektronik", es: "Electrónica", fr: "Électronique", pt: "Eletrônicos", it: "Elettronica", nl: "Elektronica", uk: "Електроніка" } },
  { id: "collectibles",icon: Gem,        color: "#f43f5e", label: { en: "Collectibles", pl: "Kolekcjonerskie", de: "Sammlerstücke", es: "Coleccionables", fr: "Objets de collection", pt: "Colecionáveis", it: "Da collezione", nl: "Verzamelobjecten", uk: "Колекційне" } },
  { id: "other",       icon: Package,    color: "#64748b", label: { en: "Other", pl: "Inne", de: "Sonstiges", es: "Otros", fr: "Autre", pt: "Outros", it: "Altro", nl: "Overig", uk: "Інше" } },
];
const CATEGORY_BY_ID = Object.fromEntries(ITEM_CATEGORIES.map(c => [c.id, c]));

const FEES_KEY = "ft_resale_fees";

function platformName(idOrName, lang = "en") {
  if (!idOrName) return "";
  const p = PLATFORM_BY_ID[idOrName];
  if (!p) return String(idOrName);
  return typeof p.name === "string" ? p.name : (p.name[lang] || p.name.en);
}

function itemCategory(id) {
  return CATEGORY_BY_ID[id] || CATEGORY_BY_ID.other;
}

/** Prowizja dla platformy: zapamiętane ustawienia użytkownika, inaczej typowe. */
function feeRule(platformId) {
  try {
    const saved = JSON.parse(localStorage.getItem(FEES_KEY) || "{}")[platformId];
    if (saved && isFinite(saved.pct) && isFinite(saved.fixed)) return saved;
  } catch (_) { /* brak zapisanych */ }
  const p = PLATFORM_BY_ID[platformId];
  return { pct: p ? p.pct : 0, fixed: p ? p.fixed : 0 };
}

function rememberFeeRule(platformId, pct, fixed) {
  if (!platformId) return;
  try {
    const all = JSON.parse(localStorage.getItem(FEES_KEY) || "{}");
    all[platformId] = { pct: Number(pct) || 0, fixed: Number(fixed) || 0 };
    localStorage.setItem(FEES_KEY, JSON.stringify(all));
  } catch (_) { /* best effort */ }
}

function calcFee(price, { pct, fixed }) {
  const p = Number(price) || 0;
  if (p <= 0) return 0;
  return round2(p * (Number(pct) || 0) / 100 + (Number(fixed) || 0));
}

/** Kwota netto ze sprzedaży (to, co trafia na konto). */
function saleNet(item) {
  return round2((Number(item.sellPrice) || 0) - (Number(item.fees) || 0) - (Number(item.shipping) || 0));
}

/** Zysk na przedmiocie w jego walucie: netto ze sprzedaży − koszt zakupu. */
function itemProfit(item) {
  return round2(saleNet(item) - (Number(item.buyPrice) || 0));
}

function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const d = (new Date(toISO) - new Date(fromISO)) / 86400000;
  return isFinite(d) && d >= 0 ? Math.round(d) : null;
}

/**
 * Transakcje, które powinny istnieć dla przedmiotu. Zachowuje id istniejących
 * (buyTxId / sellTxId), żeby edycja podmieniała wpisy zamiast tworzyć nowe.
 * rates: { buy, sell } — kursy waluty przedmiotu z dni zakupu i sprzedaży.
 */
function buildItemTxs(item, rates, lang = "en") {
  const out = { buy: null, sell: null };
  const base = { currency: item.currency, acc: item.acc, module: "reselling", resaleItemId: item.id };
  if (item.recordPurchase && Number(item.buyPrice) > 0) {
    out.buy = makeTx({
      ...base, id: item.buyTxId ?? undefined, rate: rates.buy,
      date: item.buyDate, desc: item.name, amount: -Number(item.buyPrice), cat: "zakupy",
    });
  }
  if (item.status === "sold") {
    const where = platformName(item.platform, lang);
    out.sell = makeTx({
      ...base, id: item.sellTxId ?? undefined, rate: rates.sell,
      date: item.sellDate, desc: where ? `${item.name} · ${where}` : item.name,
      amount: saleNet(item), cat: "sprzedaż",
    });
  }
  return out;
}

/**
 * Statystyki: sprzedane w okresie (po dacie sprzedaży), stan magazynu (zawsze bieżący),
 * plus wpisy modułu bez przedmiotu (stare „Sprzedaż Vinted” itd.).
 * Kwoty w PLN-ekwiwalencie gotowym do fmtDisplay.
 */
function resellingStats(items, moduleTxs, inPeriod) {
  const s = {
    sold: 0, gross: 0, fees: 0, revenue: 0, cost: 0, profit: 0,
    daysSum: 0, daysCount: 0,
    stockCount: 0, capital: 0, listedCount: 0, listedValue: 0,
    looseCount: 0, looseNet: 0,
    byPlatform: {}, byCategory: {},
  };
  const conv = (amount, item) => amountForDisplay(amount, item.currency, item.sellFxRate);

  for (const it of items) {
    if (it.status === "sold") {
      if (!inPeriod(it.sellDate)) continue;
      const gross = conv(it.sellPrice, it);
      const fees = conv((Number(it.fees) || 0) + (Number(it.shipping) || 0), it);
      const cost = conv(it.buyPrice, it);
      const profit = gross - fees - cost;
      s.sold += 1; s.gross += gross; s.fees += fees; s.revenue += gross - fees; s.cost += cost; s.profit += profit;
      const days = daysBetween(it.buyDate || it.createdAt, it.sellDate);
      if (days != null) { s.daysSum += days; s.daysCount += 1; }
      for (const [map, key] of [[s.byPlatform, it.platform || "other"], [s.byCategory, it.category || "other"]]) {
        const g = map[key] || (map[key] = { key, count: 0, revenue: 0, fees: 0, profit: 0 });
        g.count += 1; g.revenue += gross - fees; g.fees += fees; g.profit += profit;
      }
    } else {
      s.stockCount += 1;
      s.capital += amountForDisplay(it.buyPrice, it.currency);
      if (it.status === "listed") { s.listedCount += 1; s.listedValue += amountForDisplay(it.listPrice, it.currency); }
    }
  }

  for (const tx of moduleTxs) {
    if (tx.resaleItemId != null || !inPeriod(tx.date)) continue;
    s.looseCount += 1; s.looseNet += txAmountForDisplay(tx);
  }

  const finish = (map) => Object.values(map).sort((a, b) => b.revenue - a.revenue);
  return {
    ...s,
    margin: s.gross > 0 ? s.profit / s.gross : null,
    avgDays: s.daysCount > 0 ? Math.round(s.daysSum / s.daysCount) : null,
    byPlatform: finish(s.byPlatform),
    byCategory: finish(s.byCategory),
  };
}

function sanitizeItems(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(it => it && it.id != null && typeof it.name === "string");
}

export {
  PLATFORMS, ITEM_CATEGORIES, marketPlatforms,
  platformName, itemCategory, feeRule, rememberFeeRule, calcFee,
  saleNet, itemProfit, daysBetween, buildItemTxs, resellingStats, sanitizeItems,
};

// Inwestycje: pozycje różnych rodzajów — ETF-y, akcje, krypto, złoto, obligacje, lokaty,
// konta emerytalne, P2P, nieruchomości. Dane w synchronizowanej tablicy `portfolio` (ta sama
// co wcześniej); stare pozycje (ticker, ilość, cena) działają bez zmian — brak `kind`
// = akcje/ETF w trybie „sztuki”.
//
// Dwa tryby pozycji:
//   units — ilość × cena (ETF, akcje, krypto, złoto); koszt = ilość × średnia cena zakupu,
//   value — wpłacono / wartość teraz (lokata, obligacje, PPK/IKE, P2P, mieszkanie…);
//           z oprocentowaniem wartość rośnie sama (szacunek, odsetki proste od ostatniej wyceny).
//
// Ceny na żywo bez klucza: krypto i złoto z CoinGecko (złoto = PAX Gold, 1 uncja) — wszędzie;
// ETF-y i akcje z Yahoo Finance (pozycja z wybranym notowaniem h.quote) — Yahoo nie wpuszcza
// przeglądarki, więc tylko w aplikacji albo przez serwer pośredniczący (lib/net.js). Inaczej ręcznie.

import { PieChart, CandlestickChart, Bitcoin, Coins, Landmark, PiggyBank, Umbrella, Handshake, Building2, Briefcase } from "lucide-react";
import { amountForDisplay, convert, getRate } from "./fx.js";
import { canReachRestricted, getRestricted } from "./net.js";

const KINDS = {
  etf:        { mode: "units", color: "#8b5cf6", icon: PieChart },
  stock:      { mode: "units", color: "#3b82f6", icon: CandlestickChart },
  crypto:     { mode: "units", color: "#f59e0b", icon: Bitcoin },
  gold:       { mode: "units", color: "#eab308", icon: Coins },
  bond:       { mode: "value", color: "#06b6d4", icon: Landmark, rate: true },
  savings:    { mode: "value", color: "#10b981", icon: PiggyBank, rate: true },
  retirement: { mode: "value", color: "#ec4899", icon: Umbrella },
  p2p:        { mode: "value", color: "#f97316", icon: Handshake, rate: true },
  realestate: { mode: "value", color: "#a3e635", icon: Building2 },
  other:      { mode: "value", color: "#64748b", icon: Briefcase },
};
const KIND_ORDER = ["etf", "stock", "crypto", "gold", "bond", "savings", "retirement", "p2p", "realestate", "other"];

// Podpowiedzi platform (pole jest dowolnym tekstem)
const PLATFORMS = {
  etf: ["XTB", "Trading 212", "Interactive Brokers", "Revolut", "eToro", "Scalable Capital", "Trade Republic", "DEGIRO", "Vanguard", "Fidelity"],
  stock: ["XTB", "Trading 212", "Interactive Brokers", "Revolut", "eToro", "mBank eMakler", "Trade Republic", "DEGIRO", "Robinhood", "Schwab"],
  crypto: ["Binance", "Coinbase", "Kraken", "Revolut", "Bybit", "zondacrypto", "Bitpanda", "Ledger", "Trezor"],
  gold: ["Mennica Polska", "Tavex", "Goldsavings", "Revolut", "BullionVault", "Degussa"],
  bond: ["Obligacje skarbowe", "TreasuryDirect", "NS&I", "Bundesschatzbriefe", "XTB", "Interactive Brokers"],
  savings: ["Revolut", "Trade Republic", "Wise", "mBank", "PKO BP", "ING", "Santander", "Marcus", "Raisin"],
  retirement: ["PPK", "IKE", "IKZE", "PPE", "ISA", "SIPP", "401(k)", "IRA", "Riester", "PEA", "Pillar 3a"],
  p2p: ["Mintos", "Bondora", "PeerBerry", "Esketit", "Robocash", "Twino"],
  realestate: ["", "Estateguru", "Reinvest24", "Bulkestate"],
  other: [],
};

// Waluty, w których CoinGecko podaje ceny (RON — przez USD)
const CG_CURRENCIES = new Set(["pln", "eur", "usd", "gbp", "chf", "czk", "huf", "sek", "nok", "dkk", "jpy", "cad", "aud", "brl", "mxn", "uah", "try"]);
const GOLD_ID = "pax-gold";
const OZ_G = 31.1034768;

const kindOf = (h) => (h && KINDS[h.kind] ? h.kind : "stock");
const modeOf = (h) => (h && (h.mode === "units" || h.mode === "value") ? h.mode : KINDS[kindOf(h)].mode);
const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

function daysBetween(a, b) {
  const d = (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000;
  return isFinite(d) ? Math.max(0, Math.round(d)) : 0;
}

/** Wartość pozycji w trybie „wartość”: ostatnia wycena + odsetki proste od jej daty (szacunek). */
function valueNow(h, today) {
  const base = num(h.value) ?? num(h.invested) ?? 0;
  const rate = num(h.rate);
  const from = h.priceAt || h.startDate;
  if (!rate || rate <= 0 || !from || !today) return { value: base, estimated: false };
  const days = daysBetween(from, today);
  if (!days) return { value: base, estimated: false };
  return { value: Math.round(base * (1 + rate / 100 * days / 365) * 100) / 100, estimated: true };
}

/**
 * Wynik pozycji. Kwoty w walucie pozycji (value, cost, gain) i w PLN-ekwiwalencie
 * do fmtDisplay (valueDisp, costDisp, gainDisp). stale = ręczna cena starsza niż 30 dni.
 */
function holdingStats(h, today) {
  const cur = h.currency || "PLN";
  const mode = modeOf(h);
  let value, cost, estimated = false;
  if (mode === "units") {
    const qty = num(h.qty) ?? 0;
    const price = num(h.currentPrice);
    cost = qty * (num(h.avgPrice) ?? 0);
    if (price == null) {
      // Stare pozycje bez ceny: zapisana wycena w PLN
      const v = num(h.valuePLN) ?? 0, p = num(h.pnlPLN) ?? 0;
      return { value: v, cost: v - p, gain: p, gainPct: v - p > 0 ? p / (v - p) * 100 : null, valueDisp: v, costDisp: v - p, gainDisp: p, estimated: false, stale: true, currency: "PLN" };
    }
    value = qty * price;
  } else {
    cost = num(h.invested) ?? 0;
    const v = valueNow(h, today);
    value = v.value; estimated = v.estimated;
  }
  const gain = value - cost;
  const live = h.priceSource === "coingecko" || h.priceSource === "yahoo" || estimated;
  const stale = !h.closed && !live && (!h.priceAt || (today && daysBetween(h.priceAt, today) > 30));
  return {
    value, cost, gain, gainPct: cost > 0 ? gain / cost * 100 : null,
    valueDisp: amountForDisplay(value, cur), costDisp: amountForDisplay(cost, cur), gainDisp: amountForDisplay(gain, cur),
    estimated, stale, currency: cur,
  };
}

/** Suma portfela (otwarte pozycje) i podział na rodzaje, w PLN-ekwiwalencie. */
function portfolioTotals(list, today) {
  const out = { value: 0, cost: 0, gain: 0, count: 0, stale: 0, byKind: {} };
  for (const h of list) {
    if (h.closed) continue;
    const s = holdingStats(h, today);
    out.value += s.valueDisp; out.cost += s.costDisp; out.gain += s.gainDisp; out.count += 1;
    if (s.stale) out.stale += 1;
    const k = kindOf(h);
    out.byKind[k] = (out.byKind[k] || 0) + s.valueDisp;
  }
  out.gainPct = out.cost > 0 ? out.gain / out.cost * 100 : null;
  return out;
}

/** Dokupienie / dopłata: ilość i łączna kwota (z prowizją) albo sama kwota w trybie „wartość”. */
function applyBuy(h, { qty, total, date }) {
  if (modeOf(h) === "units") {
    const q0 = num(h.qty) ?? 0, a0 = num(h.avgPrice) ?? 0;
    const q = q0 + qty;
    return { ...h, qty: round8(q), avgPrice: q > 0 ? round8((q0 * a0 + total) / q) : a0, closed: false };
  }
  const v = valueNow(h, date).value;
  return { ...h, invested: round2((num(h.invested) ?? 0) + total), value: round2(v + total), priceAt: date, closed: false };
}

/**
 * Sprzedaż / wypłata. Zwraca nową pozycję i zrealizowany wynik (w walucie pozycji):
 * units — przychód − średnia cena × sprzedana ilość; value — wypłata − proporcjonalna część wpłat.
 */
function applySell(h, { qty, total, date }) {
  if (modeOf(h) === "units") {
    const q0 = num(h.qty) ?? 0, a0 = num(h.avgPrice) ?? 0;
    const sold = Math.min(qty, q0);
    const realized = round2(total - a0 * sold);
    const q = round8(q0 - sold);
    return { holding: { ...h, qty: q, closed: q <= 0, realized: round2((num(h.realized) ?? 0) + realized) }, realized };
  }
  const v = valueNow(h, date).value;
  const inv = num(h.invested) ?? 0;
  const amount = Math.min(total, v);
  const costPart = v > 0 ? Math.min(inv, inv * amount / v) : inv;
  const realized = round2(amount - costPart);
  const left = round2(v - amount);
  return {
    holding: { ...h, invested: round2(inv - costPart), value: left, priceAt: date, closed: left <= 0, realized: round2((num(h.realized) ?? 0) + realized) },
    realized,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const round8 = (n) => Math.round(n * 1e8) / 1e8;

/**
 * Pozycja z tego, co pokazuje aplikacja brokera/banku — bez liczenia na kartce.
 * Sztuki: ilość + koszt jednym ze sposobów: avg (średnia cena) | total (zapłacono łącznie) |
 *   pl (zysk kwotą albo w %) | now (nie wiem — wynik od dziś); cena teraz za 1 szt. albo wartość łącznie
 *   (albo cena na żywo). Wartość: wartość teraz + wpłacono | zysk kwotą/% | nie wiem.
 * Zwraca { qty, avgPrice, price } albo { invested, value }; przy błędzie { err: "qty"|"avg"|"total"|"pl"|"price"|"value"|"invested" }.
 */
function fromBroker(f) {
  const n = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : null; };
  const plOf = (value) => {
    const pl = n(f.pl);
    if (pl == null) return null;
    if (f.plPct) return pl <= -100 ? null : value / (1 + pl / 100);
    return value - pl;
  };
  if (f.mode === "units") {
    const qty = n(f.qty);
    if (!(qty > 0)) return { err: "qty" };
    let price = f.livePrice != null ? f.livePrice : f.priceMode === "value" ? (n(f.valueNow) != null ? n(f.valueNow) / qty : null) : n(f.price);
    if (price != null && !(price >= 0)) price = null;
    let avg;
    if (f.costMode === "avg") { avg = n(f.avg); if (avg == null || avg < 0) return { err: "avg" }; }
    else if (f.costMode === "total") { const tot = n(f.total); if (tot == null || tot < 0) return { err: "total" }; avg = tot / qty; }
    else if (f.costMode === "pl") {
      if (price == null) return { err: "price" };
      const cost = plOf(qty * price);
      if (cost == null || !(cost >= 0)) return { err: "pl" };
      avg = cost / qty;
    } else {
      if (price == null) return { err: "price" };
      avg = price;
    }
    return { qty: round8(qty), avgPrice: Math.round(avg * 1e6) / 1e6, price: price != null ? Math.round(price * 1e6) / 1e6 : null };
  }
  const value = n(f.value);
  if (f.costMode === "invested") {
    const inv = n(f.invested);
    if (!(inv > 0)) return { err: "invested" };
    return { invested: round2(inv), value: value > 0 ? round2(value) : null };
  }
  if (!(value > 0)) return { err: "value" };
  if (f.costMode === "pl") {
    const inv = plOf(value);
    if (inv == null || !(inv >= 0)) return { err: "pl" };
    return { invested: round2(inv), value: round2(value) };
  }
  return { invested: round2(value), value: round2(value) };
}

// ── Ceny na żywo ────────────────────────────────────────────────────

async function cgJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally { clearTimeout(timer); }
}

/** Szukanie kryptowaluty po nazwie lub symbolu (CoinGecko). */
async function searchCoins(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const r = await cgJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
  return (r.coins || []).slice(0, 8).map(c => ({ id: c.id, name: c.name, symbol: String(c.symbol || "").toUpperCase(), thumb: c.thumb }));
}

/** Pozycje z ceną na żywo: krypto z wybraną monetą, złoto, ETF/akcja z notowaniem (gdy da się sięgnąć do Yahoo). */
const isQuoted = (h) => (kindOf(h) === "etf" || kindOf(h) === "stock") && !!(h.quote && h.quote.sym);
const isLive = (h) => !h.closed && modeOf(h) === "units"
  && ((kindOf(h) === "crypto" && !!h.coinId) || kindOf(h) === "gold" || (isQuoted(h) && canReachRestricted));
/** Skąd pochodzi cena na żywo pozycji (do zapisu priceSource). */
const liveSourceOf = (h) => (isQuoted(h) ? "yahoo" : "coingecko");

/** Notowanie z Yahoo Finance: cena i waluta (pensy/centy → funty/randy). null, gdy brak. */
async function yahooQuote(sym) {
  const j = await getRestricted(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
  const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) return null;
  let price = m.regularMarketPrice, cur = String(m.currency || "");
  if (cur === "GBp" || cur === "GBX") { price /= 100; cur = "GBP"; }
  else if (cur === "ZAc") { price /= 100; cur = "ZAR"; }
  else if (cur === "ILA") { price /= 100; cur = "ILS"; }
  return { price, cur: cur.toUpperCase(), name: m.longName || m.shortName || sym, exch: m.exchangeName || "" };
}

/** Wyszukiwanie ETF/akcji po nazwie, tickerze albo ISIN (Yahoo) — z aktualną ceną. */
async function searchQuotes(query) {
  const q = String(query || "").trim();
  if (q.length < 2 || !canReachRestricted) return [];
  const j = await getRestricted(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`);
  const list = ((j && j.quotes) || [])
    .filter(x => x.symbol && ["ETF", "EQUITY", "MUTUALFUND"].includes(x.quoteType))
    .slice(0, 6)
    .map(x => ({ sym: x.symbol, name: x.shortname || x.longname || x.symbol, exch: x.exchDisp || x.exchange || "", type: x.quoteType }));
  const priced = await Promise.all(list.map(async (x) => { try { const qd = await yahooQuote(x.sym); return qd ? { ...x, price: qd.price, cur: qd.cur } : x; } catch { return x; } }));
  return priced;
}

/**
 * Aktualne ceny dla pozycji krypto i złota. Zwraca { [holdingId]: cena za jednostkę w walucie pozycji }.
 * Złoto: cena uncji (PAX Gold) → za gram, gdy pozycja liczona w gramach.
 */
async function fetchLivePrices(holdings) {
  const all = holdings.filter(isLive);
  const out = {};
  // ETF-y i akcje z notowaniem (Yahoo), przeliczone na walutę pozycji
  const quoted = all.filter(isQuoted);
  if (quoted.length) {
    const syms = [...new Set(quoted.map(h => h.quote.sym))];
    const quotes = {};
    await Promise.all(syms.map(async (s) => { try { quotes[s] = await yahooQuote(s); } catch { quotes[s] = null; } }));
    for (const h of quoted) {
      const q = quotes[h.quote.sym];
      if (!q) continue;
      const cur = (h.currency || "PLN").toUpperCase();
      if (q.cur !== cur && ![q.cur, cur].every(c => c === "PLN" || isFinite(getRate(c)))) continue;
      const price = q.cur === cur ? q.price : convert(q.price, q.cur, cur);
      if (isFinite(price) && price > 0) out[h.id] = Math.round(price * 1e6) / 1e6;
    }
  }
  const live = all.filter(h => !isQuoted(h));
  if (!live.length) return out;
  const coinOf = (h) => (kindOf(h) === "gold" ? GOLD_ID : h.coinId);
  const ids = [...new Set(live.map(coinOf))];
  const vs = new Set(["usd"]);
  for (const h of live) { const c = (h.currency || "PLN").toLowerCase(); if (CG_CURRENCIES.has(c)) vs.add(c); }
  const r = await cgJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=${[...vs].join(",")}`);
  for (const h of live) {
    const row = r[coinOf(h)];
    if (!row) continue;
    const c = (h.currency || "PLN").toLowerCase();
    let price = row[c] != null ? row[c] : row.usd != null ? convert(row.usd, "USD", c.toUpperCase()) : null;
    if (price == null || !isFinite(price)) continue;
    if (kindOf(h) === "gold" && h.unit !== "oz") price = price / OZ_G;
    out[h.id] = Math.round(price * 1e6) / 1e6;
  }
  return out;
}

export {
  KINDS, KIND_ORDER, PLATFORMS, kindOf, modeOf, holdingStats, portfolioTotals, valueNow,
  applyBuy, applySell, searchCoins, fetchLivePrices, isLive, fromBroker,
  isQuoted, liveSourceOf, searchQuotes,
};

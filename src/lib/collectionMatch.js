// Dopasowanie starych danych do pozycji katalogu (np. po imporcie z Discogs):
//  • zakupy z Wpisów („Winyl Radiohead OK Computer”, -129 zł) ↔ pozycje bez ceny zakupu,
//  • stare, ręcznie dodane pozycje ↔ te same płyty zaimportowane z Discogs (duplikaty).
// Tylko propozycje — użytkownik zatwierdza każdą, nic nie dzieje się samo.

import { convert } from "./fx.js";

// Słowa, które w opisie zakupu nic nie mówią o tytule
const NOISE = new Set([
  "the", "a", "an", "of", "and", "i", "w", "z", "na", "do", "der", "die", "das", "le", "la", "les", "el", "los", "il", "de", "del",
  "lp", "2lp", "ep", "cd", "winyl", "winyle", "vinyl", "vinyle", "plyta", "plyty", "record", "album", "kaseta",
  "ksiazka", "book", "gra", "game", "edition", "edycja", "deluxe", "remaster", "remastered", "reissue",
]);

function tokens(text) {
  return String(text || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "l")
    .toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/g, " ")
    .split(" ").filter(w => w.length >= 2 && !NOISE.has(w));
}

function share(needles, hay) {
  if (!needles.length) return 0;
  return needles.filter(w => hay.has(w)).length / needles.length;
}

/** Jak bardzo opis (zbiór słów) pasuje do pozycji: 0…1, 0 = wcale. */
function score(item, hay) {
  const title = tokens(item.title);
  const artist = tokens(item.creator);
  if (!title.length) return 0;
  const tf = share(title, hay);
  const af = share(artist, hay);
  const titleChars = title.join("").length;
  // Cały tytuł w opisie (i nie jest to jedno krótkie słowo) albo większość tytułu + wykonawca
  if (tf === 1 && (titleChars >= 5 || af > 0)) return 0.7 + 0.3 * af;
  if (tf >= 0.5 && af === 1 && artist.length) return 0.5 + 0.2 * tf;
  return 0;
}

/** Zachłanne dopasowanie 1:1 po najlepszym wyniku. */
function greedy(pairs) {
  pairs.sort((a, b) => b.score - a.score);
  const usedA = new Set(), usedB = new Set(), out = [];
  for (const p of pairs) {
    if (usedA.has(p.a) || usedB.has(p.b)) continue;
    usedA.add(p.a); usedB.add(p.b);
    out.push(p);
  }
  return out;
}

/** Zakupy z Wpisów (bez pozycji) ↔ pozycje „Mam” bez ceny i bez podpiętego wpisu. */
function matchPurchases(items, txs) {
  const open = items.filter(it => it.status === "owned" && it.buyTxId == null && it.buyPrice == null && it.resaleItemId == null);
  const pairs = [];
  for (const tx of txs) {
    if (!(tx.amount < 0)) continue;
    const hay = new Set(tokens(tx.desc));
    if (!hay.size) continue;
    for (const it of open) {
      const s = score(it, hay);
      if (s > 0) pairs.push({ a: it.id, b: tx.id, score: s, item: it, tx });
    }
  }
  return greedy(pairs);
}

/** Stara pozycja (dodana ręcznie) ↔ ta sama płyta z Discogs (duplikat po imporcie). */
function matchDuplicates(items) {
  const imported = items.filter(it => it.discogs && it.discogs.r && it.buyTxId == null && it.resaleItemId == null);
  const manual = items.filter(it => !it.discogs);
  const pairs = [];
  for (const old of manual) {
    const hay = new Set([...tokens(old.title), ...tokens(old.creator)]);
    for (const imp of imported) {
      if (imp.status !== old.status) continue;
      // Oba kierunki: tytuł z Discogs w starej pozycji i stary tytuł w tej z Discogs
      const s1 = score(imp, hay);
      const s2 = score(old, new Set([...tokens(imp.title), ...tokens(imp.creator)]));
      if (s1 > 0 && s2 > 0) pairs.push({ a: old.id, b: imp.id, score: Math.min(s1, s2), item: old, dup: imp });
    }
  }
  return greedy(pairs);
}

/** Wycena pozycji przeliczona do nowej waluty (np. zmiana EUR → PLN). */
function convertValue(value, from, to) {
  if (value == null || !from || !to || from === to) return value;
  return Math.round(convert(value, from, to) * 100) / 100;
}

/** Pozycja z podpiętym zakupem: cena i waluta z wpisu, wycena przeliczona do tej waluty. */
function linkPurchase(item, tx) {
  const fx = tx.origCurrency && tx.origAmount != null;
  const currency = fx ? tx.origCurrency : "PLN";
  return {
    ...item,
    buyTxId: tx.id, buyTxOwned: false, buyDate: tx.date,
    buyPrice: Math.abs(fx ? tx.origAmount : tx.amount),
    currency,
    value: convertValue(item.value, item.currency || "PLN", currency),
    ...(item.value != null && item.valueCur ? { valueCur: currency } : {}),
  };
}

/** Stara pozycja przejmuje dane z Discogs (id, format, rok, wycena); duplikat znika. */
function mergeDuplicate(old, dup) {
  const cur = old.currency || "PLN";
  const takeValue = old.value == null && dup.value != null;
  return {
    ...old,
    discogs: dup.discogs,
    format: old.format || dup.format || "",
    year: old.year || dup.year || null,
    creator: old.creator || dup.creator || "",
    ...(takeValue ? {
      value: convertValue(dup.value, dup.currency || "EUR", cur),
      valueAt: dup.valueAt || null, valueSource: dup.valueSource || "discogs", valueCur: cur,
    } : {}),
  };
}

export { matchPurchases, matchDuplicates, linkPurchase, mergeDuplicate, convertValue, tokens };

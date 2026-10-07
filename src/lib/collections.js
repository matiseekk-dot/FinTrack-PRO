// Moduł Kolekcje: katalog pozycji w kolekcjach.
//
// Kolekcja = istniejące hobby (półka: „Winyle”, „Książki”…), więc nic z dotychczasowych
// danych nie znika. Pozycje katalogu żyją w kolekcji `collectionItems`:
//   status "owned" | "wishlist"; sprzedaż odbywa się w module Sprzedaż — pozycja
//   dostaje resaleItemId, a jej stan (na sprzedaż / sprzedana) wynika z tamtego przedmiotu.
// Zakup może: utworzyć nowy wpis (buyTxOwned), wskazać istniejący wpis z Wpisów
// (tylko link po stronie pozycji — wpis zostaje nietknięty) albo nie mieć wpisu.

import { Disc3, BookOpen, Gamepad2, Gem } from "lucide-react";
import { newId, makeTx } from "./ledger.js";
import { amountForDisplay, convert } from "./fx.js";
import { itemProfit } from "./reselling.js";
import { CATEGORIES } from "../constants.js";

const KINDS = {
  vinyl: {
    icon: Disc3, resaleCategory: "vinyl",
    formats: {
      en: ["LP","2LP","7\"","12\"","CD","Cassette","Box set"],
      pl: ["LP","2LP","7\"","12\"","CD","Kaseta","Box"],
      de: ["LP","2LP","7\"","12\"","CD","Kassette","Box-Set"],
      es: ["LP","2LP","7\"","12\"","CD","Casete","Caja"],
      fr: ["LP","2LP","7\"","12\"","CD","Cassette","Coffret"],
      pt: ["LP","2LP","7\"","12\"","CD","Fita cassete","Box"],
      it: ["LP","2LP","7\"","12\"","CD","Cassetta","Cofanetto"],
      nl: ["LP","2LP","7\"","12\"","CD","Cassette","Box"],
      uk: ["LP","2LP","7\"","12\"","CD","Касета","Бокс-сет"],
    },
  },
  books: {
    icon: BookOpen, resaleCategory: "books",
    formats: {
      en: ["Hardcover","Paperback","Comic","E-book","Audiobook"],
      pl: ["Twarda","Miękka","Komiks","E-book","Audiobook"],
      de: ["Hardcover","Taschenbuch","Comic","E-Book","Hörbuch"],
      es: ["Tapa dura","Tapa blanda","Cómic","E-book","Audiolibro"],
      fr: ["Relié","Broché","BD","E-book","Livre audio"],
      pt: ["Capa dura","Brochura","HQ","E-book","Audiolivro"],
      it: ["Copertina rigida","Brossura","Fumetto","E-book","Audiolibro"],
      nl: ["Gebonden","Paperback","Strip","E-book","Luisterboek"],
      uk: ["Тверда обкладинка","М'яка обкладинка","Комікс","Електронна","Аудіокнига"],
    },
  },
  games: {
    icon: Gamepad2, resaleCategory: "games",
    formats: {
      en: ["PS5","PS4","Xbox","Switch","PC","Retro","Board game"],
      pl: ["PS5","PS4","Xbox","Switch","PC","Retro","Planszówka"],
      de: ["PS5","PS4","Xbox","Switch","PC","Retro","Brettspiel"],
      es: ["PS5","PS4","Xbox","Switch","PC","Retro","Juego de mesa"],
      fr: ["PS5","PS4","Xbox","Switch","PC","Rétro","Jeu de société"],
      pt: ["PS5","PS4","Xbox","Switch","PC","Retrô","Jogo de tabuleiro"],
      it: ["PS5","PS4","Xbox","Switch","PC","Retro","Gioco da tavolo"],
      nl: ["PS5","PS4","Xbox","Switch","PC","Retro","Bordspel"],
      uk: ["PS5","PS4","Xbox","Switch","PC","Ретро","Настільна гра"],
    },
  },
  other: { icon: Gem, resaleCategory: "collectibles", formats: { en: [], pl: [] } },
};

const CONDITIONS = [
  { id: "new",  label: { en: "New / sealed", pl: "Nowy / w folii", de: "Neu / OVP", es: "Nuevo / precintado", fr: "Neuf / sous blister", pt: "Novo / lacrado", it: "Nuovo / sigillato", nl: "Nieuw / geseald", uk: "Новий / запакований" } },
  { id: "mint", label: { en: "Like new", pl: "Jak nowy", de: "Wie neu", es: "Como nuevo", fr: "Comme neuf", pt: "Como novo", it: "Come nuovo", nl: "Zo goed als nieuw", uk: "Як новий" } },
  { id: "good", label: { en: "Good", pl: "Dobry", de: "Gut", es: "Bueno", fr: "Bon état", pt: "Bom", it: "Buono", nl: "Goed", uk: "Добрий" } },
  { id: "fair", label: { en: "Fair", pl: "Używany", de: "Gebraucht", es: "Usado", fr: "Usagé", pt: "Usado", it: "Usato", nl: "Gebruikt", uk: "Вживаний" } },
];

/** Rodzaj kolekcji po nazwie i słowach kluczowych hobby (bez zmian w schemacie hobby). */
function collectionKind(hobby) {
  const text = `${hobby?.name || ""} ${(hobby?.keywords || []).join(" ")}`.toLowerCase();
  if (/winyl|vinyl|vinil|vinyle|platte|płyt|plyt|\blp\b|record|disque|disco|muzyk|music|musik|músic|musique|musica|muziek|вініл|платів|музик/.test(text)) return "vinyl";
  if (/książ|ksiaz|book|buch|bücher|libro|livre|livro|boek|komiks|comic|cómic|manga|\bbd\b|fumett|strip|книг|комікс/.test(text)) return "books";
  if (/\bgry\b|\bgra\b|game|spiel|juego|\bjeux?\b|jogo|gioch|videogio|ps5|ps4|xbox|switch|nintendo|konsol|consol|ігр|гри/.test(text)) return "games";
  return "other";
}

function conditionLabel(id, lang) {
  const c = CONDITIONS.find(x => x.id === id);
  return c ? (c.label[lang] || c.label.en) : "";
}

function itemTitle(item) {
  return item.creator ? `${item.title} – ${item.creator}` : item.title;
}

/** Stan pozycji: owned | wishlist | selling | sold (+ powiązany przedmiot ze Sprzedaży). */
function itemState(item, resaleById) {
  if (item.status === "wishlist") return { state: "wishlist", resale: null };
  if (item.resaleItemId != null) {
    const r = resaleById.get(item.resaleItemId);
    if (r) return { state: r.status === "sold" ? "sold" : "selling", resale: r };
  }
  return { state: "owned", resale: null };
}

const INCOME_CATS = new Set(CATEGORIES.filter(c => c.group === "income").map(c => c.id));

/** Wpis zakupu tworzony z katalogu — z jawnym hobbyId, żeby liczył się do tej kolekcji. */
function buildPurchaseTx(item, hobby, rate) {
  const cat = (hobby?.categories || []).find(c => !INCOME_CATS.has(c) && c !== "inne") || "rozrywka";
  return makeTx({
    id: item.buyTxId ?? undefined, date: item.buyDate, desc: itemTitle(item),
    amount: -Number(item.buyPrice), currency: item.currency, rate,
    cat, acc: item.acc, module: "collections",
    collectionItemId: item.id, hobbyId: hobby?.id ?? item.hobbyId,
  });
}

/** Przedmiot do modułu Sprzedaż z kosztem zakupu z katalogu (bez drugiego wpisu wydatku). */
function toResaleItem(item, hobby, today) {
  return {
    id: newId(), name: itemTitle(item),
    category: KINDS[collectionKind(hobby)].resaleCategory,
    status: "stock", currency: item.currency || "PLN", acc: item.acc,
    buyPrice: item.buyPrice ?? null, buyDate: item.buyDate || today, recordPurchase: false,
    platform: null, listPrice: item.value ?? null,
    sellPrice: null, sellDate: null, feePct: null, feeFixed: null, fees: null, shipping: null,
    buyTxId: null, sellTxId: null, sellFxRate: null,
    createdAt: today, fromCollectionItemId: item.id,
  };
}

/**
 * Statystyki per kolekcja (hobbyId) i łącznie. Kwoty w PLN-ekwiwalencie dla fmtDisplay.
 * Wartość = szacowana wartość, a bez niej koszt zakupu (liczymy „bez wyceny” osobno).
 * Zmiana (paidValue − paidCost) tylko z pozycji, które mają i cenę zakupu, i wycenę —
 * płyta z wyceną, ale bez ceny zakupu, nie jest „zyskiem”.
 */
function collectionStats(items, resaleItems) {
  const resaleById = new Map(resaleItems.map(r => [r.id, r]));
  const blank = () => ({ owned: 0, wishlist: 0, selling: 0, sold: 0, cost: 0, value: 0, unvalued: 0, realized: 0, wishlistCost: 0, paired: 0, paidCost: 0, paidValue: 0 });
  const by = {};
  const total = blank();
  for (const it of items) {
    const g = by[it.hobbyId] || (by[it.hobbyId] = blank());
    const { state, resale } = itemState(it, resaleById);
    for (const s of [g, total]) {
      if (state === "wishlist") {
        s.wishlist += 1;
        s.wishlistCost += amountForDisplay(it.targetPrice, it.currency);
      } else if (state === "sold") {
        s.sold += 1;
        s.realized += amountForDisplay(itemProfit(resale), resale.currency, resale.sellFxRate);
      } else {
        if (state === "owned") s.owned += 1; else s.selling += 1;
        const cost = amountForDisplay(it.buyPrice, it.currency);
        s.cost += cost;
        s.value += it.value != null ? amountForDisplay(it.value, it.currency) : cost;
        if (it.value == null) s.unvalued += 1;
        if (it.value != null && it.buyPrice != null) {
          s.paired += 1; s.paidCost += cost; s.paidValue += amountForDisplay(it.value, it.currency);
        }
      }
    }
  }
  return { by, total, resaleById };
}

/** Zysk „na papierze” pozycji: wycena − cena zakupu (w walucie pozycji) albo null. */
function itemGain(it) {
  if (it.value == null || it.buyPrice == null) return null;
  return Math.round((Number(it.value) - Number(it.buyPrice)) * 100) / 100;
}

/**
 * Mediana Twoich cen sprzedaży rzeczy tego rodzaju (z tej kolekcji albo tej kategorii w Sprzedaży),
 * w podanej walucie — podpowiedź wyceny, gdy nie ma ceny rynkowej (książki, gry). null, gdy < 3 sprzedaży.
 */
function salesMedian(hobby, items, resaleItems, currency) {
  if (!hobby) return null;
  const fromHere = new Set(items.filter(it => it.hobbyId === hobby.id).map(it => it.id));
  const cat = KINDS[collectionKind(hobby)].resaleCategory;
  const prices = resaleItems
    .filter(r => r.status === "sold" && Number(r.sellPrice) > 0 && (fromHere.has(r.fromCollectionItemId) || r.category === cat))
    .map(r => convert(Number(r.sellPrice), r.currency || "PLN", currency))
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return { median: Math.round(median * 100) / 100, n: prices.length };
}

function sanitizeCollectionItems(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(it => it && it.id != null && it.hobbyId != null && typeof it.title === "string");
}

export {
  KINDS, CONDITIONS,
  collectionKind, conditionLabel, itemTitle, itemState,
  buildPurchaseTx, toResaleItem, collectionStats, itemGain, salesMedian, sanitizeCollectionItems,
};

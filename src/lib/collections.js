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
import { amountForDisplay } from "./fx.js";
import { itemProfit } from "./reselling.js";
import { CATEGORIES } from "../constants.js";

const KINDS = {
  vinyl: {
    icon: Disc3, resaleCategory: "vinyl",
    formats: { en: ["LP", "2LP", "7\"", "12\"", "CD", "Cassette", "Box set"], pl: ["LP", "2LP", "7\"", "12\"", "CD", "Kaseta", "Box"] },
  },
  books: {
    icon: BookOpen, resaleCategory: "books",
    formats: { en: ["Hardcover", "Paperback", "Comic", "E-book", "Audiobook"], pl: ["Twarda", "Miękka", "Komiks", "E-book", "Audiobook"] },
  },
  games: {
    icon: Gamepad2, resaleCategory: "games",
    formats: { en: ["PS5", "PS4", "Xbox", "Switch", "PC", "Retro", "Board game"], pl: ["PS5", "PS4", "Xbox", "Switch", "PC", "Retro", "Planszówka"] },
  },
  other: { icon: Gem, resaleCategory: "collectibles", formats: { en: [], pl: [] } },
};

const CONDITIONS = [
  { id: "new",  label: { en: "New / sealed", pl: "Nowy / w folii" } },
  { id: "mint", label: { en: "Like new",     pl: "Jak nowy" } },
  { id: "good", label: { en: "Good",         pl: "Dobry" } },
  { id: "fair", label: { en: "Fair",         pl: "Używany" } },
];

/** Rodzaj kolekcji po nazwie i słowach kluczowych hobby (bez zmian w schemacie hobby). */
function collectionKind(hobby) {
  const text = `${hobby?.name || ""} ${(hobby?.keywords || []).join(" ")}`.toLowerCase();
  if (/winyl|vinyl|płyt|plyt|\blp\b|record|muzyk|music/.test(text)) return "vinyl";
  if (/książ|ksiaz|book|komiks|comic|manga/.test(text)) return "books";
  if (/\bgry\b|\bgra\b|game|ps5|ps4|xbox|switch|nintendo|konsol/.test(text)) return "games";
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
 */
function collectionStats(items, resaleItems) {
  const resaleById = new Map(resaleItems.map(r => [r.id, r]));
  const blank = () => ({ owned: 0, wishlist: 0, selling: 0, sold: 0, cost: 0, value: 0, unvalued: 0, realized: 0, wishlistCost: 0 });
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
      }
    }
  }
  return { by, total, resaleById };
}

function sanitizeCollectionItems(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(it => it && it.id != null && it.hobbyId != null && typeof it.title === "string");
}

export {
  KINDS, CONDITIONS,
  collectionKind, conditionLabel, itemTitle, itemState,
  buildPurchaseTx, toResaleItem, collectionStats, sanitizeCollectionItems,
};

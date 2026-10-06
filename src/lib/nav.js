// Bottom bar: Home + up to NAV_SLOTS user-chosen shortcuts + More.
// The choice is a per-device preference (like the PIN), so it lives in
// localStorage and is not synced.

import { Home, List, Menu } from "lucide-react";
import { MODULES, moduleLabel } from "./modules.js";
import { t, getLang } from "../i18n.js";

const NAV_KEY = "ft_nav_tabs";
const NAV_SLOTS = 3;

// Module screens in the order they are offered as default shortcuts.
const NAV_MODULE_SCREENS = ["reselling", "betting", "freelance", "collections", "hobby", "trips"];

/** Destinations that may be pinned to the bar for the given enabled modules. */
function navCandidates(modules = []) {
  return [...NAV_MODULE_SCREENS.filter(id => modules.includes(id)), "transactions",
    ...(modules.includes("investments") ? ["portfolio"] : [])];
}

/** Two busiest-looking module screens first, then the ledger, then accounts. */
function defaultNavTabs(modules = []) {
  const screens = NAV_MODULE_SCREENS.filter(id => modules.includes(id)).slice(0, 2);
  return [...screens, "transactions", ...(modules.includes("investments") ? ["portfolio"] : [])].slice(0, NAV_SLOTS);
}

function readStored() {
  try {
    const v = JSON.parse(localStorage.getItem(NAV_KEY));
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : null;
  } catch { return null; }
}

/**
 * Shortcuts to show. A pinned module that was since switched off drops out
 * and its slot is refilled from the defaults, so the bar never shrinks
 * just because a module was disabled.
 */
function getNavTabs(modules = []) {
  const stored = readStored();
  if (!stored) return defaultNavTabs(modules);
  const valid = new Set(navCandidates(modules));
  const kept = [...new Set(stored)].filter(id => valid.has(id)).slice(0, NAV_SLOTS);
  const want = Math.min(stored.length, NAV_SLOTS);
  for (const id of defaultNavTabs(modules)) {
    if (kept.length >= want) break;
    if (!kept.includes(id)) kept.push(id);
  }
  return kept;
}

function setNavTabs(ids) {
  try {
    if (ids == null) localStorage.removeItem(NAV_KEY);
    else localStorage.setItem(NAV_KEY, JSON.stringify(ids.slice(0, NAV_SLOTS)));
  } catch { /* prywatny tryb — zostaje domyślny pasek */ }
}

// Krótsze nazwy modułów na pasek — pełne nazwy (np. "Weddenschappen") się nie mieszczą.
const SHORT_LABELS = {
  betting:     { en: "Bets", pl: "Zakłady", de: "Wetten", es: "Apuestas", fr: "Paris", pt: "Apostas", it: "Scommesse", nl: "Wedden", uk: "Ставки" },
  reselling:   { en: "Reselling", pl: "Sprzedaż", de: "Verkauf", es: "Reventa", fr: "Revente", pt: "Revenda", it: "Rivendita", nl: "Verkoop", uk: "Продаж" },
  hobby:       { en: "Hobbies", pl: "Hobby", de: "Hobbys", es: "Hobbies", fr: "Loisirs", pt: "Hobbies", it: "Hobby", nl: "Hobby's", uk: "Хобі" },
  collections: { en: "Collection", pl: "Kolekcje", de: "Sammlung", es: "Colección", fr: "Collection", pt: "Coleções", it: "Collezione", nl: "Collectie", uk: "Колекції" },
};

/** Label, icon and accent colour of a bar destination. */
function navItem(id, lang = getLang()) {
  if (id === "home") return { id, label: t("nav.home", "Start"), Icon: Home, color: "#34d399" };
  if (id === "more") return { id, label: t("nav.more", "Więcej"), Icon: Menu, color: "#64748b" };
  if (id === "transactions") return { id, label: t("nav.ledger", "Wpisy"), Icon: List, color: "#94a3b8" };
  // "portfolio" = ekran Inwestycji (id zostaje, bo jest zapisany w ft_nav_tabs)
  if (id === "portfolio") return { id, label: moduleLabel("investments", lang), Icon: MODULES.investments.icon, color: MODULES.investments.color };
  const m = MODULES[id];
  const short = SHORT_LABELS[id];
  return { id, label: (short && (short[lang] || short.en)) || moduleLabel(id, lang), Icon: m.icon, color: m.color };
}

export { NAV_SLOTS, navCandidates, defaultNavTabs, getNavTabs, setNavTabs, navItem };

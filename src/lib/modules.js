// Sidegig modules — the areas of side income a user tracks.
//
// Every transaction belongs to exactly one module. New entries store `tx.module`
// explicitly; legacy FinTrack entries have no such field and get their module
// inferred at read time (see getModule). Nothing in stored data is rewritten,
// so the pivot cannot lose or corrupt existing records.

import { Briefcase, ShoppingBag, Disc3, Target, TrendingUp, Home as HomeIcon, Plane, Wallet } from "lucide-react";
import { txMatchesHobby } from "./hobby.js";

const MODULES = {
  freelance:   { id: "freelance",   icon: Briefcase,   color: "#06b6d4", side: true,  label: { en: "Freelance",   pl: "Freelance" },     desc: { en: "Client invoices, gigs, courses sold",            pl: "Faktury, zlecenia, sprzedane kursy" } },
  reselling:   { id: "reselling",   icon: ShoppingBag, color: "#ec4899", side: true,  label: { en: "Reselling",   pl: "Odsprzedaż" },    desc: { en: "Vinted, eBay, Allegro, OLX — fees included",      pl: "Vinted, eBay, Allegro, OLX — z prowizjami" } },
  collections: { id: "collections", icon: Disc3,       color: "#34d399", side: true,  label: { en: "Collections", pl: "Kolekcje" },      desc: { en: "Vinyl, books, games — buys, sales, value",         pl: "Winyle, książki, gry — zakupy, sprzedaż, wartość" } },
  betting:     { id: "betting",     icon: Target,      color: "#a78bfa", side: true,  adult: true, label: { en: "Betting", pl: "Zakłady" },   desc: { en: "Bankroll, ROI and results. Tracking only.",        pl: "Bankroll, ROI i wyniki. Tylko śledzenie." } },
  investments: { id: "investments", icon: TrendingUp,  color: "#8b5cf6", side: true,  label: { en: "Investments", pl: "Inwestycje" },    desc: { en: "Crypto, stocks, funds outside your main broker",   pl: "Krypto, akcje, fundusze poza głównym brokerem" } },
  rental:      { id: "rental",      icon: HomeIcon,    color: "#f59e0b", side: true,  label: { en: "Rental",      pl: "Najem" },         desc: { en: "Apartment, parking, storage, gear rental",          pl: "Mieszkanie, parking, garaż, wynajem sprzętu" } },
  trips:       { id: "trips",       icon: Plane,       color: "#3b82f6", side: false, label: { en: "Trips",       pl: "Wyjazdy" },       desc: { en: "Trip budgets in any currency",                      pl: "Budżety wyjazdów w dowolnej walucie" } },
  personal:    { id: "personal",    icon: Wallet,      color: "#64748b", side: false, label: { en: "Personal budget", pl: "Budżet osobisty" }, desc: { en: "Everyday spending, bills, limits (classic mode)", pl: "Codzienne wydatki, rachunki, limity (tryb klasyczny)" } },
};

const MODULE_ORDER = ["freelance", "reselling", "collections", "betting", "investments", "rental", "trips", "personal"];
const SIDE_MODULES = MODULE_ORDER.filter(id => MODULES[id].side);
// New users start with these. Betting is opt-in on purpose (store policy + not everyone bets).
const DEFAULT_MODULES = ["freelance", "reselling", "collections", "trips"];

// Legacy FinTrack categories that map to a side module.
const CAT_TO_MODULE = {
  "bukmacher":   "betting",     // stakes (expense)
  "bukmacherka": "betting",     // winnings (income)
  "sprzedaż":    "reselling",   // Vinted/Allegro sales
  "dodatkowe":   "freelance",   // side apps / freelance income
  "inwestycje":  "investments",
};

function moduleLabel(id, lang = "en") {
  const m = MODULES[id];
  if (!m) return id;
  return m.label[lang] || m.label.en;
}

function moduleDesc(id, lang = "en") {
  const m = MODULES[id];
  if (!m) return "";
  return m.desc[lang] || m.desc.en;
}

/**
 * Module of a transaction. Explicit tx.module wins; otherwise inferred from the
 * legacy shape: trip tag → trips, known category → side module, hobby match →
 * collections, anything else → personal.
 */
// Wpłaty i wypłaty z kategorii Inwestycje to przeniesienie pieniędzy do/z aktywów,
// a nie zysk ani strata — nie liczą się do dochodu pobocznego ani do wydatków.
function isCapitalFlow(tx) {
  return !!tx && tx.cat === "inwestycje";
}

function getModule(tx, hobbies = []) {
  if (!tx) return "personal";
  if (tx.module && MODULES[tx.module]) return tx.module;
  if (tx.tripId != null) return "trips";
  if (CAT_TO_MODULE[tx.cat]) return CAT_TO_MODULE[tx.cat];
  if (Array.isArray(hobbies) && hobbies.some(h => !h.archived && txMatchesHobby(tx, h))) return "collections";
  return "personal";
}

/**
 * Which modules to pre-tick for an existing user, based on what their data already contains.
 * A brand-new user (no data) gets DEFAULT_MODULES.
 */
function inferEnabledModules({ transactions = [], hobbies = [], trips = [], portfolio = [], payments = [] } = {}) {
  const hasData = transactions.length > 0 || hobbies.length > 0 || trips.length > 0;
  if (!hasData) return [...DEFAULT_MODULES];

  const found = new Set();
  if (hobbies.length > 0) found.add("collections");
  if (trips.length > 0) found.add("trips");
  if (portfolio.length > 0) found.add("investments");
  if (payments.length > 0) found.add("personal");
  for (const tx of transactions) {
    found.add(getModule(tx, hobbies));
  }
  return MODULE_ORDER.filter(id => found.has(id));
}

function sanitizeModules(value) {
  if (!Array.isArray(value)) return null;
  const clean = MODULE_ORDER.filter(id => value.includes(id));
  return clean.length > 0 ? clean : null;
}

export {
  MODULES, MODULE_ORDER, SIDE_MODULES, DEFAULT_MODULES,
  moduleLabel, moduleDesc, getModule, isCapitalFlow, inferEnabledModules, sanitizeModules,
};

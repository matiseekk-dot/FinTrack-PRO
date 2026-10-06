// Sidegig modules — the areas of side income a user tracks.
//
// Every transaction belongs to exactly one module. New entries store `tx.module`
// explicitly; legacy FinTrack entries have no such field and get their module
// inferred at read time (see getModule). Nothing in stored data is rewritten,
// so the pivot cannot lose or corrupt existing records.

import { Briefcase, ShoppingBag, Disc3, Target, TrendingUp, Home as HomeIcon, Plane, Wallet, Ticket } from "lucide-react";
import { txMatchesHobby } from "./hobby.js";
import { getLang } from "../i18n.js";

const MODULES = {
  freelance:   { id: "freelance",   icon: Briefcase,   color: "#06b6d4", side: true,  label: { en: "Freelance", pl: "Freelance", de: "Freelance", es: "Freelance", fr: "Freelance", pt: "Freelance", it: "Freelance", nl: "Freelance", uk: "Фриланс" },     desc: { en: "Client invoices, gigs, courses sold", pl: "Faktury, zlecenia, sprzedane kursy", de: "Rechnungen, Aufträge, verkaufte Kurse", es: "Facturas, encargos, cursos vendidos", fr: "Factures, missions, cours vendus", pt: "Notas, trabalhos, cursos vendidos", it: "Fatture, incarichi, corsi venduti", nl: "Facturen, opdrachten, verkochte cursussen", uk: "Рахунки, замовлення, продані курси" } },
  reselling:   { id: "reselling",   icon: ShoppingBag, color: "#ec4899", side: true,  label: { en: "Reselling", pl: "Odsprzedaż", de: "Wiederverkauf", es: "Reventa", fr: "Revente", pt: "Revenda", it: "Rivendita", nl: "Doorverkoop", uk: "Перепродаж" },    desc: { en: "Vinted, eBay, Depop, Etsy — fees included", pl: "Vinted, eBay, Allegro, OLX — z prowizjami", de: "Vinted, eBay, Kleinanzeigen — mit Gebühren", es: "Vinted, Wallapop, eBay — con comisiones", fr: "Vinted, Leboncoin, eBay — frais inclus", pt: "Mercado Livre, OLX, eBay — com taxas", it: "Vinted, Subito, eBay — commissioni incluse", nl: "Vinted, Marktplaats, eBay — inclusief kosten", uk: "OLX, Vinted, eBay — з комісіями" } },
  collections: { id: "collections", icon: Disc3,       color: "#34d399", side: true,  label: { en: "Collections", pl: "Kolekcje", de: "Sammlungen", es: "Colecciones", fr: "Collections", pt: "Coleções", it: "Collezioni", nl: "Collecties", uk: "Колекції" },      desc: { en: "Vinyl, books, games — buys, sales, value", pl: "Winyle, książki, gry — zakupy, sprzedaż, wartość", de: "Vinyl, Bücher, Spiele — Käufe, Verkäufe, Wert", es: "Vinilos, libros, juegos — compras, ventas, valor", fr: "Vinyles, livres, jeux — achats, ventes, valeur", pt: "Vinis, livros, jogos — compras, vendas, valor", it: "Vinili, libri, giochi — acquisti, vendite, valore", nl: "Vinyl, boeken, games — aankopen, verkopen, waarde", uk: "Вініл, книги, ігри — покупки, продажі, вартість" } },
  betting:     { id: "betting",     icon: Target,      color: "#a78bfa", side: true,  adult: true, label: { en: "Betting", pl: "Zakłady", de: "Sportwetten", es: "Apuestas", fr: "Paris sportifs", pt: "Apostas", it: "Scommesse", nl: "Weddenschappen", uk: "Ставки" },   desc: { en: "Bankroll, ROI and results. Tracking only.", pl: "Bankroll, ROI i wyniki. Tylko śledzenie.", de: "Bankroll, ROI und Ergebnisse. Nur zum Festhalten.", es: "Bankroll, ROI y resultados. Solo seguimiento.", fr: "Bankroll, ROI et résultats. Suivi uniquement.", pt: "Banca, ROI e resultados. Apenas acompanhamento.", it: "Bankroll, ROI e risultati. Solo monitoraggio.", nl: "Bankroll, ROI en resultaten. Alleen bijhouden.", uk: "Банкрол, ROI і результати. Лише облік." } },
  investments: { id: "investments", icon: TrendingUp,  color: "#8b5cf6", side: true,  label: { en: "Investments", pl: "Inwestycje", de: "Geldanlagen", es: "Inversiones", fr: "Investissements", pt: "Investimentos", it: "Investimenti", nl: "Beleggingen", uk: "Інвестиції" },    desc: { en: "Crypto, stocks, funds outside your main broker", pl: "Krypto, akcje, fundusze poza głównym brokerem", de: "Krypto, Aktien, Fonds außerhalb deines Hauptbrokers", es: "Cripto, acciones, fondos fuera de tu bróker principal", fr: "Crypto, actions, fonds hors de votre courtier principal", pt: "Cripto, ações, fundos fora da sua corretora principal", it: "Cripto, azioni, fondi fuori dal tuo broker principale", nl: "Crypto, aandelen, fondsen buiten je hoofdbroker", uk: "Крипта, акції, фонди поза основним брокером" } },
  rental:      { id: "rental",      icon: HomeIcon,    color: "#f59e0b", side: true,  label: { en: "Rental", pl: "Najem", de: "Vermietung", es: "Alquiler", fr: "Location", pt: "Aluguel", it: "Affitti", nl: "Verhuur", uk: "Оренда" },         desc: { en: "Apartment, parking, storage, gear rental", pl: "Mieszkanie, parking, garaż, wynajem sprzętu", de: "Wohnung, Stellplatz, Lager, Geräteverleih", es: "Piso, parking, trastero, alquiler de equipo", fr: "Appartement, parking, box, location de matériel", pt: "Apartamento, vaga, depósito, aluguel de equipamentos", it: "Appartamento, posto auto, box, noleggio attrezzatura", nl: "Woning, parkeerplaats, opslag, verhuur van spullen", uk: "Квартира, паркінг, склад, прокат техніки" } },
  // v2.8.0: koszty pasji, które nie zarabiają — osobno od kolekcji (te mają wartość i można je sprzedać)
  hobby:       { id: "hobby",       icon: Ticket,      color: "#f97316", side: false, label: { en: "Hobbies & subscriptions", pl: "Hobby i subskrypcje", de: "Hobbys & Abos", es: "Hobbies y suscripciones", fr: "Loisirs et abonnements", pt: "Hobbies e assinaturas", it: "Hobby e abbonamenti", nl: "Hobby's & abonnementen", uk: "Хобі та підписки" }, desc: { en: "Netflix, Spotify, AI, concerts, cinema — what your passions cost", pl: "Netflix, Spotify, AI, koncerty, kino — ile kosztują pasje", de: "Netflix, Spotify, KI, Konzerte, Kino — was deine Hobbys kosten", es: "Netflix, Spotify, IA, conciertos, cine: lo que cuestan tus aficiones", fr: "Netflix, Spotify, IA, concerts, cinéma — ce que coûtent vos passions", pt: "Netflix, Spotify, IA, shows, cinema — quanto custam seus hobbies", it: "Netflix, Spotify, IA, concerti, cinema: quanto costano le passioni", nl: "Netflix, Spotify, AI, concerten, bioscoop — wat je hobby's kosten", uk: "Netflix, Spotify, ШІ, концерти, кіно — скільки коштують захоплення" } },
  trips:       { id: "trips",       icon: Plane,       color: "#3b82f6", side: false, label: { en: "Trips", pl: "Wyjazdy", de: "Reisen", es: "Viajes", fr: "Voyages", pt: "Viagens", it: "Viaggi", nl: "Reizen", uk: "Подорожі" },       desc: { en: "Trip budgets in any currency", pl: "Budżety wyjazdów w dowolnej walucie", de: "Reisebudgets in jeder Währung", es: "Presupuestos de viaje en cualquier moneda", fr: "Budgets de voyage dans toutes les devises", pt: "Orçamentos de viagem em qualquer moeda", it: "Budget di viaggio in qualsiasi valuta", nl: "Reisbudgetten in elke valuta", uk: "Бюджети подорожей у будь-якій валюті" } },
  personal:    { id: "personal",    icon: Wallet,      color: "#64748b", side: false, label: { en: "Personal spending", pl: "Wydatki osobiste", de: "Private Ausgaben", es: "Gastos personales", fr: "Dépenses personnelles", pt: "Gastos pessoais", it: "Spese personali", nl: "Persoonlijke uitgaven", uk: "Особисті витрати" }, desc: { en: "Everyday spending, kept apart from your side income", pl: "Codzienne wydatki, osobno od dochodu pobocznego", de: "Alltagsausgaben, getrennt vom Nebeneinkommen", es: "Gastos del día a día, separados de tus ingresos extra", fr: "Dépenses du quotidien, séparées de vos revenus annexes", pt: "Gastos do dia a dia, separados da sua renda extra", it: "Spese quotidiane, separate dalle entrate extra", nl: "Dagelijkse uitgaven, apart van je bijverdiensten", uk: "Щоденні витрати окремо від додаткового доходу" } },
};

// "personal" nie jest już modułem do wyboru (2.6.0) — zostaje w MODULES tylko jako kubełek
// dla starych wpisów osobistych, które getModule rozpoznaje, a widoki ukrywają.
const MODULE_ORDER = ["freelance", "reselling", "collections", "betting", "investments", "rental", "hobby", "trips"];
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

function moduleLabel(id, lang = getLang()) {
  const m = MODULES[id];
  if (!m) return id;
  return m.label[lang] || m.label.en;
}

function moduleDesc(id, lang = getLang()) {
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
  if (Array.isArray(hobbies) && hobbies.some(h => !h.archived && !h.movedToHobby && txMatchesHobby(tx, h))) return "collections";
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

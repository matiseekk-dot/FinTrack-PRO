// Moduł Hobby i subskrypcje: koszty pasji, które nie zarabiają (Netflix, Spotify, AI,
// koncerty, kino). Nie wliczają się do dochodu pobocznego — Start pokazuje je osobno.
//
// Subskrypcja (kolekcja `subscriptions`) to przypomnienie o płatności:
// { id, name, kind, amount, currency, cycle: "month"|"year"|"week", nextDate, trial, active }.
// Płatność zapisuje się jako zwykły wpis (module "hobby", cat "subskrypcje", subscriptionId),
// dopiero gdy użytkownik ją potwierdzi — apka nie zgaduje, czy nie anulował.

import { Tv, Music, Bot, Gamepad2, Dumbbell, Repeat } from "lucide-react";
import { makeTx } from "./ledger.js";
import { amountForDisplay } from "./fx.js";
import { getLang } from "../i18n.js";

const SUB_KINDS = [
  { id: "streaming", icon: Tv,       color: "#ef4444", label: { en: "Streaming", pl: "Filmy i seriale", de: "Streaming", es: "Streaming", fr: "Streaming", pt: "Streaming", it: "Streaming", nl: "Streaming", uk: "Стрімінг" } },
  { id: "music",     icon: Music,    color: "#22c55e", label: { en: "Music", pl: "Muzyka", de: "Musik", es: "Música", fr: "Musique", pt: "Música", it: "Musica", nl: "Muziek", uk: "Музика" } },
  { id: "ai",        icon: Bot,      color: "#8b5cf6", label: { en: "AI & apps", pl: "AI i aplikacje", de: "KI & Apps", es: "IA y apps", fr: "IA et applis", pt: "IA e apps", it: "IA e app", nl: "AI & apps", uk: "ШІ та застосунки" } },
  { id: "gaming",    icon: Gamepad2, color: "#3b82f6", label: { en: "Gaming", pl: "Gry", de: "Gaming", es: "Juegos", fr: "Jeux", pt: "Jogos", it: "Giochi", nl: "Gaming", uk: "Ігри" } },
  { id: "fitness",   icon: Dumbbell, color: "#f59e0b", label: { en: "Gym & sport", pl: "Siłownia i sport", de: "Fitness & Sport", es: "Gimnasio y deporte", fr: "Salle et sport", pt: "Academia e esporte", it: "Palestra e sport", nl: "Sportschool & sport", uk: "Спортзал і спорт" } },
  { id: "other",     icon: Repeat,   color: "#64748b", label: { en: "Other", pl: "Inne", de: "Sonstiges", es: "Otros", fr: "Autres", pt: "Outros", it: "Altro", nl: "Overig", uk: "Інше" } },
];

function subKind(id) {
  return SUB_KINDS.find(k => k.id === id) || SUB_KINDS[SUB_KINDS.length - 1];
}
function subKindLabel(id, lang = getLang()) {
  const k = subKind(id);
  return k.label[lang] || k.label.en;
}


/** Następny termin: ten sam dzień miesiąca (31 stycznia → 28/29 lutego), za rok albo za tydzień. */
function addCycle(dateStr, cycle) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const pad = (n) => String(n).padStart(2, "0");
  if (cycle === "week") {
    const dt = new Date(y, m - 1, d + 7);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  const months = cycle === "year" ? 12 : 1;
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** Koszt subskrypcji w przeliczeniu na miesiąc, w PLN-ekwiwalencie dla fmtDisplay. */
function monthlyCost(sub) {
  const v = amountForDisplay(sub.amount, sub.currency);
  if (sub.cycle === "year") return v / 12;
  if (sub.cycle === "week") return (v * 52) / 12;
  return v;
}

function daysUntil(dateStr, today) {
  const a = new Date(`${today}T00:00:00`), b = new Date(`${dateStr}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

/**
 * Stan subskrypcji: due = termin minął lub dziś (czeka na potwierdzenie płatności),
 * soon = do 3 dni (przy okresie próbnym — czas, żeby anulować).
 */
function subscriptionState(sub, today) {
  if (!sub.active) return "inactive";
  const d = daysUntil(sub.nextDate, today);
  if (d <= 0) return "due";
  if (d <= 3) return "soon";
  return "ok";
}

/** Wpis płatności za jeden okres (data = termin, który właśnie minął). */
function buildSubscriptionTx(sub, { rate = 1, acc, desc } = {}) {
  return makeTx({
    date: sub.nextDate, desc: desc || sub.name, amount: -Math.abs(Number(sub.amount) || 0),
    currency: sub.currency || "PLN", rate, acc, cat: "subskrypcje", module: "hobby",
    subscriptionId: sub.id,
  });
}

function sanitizeSubscriptions(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(s => s && s.id != null && typeof s.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.nextDate || ""));
}

export {
  SUB_KINDS, subKind, subKindLabel, addCycle, monthlyCost, daysUntil,
  subscriptionState, buildSubscriptionTx, sanitizeSubscriptions,
};

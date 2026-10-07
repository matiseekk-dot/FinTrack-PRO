// Przypomnienia (aplikacja na Androida): lokalne powiadomienia planowane na telefonie, bez serwera —
// płatność subskrypcji (i koniec okresu próbnego), termin faktury, termin czynszu.
// Ustawienie jest per urządzenie (localStorage), bo powiadomienia też są per urządzenie.
// W wersji przeglądarkowej te same sprawy pokazuje Start („Do zrobienia”).

import { isNative } from "./native.js";
import { addCycle } from "./subscriptions.js";
import { dueDate, rentStatus, shiftYm, modeOf } from "./rental.js";
import { fmtCurrency } from "../utils.js";
import { t } from "../i18n.js";

const KEY = "ft_reminders";
const DEFAULTS = { enabled: false, hour: 9, subs: true, invoices: true, rent: true };
const HORIZON_DAYS = 45;
const MAX = 60;

function getReminderPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
  catch { return { ...DEFAULTS }; }
}
function setReminderPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* bez pamięci */ }
}

const pad = (n) => String(n).padStart(2, "0");
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Id powiadomienia (32-bit, dodatnie) z klucza — ta sama sprawa ma zawsze ten sam id. */
function idOf(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2000000000 + 1;
}

/**
 * Lista przypomnień na najbliższe 45 dni: { id, at: Date, title, body, tab }.
 * Tylko przyszłe terminy; sprawy już po terminie przypominamy po 3 i po 10 dniach.
 */
function buildReminders({ subscriptions = [], gigs = [], rentals = [], transactions = [], prefs = getReminderPrefs(), now = new Date() }) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const until = addDays(today, HORIZON_DAYS);
  const out = [];
  const push = (key, date, title, body, tab) => {
    if (date < today || date > until) return;
    const at = new Date(`${date}T${pad(prefs.hour)}:00:00`);
    if (at <= now) return;
    out.push({ id: idOf(key), at, title, body, tab });
  };

  if (prefs.subs) {
    for (const s of subscriptions) {
      if (!s.active || !s.nextDate) continue;
      const price = fmtCurrency(s.amount, s.currency || "PLN");
      // Kilka najbliższych terminów (subskrypcja tygodniowa ma ich więcej w 45 dniach)
      let next = s.nextDate;
      for (let i = 0; i < 6 && next <= until; i++, next = addCycle(next, s.cycle)) {
        if (s.trial && i === 0) {
          push(`trial:${s.id}:${next}`, addDays(next, -2), t("rem.trial.title", "Koniec okresu próbnego: {name}").replace("{name}", s.name),
            t("rem.trial.body", "Za 2 dni pierwsza płatność {price}. Anuluj, jeśli nie chcesz płacić.").replace("{price}", price), "hobby");
        } else {
          push(`sub:${s.id}:${next}`, addDays(next, -1), t("rem.sub.title", "Jutro płatność: {name}").replace("{name}", s.name),
            t("rem.sub.body", "{price} — potwierdź w Sidegig, gdy pobiorą.").replace("{price}", price), "hobby");
        }
      }
    }
  }

  if (prefs.invoices) {
    for (const g of gigs) {
      if (g.status !== "unpaid" || !g.dueDate) continue;
      const amount = fmtCurrency(g.amount, g.currency || "PLN");
      const name = g.client ? `${g.title || ""} · ${g.client}`.replace(/^ · /, "") : (g.title || "Freelance");
      push(`inv:${g.id}:due`, g.dueDate, t("rem.inv.title", "Termin płatności: {name}").replace("{name}", name),
        t("rem.inv.body", "Dziś mija termin faktury na {amount}.").replace("{amount}", amount), "freelance");
      for (const d of [3, 10]) {
        push(`inv:${g.id}:late${d}`, addDays(g.dueDate, d), t("rem.invLate.title", "Faktura po terminie: {name}").replace("{name}", name),
          t("rem.invLate.body", "{amount} — {n} dni po terminie. Może warto przypomnieć klientowi?").replace("{amount}", amount).replace("{n}", d), "freelance");
      }
    }
  }

  if (prefs.rent) {
    for (const p of rentals) {
      if (p.archived || modeOf(p) !== "monthly" || !(Number(p.rent) > 0)) continue;
      const amount = fmtCurrency(p.rent, p.currency || "PLN");
      for (let i = -1; i <= 1; i++) {
        const ym = shiftYm(today.slice(0, 7), i);
        if (p.since && ym < p.since.slice(0, 7)) continue;
        if (rentStatus(p, ym, transactions, today).state === "paid") continue;
        const due = dueDate(p, ym);
        push(`rent:${p.id}:${ym}:due`, due, t("rem.rent.title", "Termin czynszu: {name}").replace("{name}", p.name),
          t("rem.rent.body", "{amount} — oznacz w Sidegig, gdy wpłynie.").replace("{amount}", amount), "rental");
        push(`rent:${p.id}:${ym}:late`, addDays(due, 3), t("rem.rentLate.title", "Czynsz nie wpłynął: {name}").replace("{name}", p.name),
          t("rem.rentLate.body", "{amount} — 3 dni po terminie.").replace("{amount}", amount), "rental");
      }
    }
  }

  return out.sort((a, b) => a.at - b.at).slice(0, MAX);
}

async function plugin() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

/** Prosi o zgodę na powiadomienia (Android 13+). true = można planować. */
async function requestReminderPermission() {
  if (!isNative) return false;
  const LN = await plugin();
  const cur = await LN.checkPermissions();
  if (cur.display === "granted") return true;
  const res = await LN.requestPermissions();
  return res.display === "granted";
}

/** Zastępuje wszystkie zaplanowane przypomnienia nową listą (pusta lista = wyłączone). */
async function syncReminders(list) {
  if (!isNative) return;
  const LN = await plugin();
  const pending = await LN.getPending();
  if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  if (!list.length) return;
  const perm = await LN.checkPermissions();
  if (perm.display !== "granted") return;
  await LN.schedule({
    notifications: list.map(r => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, extra: { tab: r.tab } })),
  });
}

/** Stuknięcie w powiadomienie otwiera właściwy ekran. */
async function onReminderTap(cb) {
  if (!isNative) return () => {};
  const LN = await plugin();
  const h = await LN.addListener("localNotificationActionPerformed", (e) => cb(e && e.notification && e.notification.extra && e.notification.extra.tab));
  return () => h.remove();
}

export { getReminderPrefs, setReminderPrefs, buildReminders, requestReminderPermission, syncReminders, onReminderTap };

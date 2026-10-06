// Discogs (tylko odczyt): import kolekcji i listy życzeń winyli + wyceny z rynku Discogs.
//
// API działa bez serwera (CORS: *). Bez tokenu widać tylko publiczne kolekcje i jest
// limit ~25 zapytań/min; z osobistym tokenem (discogs.com/settings/developers) także
// prywatne i ~60/min. Token zostaje na tym urządzeniu — nie trafia do chmury ani kopii.

import { KINDS } from "./collections.js";

const API = "https://api.discogs.com";
const TOKEN_KEY = "ft_discogs_token";
const USER_KEY = "ft_discogs_user";

function getSaved() {
  try { return { user: localStorage.getItem(USER_KEY) || "", token: localStorage.getItem(TOKEN_KEY) || "" }; }
  catch { return { user: "", token: "" }; }
}
function save(user, token) {
  try {
    localStorage.setItem(USER_KEY, user || "");
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  } catch { /* prywatny tryb */ }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let lastCall = 0;

/** GET z odstępem między zapytaniami (limit Discogs) i ponowieniem po 429. Token jako parametr — bez preflightu CORS. */
async function get(path, token, params = {}) {
  const gap = token ? 1100 : 2600;
  const wait = lastCall + gap - Date.now();
  if (wait > 0) await sleep(wait);
  const q = new URLSearchParams({ ...params, ...(token ? { token } : {}) });
  const url = `${API}${path}${q.toString() ? `?${q}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    lastCall = Date.now();
    const res = await fetch(url);
    if (res.status === 429) { await sleep(30000); continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }
  throw Object.assign(new Error("Rate limited"), { status: 429 });
}

async function fetchFolders(user, token) {
  const r = await get(`/users/${encodeURIComponent(user)}/collection/folders`, token);
  return (r.folders || []).map(f => ({ id: f.id, name: f.name, count: f.count }));
}

/** Wszystkie płyty folderu (0 = cała kolekcja) albo lista życzeń; onPage(liczba, razem). */
async function fetchReleases(user, token, { folderId = 0, wantlist = false, limit = 2000, onPage } = {}) {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const path = wantlist ? `/users/${encodeURIComponent(user)}/wants` : `/users/${encodeURIComponent(user)}/collection/folders/${folderId}/releases`;
    const r = await get(path, token, { per_page: 100, page, ...(wantlist ? {} : { sort: "added", sort_order: "desc" }) });
    const list = wantlist ? (r.wants || []) : (r.releases || []);
    out.push(...list);
    if (onPage) onPage(out.length, r.pagination ? r.pagination.items : out.length);
    if (!r.pagination || page >= r.pagination.pages || out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Najniższa aktualna oferta na rynku Discogs (ostrożna wycena) w podanej walucie. */
async function lowestPrice(releaseId, token, currency = "EUR") {
  const r = await get(`/marketplace/stats/${releaseId}`, token, { curr_abbr: currency });
  return r && r.lowest_price && typeof r.lowest_price.value === "number" ? r.lowest_price.value : null;
}

/** Wartość całej kolekcji wg Discogs (min / mediana / max) — tylko z tokenem właściciela. */
async function collectionValue(user, token) {
  if (!token) return null;
  try { return await get(`/users/${encodeURIComponent(user)}/collection/value`, token); }
  catch { return null; }
}

// Waluty, w których Discogs podaje ceny
const DISCOGS_CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD", "JPY", "CHF", "MXN", "BRL", "NZD", "SEK", "ZAR"];

const CONDITION_MAP = [
  [/^mint|\(m\)/i, "new"],
  [/near mint|nm|m-/i, "mint"],
  [/very good|vg/i, "good"],
  [/good|fair|poor/i, "fair"],
];

/** Płyta z Discogs → pola pozycji katalogu. */
function mapRelease(entry, lang) {
  const b = entry.basic_information || {};
  const names = (KINDS.vinyl.formats[lang] || KINDS.vinyl.formats.en);
  const fmt = (b.formats || [])[0] || {};
  const desc = (fmt.descriptions || []).join(" ");
  let format = "";
  if (/vinyl/i.test(fmt.name || "")) {
    if (/7"/.test(desc)) format = '7"';
    else if (/12"/.test(desc) && !/LP/.test(desc)) format = '12"';
    else format = Number(fmt.qty) >= 2 ? "2LP" : "LP";
  } else if (/^CD/i.test(fmt.name || "")) format = "CD";
  else if (/cassette/i.test(fmt.name || "")) format = names[5];
  else if (/box/i.test(fmt.name || "")) format = names[6];
  const condNote = (entry.notes || []).find(n => n.field_id === 1);
  const cond = condNote ? (CONDITION_MAP.find(([re]) => re.test(condNote.value || "")) || [])[1] : null;
  return {
    title: b.title || "—",
    creator: (b.artists || []).map(a => (a.name || "").replace(/\s\(\d+\)$/, "")).join(" & "),
    format,
    condition: cond || "good",
    year: b.year || null,
    discogs: { r: b.id || entry.id, i: entry.instance_id || null },
  };
}

export { getSaved, save, fetchFolders, fetchReleases, lowestPrice, collectionValue, mapRelease, DISCOGS_CURRENCIES };

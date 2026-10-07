// Skanowanie kodów kreskowych (ISBN / EAN / UPC) i wyszukiwanie tytułu w darmowych bazach.
//
// Detektor: wbudowany BarcodeDetector (Chrome na Androidzie), a gdzie go nie ma (iPhone,
// aplikacja na Androida, komputer) — ZXing w WebAssembly, ładowany dopiero przy pierwszym
// skanowaniu z plików aplikacji (bez zewnętrznego CDN, w aplikacji działa też offline).
//
// Bazy:
//   książki — Open Library, Google Books (klucz projektu Firebase, gdy Books API jest na nim włączone),
//             Biblioteka Narodowa dla polskich ISBN (978-83…, aplikacja / serwer pośredniczący);
//   płyty — Discogs (gdy zapisany jest token), inaczej MusicBrainz + numer wydania Discogs do wyceny;
//   gry i reszta — Open Products Facts, potem UPCitemdb (aplikacja / serwer pośredniczący).
// Serwisy bez CORS idą przez lib/net.js; w zwykłej przeglądarce są pomijane.

import { KINDS } from "./collections.js";
import { getSaved as getDiscogsSaved, searchBarcode, mapSearchResult } from "./discogs.js";
import { canReachRestricted, getRestricted } from "./net.js";
import { auth } from "../firebase.js";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
let detectorPromise = null;

/** Detektor kodów (wbudowany albo ZXing); ten sam obiekt dla kolejnych skanowań. */
function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const fmts = FORMATS.filter(f => supported.includes(f));
          if (fmts.includes("ean_13")) return new window.BarcodeDetector({ formats: fmts });
        } catch { /* niżej ZXing */ }
      }
      const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
        import("barcode-detector/ponyfill"),
        import("zxing-wasm/reader/zxing_reader.wasm?url"),
      ]);
      prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) } });
      return new BarcodeDetector({ formats: FORMATS });
    })().catch((e) => { detectorPromise = null; throw e; });
  }
  return detectorPromise;
}

// ── Kody ────────────────────────────────────────────────────────────

/** Suma kontrolna GTIN (EAN-8, UPC-A, EAN-13). */
function gtinValid(code) {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function isbn10Valid(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  return s.split("").reduce((a, c, i) => a + (c === "X" ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
}

function isbn10to13(s) {
  const core = "978" + s.slice(0, 9);
  const sum = core.split("").reduce((a, x, i) => a + Number(x) * (i % 2 ? 3 : 1), 0);
  return core + ((10 - (sum % 10)) % 10);
}

/**
 * Kod do zapisu i porównań: 13 cyfr (UPC-A dostaje zero z przodu), ISBN-10 → ISBN-13.
 * strict: kod wpisany ręcznie — sprawdzamy sumę kontrolną (literówki).
 */
function normalizeCode(raw, strict = false) {
  const s = String(raw || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (s.length === 10 && isbn10Valid(s)) return isbn10to13(s);
  if (/X/.test(s)) return null;
  if (strict && !gtinValid(s)) return null;
  if (s.length === 12) return "0" + s;
  if (s.length === 13 || s.length === 8) return s;
  return null;
}

const isBookCode = (code) => /^97[89]\d{10}$/.test(code);

// ── Wyszukiwanie ────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clean = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();
const yearOf = (s) => { const m = String(s || "").match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };

/** JSON albo null (404 = nie ma, 429 = limit). Błąd sieci leci dalej — to „brak internetu”. */
async function fetchJson(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function lookupBook(isbn) {
  // Polskie wydania: najpierw Biblioteka Narodowa — ma praktycznie wszystkie i z poprawnymi znakami
  if (canReachRestricted && /^97[89]83/.test(isbn)) {
    try {
      const bn = await getRestricted(`https://data.bn.org.pl/api/institutions/bibs.json?isbnIssn=${isbn}&limit=1`);
      const r = bn && (bn.bibs || [])[0];
      if (r && r.title) return { title: bnTitle(r.title), creator: bnAuthor(r.author), year: yearOf(r.publicationYear) };
    } catch { /* niżej Open Library */ }
  }
  const ol = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const b = ol && ol[`ISBN:${isbn}`];
  if (b && b.title) {
    return { title: clean(b.title), creator: (b.authors || []).map(a => clean(a.name)).filter(Boolean).join(", "), year: yearOf(b.publish_date) };
  }
  // Google Books: bez klucza wspólny limit jest zawsze wyczerpany — używamy klucza projektu
  const key = auth && auth.app && auth.app.options && auth.app.options.apiKey;
  const gb = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key ? `&key=${key}` : ""}`);
  const v = gb && gb.items && gb.items[0] && gb.items[0].volumeInfo;
  if (v && v.title) return { title: clean(v.title), creator: (v.authors || []).map(clean).join(", "), year: yearOf(v.publishedDate) };
  return null;
}

// Biblioteka Narodowa: „Ostatnie życzenie / Wiedźmin Wiedźmin” → „Ostatnie życzenie”
function bnTitle(s) { return clean(String(s).split(" / ")[0]).replace(/[\s,;:/.]+$/, ""); }
// „Sapkowski, Andrzej (1948- ) SuperNowa …” → „Andrzej Sapkowski”
function bnAuthor(s) {
  const first = clean(String(s || "").split(" (")[0]).replace(/[\s,;:]+$/, "");
  const m = first.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : first;
}

// MusicBrainz prosi o najwyżej 1 zapytanie na sekundę
let mbLast = 0;
async function mb(path) {
  const wait = mbLast + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  mbLast = Date.now();
  return fetchJson(`https://musicbrainz.org/ws/2${path}`);
}

function mbFormat(rel, names) {
  const media = rel.media || [];
  const f = media.map(m => m.format || "").join(" ");
  if (/vinyl/i.test(f)) {
    if (/7"/.test(f)) return '7"';
    if (media.length >= 2) return "2LP";
    const type = rel["release-group"] && rel["release-group"]["primary-type"];
    if (/12"/.test(f) && (type === "Single" || type === "EP")) return '12"';
    return "LP";
  }
  if (/\bCD\b/.test(f)) return "CD";
  if (/cassette/i.test(f)) return names[5];
  return "";
}

async function lookupMusic(code, lang) {
  const { token } = getDiscogsSaved();
  if (token) {
    try {
      const r = await searchBarcode(code, token);
      if (r) return mapSearchResult(r, lang);
    } catch { /* niżej MusicBrainz */ }
  }
  // Kody UPC są w MusicBrainz zapisane bez zera z przodu
  const variants = code.length === 13 && code.startsWith("0") ? [code, code.slice(1)] : [code];
  const s = await mb(`/release/?query=${encodeURIComponent(variants.map(v => `barcode:${v}`).join(" OR "))}&fmt=json&limit=5`);
  // Wyszukiwarka zwraca też „podobne” wyniki — bierzemy tylko wydanie z dokładnie tym kodem
  const exact = (s && s.releases || []).filter(r => variants.includes(String(r.barcode || "").replace(/\D/g, "")));
  // Ten sam kod przy kilku różnych tytułach = kod-zaślepka (np. przykład GS1) — lepiej zapytać o tytuł
  if (new Set(exact.map(r => clean(r.title).toLowerCase())).size >= 3) return null;
  const rel = exact[0];
  if (!rel || !rel.title) return null;
  const names = KINDS.vinyl.formats[lang] || KINDS.vinyl.formats.en;
  const out = {
    title: clean(rel.title),
    creator: clean((rel["artist-credit"] || []).map(a => (a.name || "") + (a.joinphrase || "")).join("")),
    format: mbFormat(rel, names),
    year: yearOf(rel.date),
  };
  // Numer wydania na Discogs — żeby „Pobierz wyceny” znało cenę tej płyty
  try {
    const d = await mb(`/release/${rel.id}?inc=url-rels&fmt=json`);
    const url = d && (d.relations || []).find(x => x.type === "discogs" && x.url && x.url.resource);
    const m = url && url.url.resource.match(/\/release\/(\d+)/);
    if (m) out.discogs = { r: Number(m[1]), i: null };
  } catch { /* bez numeru Discogs */ }
  return out;
}

const PLATFORMS = [
  [/\bps5\b|playstation\s*5/i, "PS5"], [/\bps4\b|playstation\s*4/i, "PS4"],
  [/xbox/i, "Xbox"], [/switch/i, "Switch"], [/\bpc\b|windows/i, "PC"],
];

/** „The Witcher 3 Brand & Sealed - UK PAL” → „The Witcher 3” (dopiski sprzedawców z baz kodów). */
function stripSellerNoise(name) {
  return clean(String(name)
    .replace(/\s*[-–|]\s*(uk|eu|us|usa|pal|ntsc|import|region free)\b[^-–|]*$/i, "")
    .replace(/\b(brand\s*&\s*sealed|brand\s*new|new\s*&\s*sealed|factory\s*sealed|sealed|new\s+in\s+box)\b/ig, "")
    .replace(/\b(uk|eu)?\s*pal\s*(version)?\b/ig, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/[\s,;:-]+$/, ""));
}

/** Nazwa produktu → tytuł bez platformy („Zelda (Nintendo Switch)” → „Zelda”), platforma jako format. */
function productFromName(rawName, brand) {
  const name = stripSellerNoise(rawName) || clean(rawName);
  const plat = PLATFORMS.find(([re]) => re.test(name));
  return {
    title: plat ? clean(name.replace(/\s*[([][^)\]]*(ps[45]|playstation|xbox|switch|nintendo|\bpc\b)[^)\]]*[)\]]/i, "")) || name : name,
    creator: clean(String(brand || "").split(",")[0]),
    format: plat ? plat[1] : "",
  };
}

async function lookupProduct(code, lang) {
  const p = await fetchJson(`https://world.openproductsfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_${lang},product_name_en,brands`);
  const prod = p && p.status === 1 && p.product;
  const name = prod && clean(prod[`product_name_${lang}`] || prod.product_name || prod.product_name_en);
  if (name) return productFromName(name, prod.brands);
  // UPCitemdb: duża baza kodów (gry, filmy, gadżety) — bez CORS, więc tylko w aplikacji / przez serwer
  if (!canReachRestricted) return null;
  const u = await getRestricted(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
  const it = u && (u.items || [])[0];
  if (!it || !it.title) return null;
  return productFromName(clean(it.title), it.brand);
}

/**
 * Szuka pozycji po kodzie. Zwraca { status: "found", data } | { status: "notfound" } | { status: "error" }
 * (error = żadna baza nie odpowiedziała — zwykle brak internetu).
 */
async function lookupCode(code, kind, lang) {
  let errored = false;
  const attempt = async (fn) => { try { return await fn(); } catch { errored = true; return null; } };
  let data = null;
  if (isBookCode(code)) data = await attempt(() => lookupBook(code));
  else if (kind === "vinyl") data = await attempt(() => lookupMusic(code, lang)) || await attempt(() => lookupProduct(code, lang));
  else {
    data = await attempt(() => lookupProduct(code, lang));
    // W kolekcji „inne” bywa też muzyka
    if (!data && kind === "other") data = await attempt(() => lookupMusic(code, lang));
  }
  if (data) return { status: "found", data };
  return { status: errored ? "error" : "notfound" };
}

// ── Sygnał po zeskanowaniu ──────────────────────────────────────────

let audio = null;
/** Krótkie „pip” i wibracja — przy skanowaniu serii nie trzeba patrzeć na ekran. */
function scanFeedback() {
  try { if (navigator.vibrate) navigator.vibrate(40); } catch { /* brak wibracji */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    if (audio.state === "suspended") audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine"; o.frequency.value = 1760; g.gain.value = 0.05;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.07);
  } catch { /* bez dźwięku */ }
}

export { getDetector, normalizeCode, gtinValid, isBookCode, lookupCode, scanFeedback, bnTitle, bnAuthor };

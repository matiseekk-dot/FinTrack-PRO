/**
 * License key validation - HMAC + Firestore activation lock.
 *
 * Format klucza: FT-{TYPE}-{XXXXX}-{XXXXX}-{TAG}
 *   TYPE  : Y (yearly), L (lifetime), T (trial)
 *   XXXXX : 5 znaków base32 (alfabet bez 0/O/1/I), losowe
 *   TAG   : 4 znaki base32 = first 4 chars of HMAC-SHA256(prefix + body, SECRET)
 *
 * Bezpieczeństwo - świadome trade-offy:
 * 1. SECRET jest hardcoded w kodzie klienta. Atakujący który zrobi reverse-engineering
 *    bundle'a może generować dowolne klucze. To jest podwyższenie progu, nie hard
 *    security. Docelowo: HMAC w Cloud Function, klient tylko forwarduje request.
 * 2. Aktywacja zapisuje (key → uid) w Firestore. Drugi użytkownik próbujący ten
 *    sam klucz dostaje błąd "klucz już użyty". To blokuje dystrybucję jednego
 *    klucza między ludźmi - musieliby się zgadzać który ma być "głównym".
 * 3. Trial ma 14-dniowy limit zapisany w expiresAt.
 *
 * Generowanie kluczy do Gumroad robi Mateusz osobno, używając tego samego SECRET
 * w skrypcie node.js. Patrz docs/license-keys.md (do dołączenia po fixie).
 */

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// PRZED PUBLIKACJĄ: wygeneruj nowy SECRET (32 hex chars) i zaktualizuj generator
// kluczy. Zmiana SECRET unieważnia WSZYSTKIE wcześniej wydane klucze.
// Generuj np: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
const SECRET = "ft-license-v1-7b3d9a2c8e1f4056b9ad3e5c8f7d2a1b";

// Base32 alfabet bez 0/O/1/I/L (mniej pomyłek przy ręcznym wpisywaniu)
const B32_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const TYPE_PREFIX = { Y: "yearly", L: "lifetime", T: "trial" };
const PREFIX_TYPE = { yearly: "Y", lifetime: "L", trial: "T" };

// === HMAC ===
async function hmacTag(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  // Zwróć first 4 bytes jako base32 (z naszego alfabetu)
  const bytes = new Uint8Array(sig);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += B32_ALPHABET[bytes[i] % B32_ALPHABET.length];
  }
  return out;
}

// === FORMAT ===
function parseKey(raw) {
  if (!raw || typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase();
  // Format: FT-T-XXXXX-XXXXX-TAG
  const m = key.match(/^FT-([YLT])-([23456789A-HJ-KM-NP-Z]{5})-([23456789A-HJ-KM-NP-Z]{5})-([23456789A-HJ-KM-NP-Z]{4})$/);
  if (!m) return null;
  return {
    type: TYPE_PREFIX[m[1]],
    typeChar: m[1],
    body: `${m[2]}-${m[3]}`,
    tag: m[4],
    canonical: key,
  };
}

async function isFormatValid(key) {
  const parsed = parseKey(key);
  if (!parsed) return false;
  const expectedTag = await hmacTag(`FT-${parsed.typeChar}-${parsed.body}`);
  return expectedTag === parsed.tag;
}

// === FIRESTORE ACTIVATION LOCK ===
// Zwraca { ok, error?, alreadyActivated?, byUid? }
async function lockActivation(db, key, uid) {
  if (!db || !uid) return { ok: true, skipped: true };  // offline / niezalogowany
  try {
    const ref = doc(db, "licenses", key);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      // Już zaktywowany - sprawdź czy ten sam uid
      if (data.uid === uid) return { ok: true, alreadyActivated: true };
      return { ok: false, error: "key_used_by_another_account", byUid: data.uid };
    }
    // Pierwszy raz - zarejestruj
    await setDoc(ref, {
      uid,
      activatedAt: serverTimestamp(),
      type: parseKey(key)?.type || "unknown",
    });
    return { ok: true, fresh: true };
  } catch (e) {
    console.error("[license] lock failed", e);
    // Nie blokuj na soft-error (np. offline) - format-validation already passed
    return { ok: true, error: "firestore_unavailable" };
  }
}

// === MAIN VALIDATION ENTRY POINT ===
/**
 * Sprawdza klucz i (jeśli `db` + `uid`) blokuje go w Firestore.
 * Zwraca { valid, type, error?, alreadyActivated? }
 */
async function validateLicense(rawKey, { db = null, uid = null } = {}) {
  const parsed = parseKey(rawKey);
  if (!parsed) {
    return { valid: false, error: "invalid_format" };
  }
  const formatOk = await isFormatValid(rawKey);
  if (!formatOk) {
    return { valid: false, error: "invalid_signature" };
  }
  const lockResult = await lockActivation(db, parsed.canonical, uid);
  if (!lockResult.ok) {
    return { valid: false, error: lockResult.error, byUid: lockResult.byUid };
  }
  return {
    valid: true,
    type: parsed.type,
    canonical: parsed.canonical,
    alreadyActivated: !!lockResult.alreadyActivated,
  };
}

// === KEY GENERATION (dla node skryptu) ===
function randomB32(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += B32_ALPHABET[bytes[i] % B32_ALPHABET.length];
  return out;
}

/**
 * Generuje pojedynczy klucz danego typu. Używaj w node skrypcie do batch
 * generowania kluczy do Gumroad - patrz docs/license-keys.md.
 */
async function generateKey(type) {
  const typeChar = PREFIX_TYPE[type];
  if (!typeChar) throw new Error(`Unknown type: ${type}`);
  const body1 = randomB32(5);
  const body2 = randomB32(5);
  const body = `${body1}-${body2}`;
  const tag = await hmacTag(`FT-${typeChar}-${body}`);
  return `FT-${typeChar}-${body}-${tag}`;
}

// User-facing error messages (PL)
const ERROR_MESSAGES = {
  invalid_format: "Nieprawidłowy format klucza. Sprawdź czy nie pominąłeś znaku.",
  invalid_signature: "Klucz nie przeszedł weryfikacji. Może być sfałszowany.",
  key_used_by_another_account: "Ten klucz został już użyty na innym koncie.",
  firestore_unavailable: "Nie udało się zweryfikować klucza online — sprawdź połączenie.",
};

export {
  validateLicense,
  generateKey,
  parseKey,
  isFormatValid,
  ERROR_MESSAGES,
};

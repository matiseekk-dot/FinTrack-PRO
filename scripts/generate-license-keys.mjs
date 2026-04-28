#!/usr/bin/env node
/**
 * Generator kluczy licencyjnych FinTrack PRO.
 *
 * Użycie:
 *   node scripts/generate-license-keys.mjs yearly 100   # 100 yearly keys
 *   node scripts/generate-license-keys.mjs lifetime 50  # 50 lifetime keys
 *   node scripts/generate-license-keys.mjs trial 10     # 10 trial keys
 *
 * Klucze trafiają na stdout - przekieruj do pliku:
 *   node scripts/generate-license-keys.mjs yearly 100 > keys-yearly-batch1.txt
 *
 * Te klucze następnie wgrywasz do Gumroad jako "license keys" przy konfiguracji
 * produktu. Każdy zakup = jeden klucz wysyłany kupującemu mailem.
 *
 * UWAGA: SECRET musi być IDENTYCZNY z tym w src/lib/license.js. Jeśli zmienisz
 * w jednym miejscu, ZMIEŃ W OBU - inaczej wygenerowane klucze nie przejdą walidacji
 * w aplikacji.
 */

import { webcrypto } from "node:crypto";

// MUSI być identyczny z src/lib/license.js
const SECRET = "ft-license-v1-7b3d9a2c8e1f4056b9ad3e5c8f7d2a1b";

const B32_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PREFIX_TYPE = { yearly: "Y", lifetime: "L", trial: "T" };

async function hmacTag(message) {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await webcrypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += B32_ALPHABET[bytes[i] % B32_ALPHABET.length];
  }
  return out;
}

function randomB32(len) {
  const bytes = webcrypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += B32_ALPHABET[bytes[i] % B32_ALPHABET.length];
  return out;
}

async function generateKey(type) {
  const typeChar = PREFIX_TYPE[type];
  if (!typeChar) throw new Error(`Unknown type: ${type}. Use yearly/lifetime/trial.`);
  const body = `${randomB32(5)}-${randomB32(5)}`;
  const tag = await hmacTag(`FT-${typeChar}-${body}`);
  return `FT-${typeChar}-${body}-${tag}`;
}

async function main() {
  const [, , type, countRaw] = process.argv;
  if (!type || !countRaw) {
    console.error("Usage: node scripts/generate-license-keys.mjs <yearly|lifetime|trial> <count>");
    process.exit(1);
  }
  const count = parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count < 1 || count > 10000) {
    console.error("Count must be between 1 and 10000");
    process.exit(1);
  }
  for (let i = 0; i < count; i++) {
    const key = await generateKey(type);
    console.log(key);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

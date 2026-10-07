// Zapytania do serwisów, które nie wpuszczają przeglądarki (CORS): Biblioteka Narodowa (polskie
// książki), baza kodów produktów UPCitemdb (gry i inne), notowania Yahoo Finance (ETF-y i akcje).
//   • aplikacja na Androida — zapytanie natywne (CapacitorHttp), CORS nie obowiązuje;
//   • przeglądarka — przez serwer pośredniczący (server/lookup-proxy.js), jeśli build ma VITE_LOOKUP_PROXY;
//   • bez żadnego z nich — null (wołający pokazuje, że to działa w aplikacji).

import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./native.js";

const PROXY = (import.meta.env && import.meta.env.VITE_LOOKUP_PROXY) || "";
const canReachRestricted = isNative || !!PROXY;

/** GET do serwisu bez CORS. JSON (albo tekst), null przy 4xx/5xx; błąd sieci leci dalej. */
async function getRestricted(url, { type = "json", timeout = 10000 } = {}) {
  if (isNative) {
    const r = await CapacitorHttp.get({
      url, headers: { "User-Agent": "Mozilla/5.0 (Linux; Android) Sidegig" },
      responseType: type === "json" ? "json" : "text", connectTimeout: timeout, readTimeout: timeout,
    });
    if (!r || r.status >= 400) return null;
    if (type === "json" && typeof r.data === "string") { try { return JSON.parse(r.data); } catch { return null; } }
    return r.data;
  }
  if (!PROXY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return type === "json" ? await res.json() : await res.text();
  } finally { clearTimeout(timer); }
}

export { canReachRestricted, getRestricted };

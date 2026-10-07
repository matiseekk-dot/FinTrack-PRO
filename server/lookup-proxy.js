// Serwer pośredniczący dla wersji przeglądarkowej Sidegig (Cloudflare Workers — darmowy plan wystarcza).
//
// Po co: Biblioteka Narodowa (polskie książki), UPCitemdb (gry i inne produkty) i Yahoo Finance
// (ceny ETF-ów i akcji) nie pozwalają przeglądarce pytać się bezpośrednio (CORS). Aplikacja na
// Androida pyta je sama; strona www — przez ten worker. Przepuszcza tylko GET do tych serwisów
// i tylko dla stron Sidegig. Nic nie zapisuje.
//
// Uruchomienie (raz):
//   1. Darmowe konto na cloudflare.com, potem: npx wrangler login
//   2. npx wrangler deploy server/lookup-proxy.js --name sidegig-proxy --compatibility-date 2026-10-01
//   3. Adres workera (https://sidegig-proxy.<konto>.workers.dev) jako zmienna VITE_LOOKUP_PROXY
//      w buildzie strony (GitHub → Settings → Secrets and variables → Actions → Variables).

const ALLOWED_HOSTS = ["data.bn.org.pl", "api.upcitemdb.com", "query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const ALLOWED_ORIGINS = ["https://matiseekk-dot.github.io", "http://localhost:5174", "http://localhost:5173"];

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("method not allowed", { status: 405, headers: cors });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response("forbidden", { status: 403, headers: cors });

    let target;
    try { target = new URL(new URL(request.url).searchParams.get("url") || ""); }
    catch { return new Response("bad url", { status: 400, headers: cors }); }
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response("forbidden", { status: 403, headers: cors });
    }

    const res = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Sidegig)", "Accept": "application/json, text/plain, */*" },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, "Content-Type": res.headers.get("Content-Type") || "application/json", "Cache-Control": "public, max-age=300" },
    });
  },
};

// FinTrack PRO — Service Worker
//
// v1.4 (2026-05-09): rewrite po audicie. Wcześniej SW był aktywnie wyrejestrowywany
// przez index.html ze względu na "stale cache issues" — co oznaczało że PWA nie
// miała offline mode mimo że plik istniał. Teraz:
//   - CACHE_NAME zawiera wersję apki (z __APP_VERSION__ w build albo "dev")
//   - HTML i JS bundles → Network First z fallback do cache (najnowsza wersja zawsze
//     jeśli online, offline = ostatnia działająca)
//   - Tylko hash-named assety (chunki Vite z hash w nazwie) → Cache First
//   - Stare cache (z innej wersji) automatycznie sprzątane w activate
//
// Skutek: użytkownik dostaje najnowszą apkę gdy ma net, ostatnią cache'owaną
// gdy nie ma. Zero "stale cache" bo HTML zawsze idzie network-first.

const VERSION = "__APP_VERSION__"; // build-time replace lub "dev" w runtime
const CACHE_NAME = `fintrack-pro-${VERSION}`;
const STATIC_ASSETS = [
  "/FinTrack-PRO/",
  "/FinTrack-PRO/index.html",
  "/FinTrack-PRO/manifest.json",
  "/FinTrack-PRO/icon.svg",
  "/FinTrack-PRO/icon-192.png",
  "/FinTrack-PRO/icon-512.png",
];

// Install — pre-cache podstawowych zasobów. Pojedyncze cache.add żeby jeden
// 404 nie zwalił całej instalacji.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try { await cache.add(asset); }
        catch (err) { console.warn("[SW] Failed to cache", asset, err?.message || err); }
      }
    })
  );
  self.skipWaiting();
});

// Activate — wyczyść stare cache (z innych wersji) + przejmij klientów
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache First — dla immutable hash-named assetów (np. /assets/index-abc123.js)
const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
    }
    return response;
  } catch (_) {
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
};

// Network First — dla HTML, JS bez hash, JSON. Cache jako fallback offline.
const networkFirst = async (request, fallbackPath) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503 });
  }
};

// Czy URL wygląda na immutable hash-named asset? (Vite gen: index-AbCd1234.js)
function isImmutableAsset(url) {
  if (url.pathname.endsWith(".png") || url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".woff2") || url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".ico")) return true;
  // Vite chunk: /assets/{name}-{hash}.{js|css}
  if (/\/assets\/.+-[A-Za-z0-9_]{8,}\.(js|css)$/.test(url.pathname)) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pomiń: non-GET, Firebase / Google APIs, cross-origin
  if (request.method !== "GET") return;
  if (url.hostname.includes("firebase") ||
      url.hostname.includes("googleapis") ||
      url.hostname.includes("gstatic") ||
      url.hostname.includes("identitytoolkit") ||
      url.hostname.includes("nbp.pl")) return; // NBP API — fresh always
  if (url.origin !== self.location.origin) return;

  // 1. Immutable assets (hashed JS/CSS, ikony) → Cache First
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 2. HTML navigation → Network First z fallback do index.html
  if (request.mode === "navigate" ||
      request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request, "/FinTrack-PRO/index.html"));
    return;
  }

  // 3. Reszta (np. manifest.json, /assets bez hash) → Network First
  event.respondWith(networkFirst(request));
});

// Push (FCM) — placeholder, działa gdy notifications.js skonfiguruje VAPID
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "FinTrack PRO", {
        body: data.body || "",
        icon: "/FinTrack-PRO/icon-192.png",
        badge: "/FinTrack-PRO/icon-192.png",
        tag: data.tag || "fintrack",
        data: { url: data.url || "/FinTrack-PRO/" },
      })
    );
  } catch (_) {}
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/FinTrack-PRO/";
  event.waitUntil(self.clients.openWindow(url));
});

// Komunikacja z klientem — pozwala main thread wymusić skipWaiting po deployu
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

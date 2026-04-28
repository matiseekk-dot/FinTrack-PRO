// FinTrack PRO — Service Worker (production-ready offline-first)
// v1.2.7 K4 audit fixy:
//   - addAll → indywidualne add z error logging (jeden 404 nie blokuje całego cache)
//   - manifest.json explicitly cached (Cache First)
//   - return po każdym respondWith (clarity)
//   - osobny branch dla nie-HTML/nie-asset requestów
//   - explicit self.clients zamiast global

const CACHE_NAME = "fintrack-pro-v7";
const STATIC_ASSETS = [
  "/FinTrack-PRO/",
  "/FinTrack-PRO/index.html",
  "/FinTrack-PRO/manifest.json",
  "/FinTrack-PRO/icon.svg",
];

// Instalacja — cache statycznych zasobów. Indywidualne add żeby jeden 404 nie zwalił całego cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          // Loguj ale nie przerywaj - jeden zepsuty asset nie powinien blokować PWA
          console.warn("[SW] Failed to cache", asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Aktywacja — wyczyść stary cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Helper: Cache First strategy
const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, clone).catch(() => {}); // ignoruj błędy quota
    }
    return response;
  } catch (err) {
    // Brak network + brak cache = błąd (np. nigdy nie odwiedzony asset)
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
};

// Helper: Network First z fallbackiem do cache (dla HTML)
const networkFirst = async (request, fallbackPath) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, clone).catch(() => {});
    }
    return response;
  } catch (err) {
    // Network down → zwróć z cache, lub fallback do index.html dla SPA routes
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503 });
  }
};

// Fetch handler — routing per typ requestu
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pomiń:
  //   - non-GET (POST/PUT/DELETE - na razie brak background sync)
  //   - Firebase API (sync data, nie powinno być cache'owane)
  //   - Google Analytics, Identity itd.
  //   - cross-origin (manifest, fonty zewn. - browser sam obsłuży)
  if (request.method !== "GET") return;
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("identitytoolkit")
  ) return;
  if (url.origin !== self.location.origin) return;

  // 1. Statyczne assety (JS, CSS, ikony) → Cache First, immutable po deployu
  if (
    url.pathname.includes("/assets/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith("manifest.json")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 2. HTML (navigation requests) → Network First, fallback cache → fallback index.html
  if (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(networkFirst(request, "/FinTrack-PRO/index.html"));
    return;
  }

  // 3. Wszystko inne (np. JSON config, fonty self-hosted) → Network First bez fallbacku
  event.respondWith(networkFirst(request));
});

// Push notification handler (dla FCM)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "FinTrack PRO", {
        body: data.body || "",
        icon: "/FinTrack-PRO/icon.svg",
        badge: "/FinTrack-PRO/icon.svg",
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

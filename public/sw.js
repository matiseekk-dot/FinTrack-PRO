// FinTrack PRO — Service Worker
// Zapewnia podstawową obsługę offline i cache

const CACHE_NAME = "fintrack-pro-v5"; // bumped to clear old cache
const STATIC_ASSETS = [
  "/FinTrack-PRO/",
  "/FinTrack-PRO/index.html",
  "/FinTrack-PRO/manifest.json",
  "/FinTrack-PRO/icon.svg",
];

// Instalacja — cache statycznych zasobów
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignoruj błędy cache na dev
      });
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
    )
  );
  self.clients.claim();
});

// Fetch — Cache First dla zasobów statycznych, Network First dla reszty
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pomiń requestów do Firebase i zewnętrznych API
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("google") ||
    url.hostname.includes("googleapis") ||
    request.method !== "GET"
  ) {
    return;
  }

  // Cache First dla statycznych zasobów (JS, CSS, ikony)
  if (
    url.pathname.includes("/assets/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network First dla HTML — żeby zawsze mieć najnowszą wersję
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/FinTrack-PRO/index.html"))
    );
  }
});

// Push notification handler
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
  } catch(_) {}
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/FinTrack-PRO/";
  event.waitUntil(clients.openWindow(url));
});

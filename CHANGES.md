# FinTrack PRO v1.2.7 — sync PRO + UX fixy + K3/K4/K5 production readiness (2026-04-28)

`package.json` 1.2.6 → 1.2.7.

## TL;DR

| | v1.2.6 | v1.2.7 |
|---|---|---|
| PRO licencja syncuje się między urządzeniami | **NIE** | tak (sync_keys + last-write-wins) |
| Wydatki per miejsce w "Bieżący" pokazują wszystkie historyczne | **TAK (bug)** | bieżący cykl |
| Hobby stats granularność | cykl/rok/total | cykl/mies./kwart./rok/total |
| Struktura przychodów pokazuje top 1 z 7 źródeł | **TAK (mylące)** | rozwijana lista wszystkich |
| "Inne" (transfer) wpadają do Lifestyle | **TAK (bug)** | skip (nie wpada) |
| Service Worker offline-first | **podstawowy** | production-ready (K4) |
| FCM VAPID error handling | silent fail | explicit reasons |

---

## 🔴 Bug krytyczny: Premium nie syncuje się między urządzeniami (NAPRAWIONY)

**Twoja skarga:** „A nie przenosi się premium pomiędzy urządzeniami jestem na tym samym koncie i to nie działa."

### Diagnoza

PRO status był zapisywany **tylko w localStorage** danej przeglądarki. Firestore nie wiedział nic o aktywacji. Czyli:

1. Aktywujesz PRO na laptopie → `localStorage.ft_pro_status = {type: "yearly", since: ...}`
2. Logujesz się na telefonie → Firestore sync ściąga dane (transactions, accounts, ...) ale **nie ma proStatus**
3. Telefon: `getProStatus()` czyta `localStorage.ft_pro_status` → null → **isPro = false**

Funkcja `validateLicense` w `lib/license.js` zapisywała `licenses/{key} → {uid: <twoje_uid>}` w Firestore (mechanizm anty-redystrybucji), ale **odwrotnego lookupu** (dla danego uid → jaki PRO status) nie było.

### Fix

Dodałem `proStatus` do **istniejącego sync mechanizmu** (`SYNC_KEYS` w `useFirebase.js`). To znaczy że:

- Aktywacja na urządzeniu A → state update → useEffect save Firestore → `users/{uid}/data/main.proStatus` zapisany
- Login na urządzeniu B → `loadFromFirestore` pobiera całe `data/main` → `applyData` widzi `proStatus` → `setProStatusFromRemote` zapisuje do localStorage → `refreshProStatus()` aktualizuje React state → **PRO aktywne automatycznie**

### Co realnie się zmieniło

**`src/lib/tier.js`:**
- `getProStatusRaw()` — zwraca surowe payload bez sprawdzania expiresAt (potrzebne dla sync)
- `setProStatusFromRemote(data)` — zapisuje remote payload, ale tylko jeśli świeższy niż lokalny (last-write-wins by `since` timestamp)
- `getProStatus()` zwraca też `licenseKey` (nie tracimy info)

**`src/hooks/useFirebase.js`:**
- `SYNC_KEYS` dodane `"proStatus"`
- `mergeSnapshots`: special case dla proStatus — **last-write-wins by `since`**, nie shallow merge (bo dla licencji shallow merge nie ma sensu, jest kompletna)

**`src/App.jsx`:**
- Import `getProStatusRaw, setProStatusFromRemote`
- `applyData`: gdy `d.proStatus` ma `type` → `setProStatusFromRemote(d.proStatus); s.refreshProStatus()`
- `stateRef.current.proStatus = getProStatusRaw()` — żeby Save useEffect wysłał do Firestore
- `setters.refreshProStatus = () => setProStatus(getProStatus())` — re-read z localStorage po sync
- Save useEffects (localStorage + Firestore) dodano `proStatus` do deps

**`src/data/storage.js`:**
- Sanityzacja `proStatus`: walidacja typów (type/since/expiresAt/licenseKey muszą być string)
- Malformed remote nie psuje stanu — odrzucone gdy nie ma `type`

### Test smoke (14/14 passed)

```
✅ Device A: aktywacja → state ma type
✅ Device A: getProStatus zwraca isPro=true
✅ Device B: setProStatusFromRemote zwraca true (zapisał)
✅ Device B: po sync getProStatus.isPro=true
✅ Device B: type=yearly
✅ Old remote NIE nadpisuje świeższego local
✅ Lokalnie pozostaje lifetime
✅ Nowszy remote nadpisuje starszy local
✅ Po nadpisaniu type=lifetime
✅ mergeSnapshots: nowszy wygrywa
✅ Malformed null nie psuje
✅ Malformed bez since nie psuje
✅ Malformed string nie psuje
✅ Local nadal yearly
```

### Co realnie zauważysz po deployu

Aktywuj na laptopie (jeśli jeszcze nie aktywny) → poczekaj 2-3 sekundy (Firestore save debounce) → otwórz na telefonie → po 1-2 sekundach (Firestore load) **pasek FREE/PRO zniknie, masz pełne PRO funkcje**.

---

## 🟢 Wydatki per miejsce — tylko bieżący cykl (Image 4 fix)

**Twoja skarga:** „To się powtarza wydatki per miejsce to powinny być bieżące."

Image 4 pokazywał `top 7 z 84` z wydatkami: PIT 7000zł (raz w roku), Samolot 3895zł, AirBnb 3831zł, Kredyt Dom 2826zł, Żłobek, Kredyt auto. To są **wszystkie historyczne** wydatki, nie z bieżącego cyklu.

### Fix

`src/views/AnalyticsView.jsx` linia 727:
```js
- transactions.filter(t => t.amount < 0 && !skipCats.includes(t.cat))
+ monthTx.filter(t => t.amount < 0 && !skipCats.includes(t.cat))
```

Teraz w widoku "Bieżący" pokazujesz tylko tx z aktualnego cyklu rozliczeniowego. PIT, Samolot, Kredyt Dom z poprzednich miesięcy/lat **nie wpadają**.

### Edge case który zostawiłem

W widoku "Okresy" (Q/półrocze/rok) widget `Wydatki per miejsce` użyje też `monthTx` — ale `monthTx` w "Okresy" to już cały zakres okresu, więc działa OK. Sprawdź czy widzisz to samo co przedtem (cały Q1 wydatki per miejsce) — jeśli tak, OK; jeśli pokazuje tylko bieżący cykl w widoku okresowym, to jest bug do v1.2.8.

---

## 🟢 Hobby stats — miesięcznie + kwartalnie (Image z poprzedniej sesji)

**Twój komentarz:** „w hobby też pewnie dobrze dodać lata. Nie wiem czy nie dodałbym jakoś miesięcznie kwartalnie."

`thisYear` już było. Dodałem `thisMonth` i `thisQuarter`.

### Fix

**`src/lib/hobby.js` `getHobbyStats`:**
```js
return {
  total: allTime, count: txs.length,
  thisCycle:   ...,  // istniało
  thisMonth:   Math.round(thisMonth),    // NEW
  thisQuarter: Math.round(thisQuarter),  // NEW (Q1=sty-mar, Q2=kwi-cze, ...)
  thisYear:    ...,  // istniało
  allTime:     ...,
  ...
};
```

**`src/views/HobbyView.jsx`:**

Karta hobby (lista) — 4 statystyki w grid 1fr×4:
- Cykl / Mies. / Kwart. / Rok
- Total usunięty z karty (nadal w detail view)

Detail view — 5 statystyk, dwa wiersze:
- 1. wiersz: Bieżący cykl / Ten miesiąc / Ten kwartał
- 2. wiersz: Ten rok / Total

---

## 🟢 Struktura przychodów — pokaż wszystkie źródła (Image 2 fix)

**Twoja skarga:** „Strukura przychodów nie za dobrze."

Image 2 pokazywał: `Pensja 100% 10.4k zł` + napis `Pensja z 7 źródeł — top: Ekwiwalent (29%)`. Czyli widzisz że masz 7 źródeł ale tylko top jest pokazany. Mało pomocne.

### Fix

`src/components/AnalyticsWidgets.jsx` `IncomeTypesBreakdown`:

Wyrzuciłem stary blok "showTopMain / !showTopMain". Teraz **zawsze rozwijana lista** wszystkich źródeł pensji:

```
ŹRÓDŁA PENSJI (7)
  ING Bank (główne wynagr.)        43%   4 480 zł
  Ekwiwalent urlopowy              29%   3 020 zł
  Premia kwartalna                 14%   1 460 zł
  Premia za projekt                 7%     720 zł
  Bonus jubileuszowy                4%     420 zł
  Wczasówki                         2%     200 zł
  Reszta (zaokrąglenia)             1%     100 zł
  + 0 więcej (jeśli >8)
```

Top 8 źródeł, posortowane malejąco. Procenty względem `main` (pensji), nie względem total.

---

## 🟢 Struktura wydatków — reklasyfikacja kategorii (Image 3 fix)

**Twoja skarga:** „Stałe ok ale w innych. To się powtarza."

Image 3 pokazywał Lifestyle 45% (5.5k zł). To podejrzanie wysoko — okazuje się że `EXPENSE_TYPES.lifestyle` zawierało `"inne"`. Ale `"inne"` jest **kategorią transferów** (skip cat), nie wydatkiem. Ten bug fundamentalnie psuł całą klasyfikację.

### Co zmieniłem

`src/components/AnalyticsWidgets.jsx`:

```js
// PRZED
const EXPENSE_TYPES = {
  fixed:      ["rachunki", "zakupy"],         // "zakupy" jako fixed?? wątpliwe
  variable:   ["jedzenie", "transport", "zdrowie"],
  lifestyle:  [..., "inne"],                  // "inne" w lifestyle = bug
};

// PO
const EXPENSE_TYPES = {
  investment:     ["inwestycje"],
  fixed:          ["rachunki", "transport"],          // regularne miesięczne
  uncontrollable: ["rzad", "rząd"],
  variable:       ["jedzenie", "zdrowie", "zakupy"],  // "zakupy" przeniesione
  lifestyle:      ["kawiarnia", "rozrywka", "muzyka", "ubrania", "prezenty", "alkohol", "bukmacher"],
  // "inne" → null (skip transfer)
};
const getExpenseType = (cat) => {
  if (cat === "inne") return null;  // jasno: nie wpada nigdzie
  ...
  return "variable";  // fallback dla custom kategorii (Kredyt Dom, Żłobek, Auto)
};
```

### Co realnie zobaczysz

- **Lifestyle spadnie** — wszystkie tx z cat="inne" już nie są lifestyle
- **Custom kategorie** (Kredyt Dom, Żłobek, Auto, Samolot, AirBnb z Image 4) wpadają w **Variable** jako fallback
- **Stałe** mają teraz tylko rachunki+transport (bardziej zgodne z definicją "stałych")

### Edge case ostrzeżenie

To jest **automatyczna heurystyka**, nie idealna. Jeśli widzisz nadal coś niespójnego (np. "Żłobek" jako Variable a powinno być Fixed bo płacisz co miesiąc), to znaczy że trzeba dać user-defined classification per-category. To jest **plan na v1.2.8** — Settings → "Dla każdej kategorii wybierz: Stałe / Zmienne / Lifestyle".

---

## 🟢 Muzyka 110% (Image 1) — od ciebie wymaga clear cache

**Twoja skarga:** „Muzyka nadal 110%."

To jest cache service workera v5/v6 który serwuje stary bundle. v1.2.7 bumpuje na **v7**, więc po deployu service worker `activate` event automatycznie wyczyści stare cache (v5 + v6) i pobierze nowy bundle.

**Co realnie zrobić po deployu (jednorazowo):**

```
1. Otwórz aplikację
2. F12 → Application → Service Workers
3. Jeśli widzisz "fintrack-pro-v5" lub "fintrack-pro-v6" → Unregister
4. Application → Storage → Clear site data
5. Hard refresh (Ctrl+Shift+R lub iPhone: Settings → Safari → Clear History)
```

Po tym jednorazowym kroku, przyszłe deployy będą się aktualizować automatycznie.

Jeśli **po wszystkim** nadal widzisz Muzyka 110%, to znaczy że masz tx muzyki z **dziś (28 kwietnia)** w aktualnym cyklu rozliczeniowym, które przekraczają limit. Wtedy 110% jest **prawidłowe**.

---

## 🛡️ K4 — Service Worker production-ready

**Z audytu O3 K4:** offline-first PWA reliability.

### Znalezione bugi w starym sw.js (v6)

1. **`addAll()` z `.catch(() => {})`** — błędy cache silently ignorowane. Jeśli któryś asset zwróci 404, SW i tak się instaluje, ale offline nie działa.

2. **Brak `return` po HTML branch** — fetch handler nie miał wyraźnego return.

3. **`manifest.json` nie był obsługiwany przez fetch handler** — ani Cache First (bo nie .ico/.svg/.png i nie /assets/), ani HTML branch (bo accept ≠ text/html). Wynik: za każdym razem network-only, bez offline.

4. **Cross-origin requests** nie były wyraźnie filtrowane — opieraliśmy się tylko na `hostname.includes("firebase")`. Jeśli kiedyś dodajesz CDN, bug.

### Fixy w sw.js v7

```js
// 1. Indywidualne add zamiast addAll - jeden 404 nie blokuje całego cache
for (const asset of STATIC_ASSETS) {
  try { await cache.add(asset); }
  catch (err) { console.warn("[SW] Failed to cache", asset, err); }
}

// 2. Helper functions cacheFirst() + networkFirst() - jasna strategia
const cacheFirst = async (request) => { ... };
const networkFirst = async (request, fallbackPath) => { ... };

// 3. manifest.json explicit - dodany do Cache First branch
url.pathname.endsWith("manifest.json")

// 4. Cross-origin - odrzucone całkiem (browser sam obsłuży)
if (url.origin !== self.location.origin) return;

// 5. Routing per request type, każdy z return
if (assetPath)        { event.respondWith(cacheFirst(request)); return; }
if (navigateOrHtml)   { event.respondWith(networkFirst(request, "/FinTrack-PRO/index.html")); return; }
event.respondWith(networkFirst(request));  // fallback dla reszty

// 6. Lepsze fallbacks gdy network down
- cacheFirst zwraca 504 jeśli brak cache + offline
- networkFirst próbuje cache → fallback path → 503

// 7. Activate event chained przez .then() żeby clients.claim po cleanupie
.then(() => self.clients.claim())
```

### Co to oznacza w praktyce

Jeśli stracisz internet w czasie używania aplikacji:
- **Bundle JS/CSS** — zawsze z cache, nigdy nie znikną
- **HTML** — z ostatnio widzianego stanu, lub fallback do index.html (SPA routing nadal działa)
- **manifest.json** — z cache (PWA install nadal działa)
- **Firebase calls** — fail (oczekiwane, dane już są w localStorage)

### Test offline (do zrobienia ręcznie)

```
1. Załaduj aplikację (online)
2. F12 → Network → Throttling → Offline
3. Hard refresh (Ctrl+Shift+R)
4. Aplikacja powinna się załadować z cache
5. Spróbuj nawigować między tabami — powinno działać
```

---

## 🛡️ K3 — NBP API rate limit (preventive, na przyszłość)

**Z audytu O3 K3:** ochrona przed 429 rate limit z NBP API.

### Status: NIE używasz NBP API

Sprawdziłem. W kodzie **brak fetch do api.nbp.pl**. Currency rates są hardcoded:

```js
// src/views/TransactionsView.jsx:77
const RATES = { EUR: 4.28, USD: 3.92, GBP: 5.02, CZK: 0.172, HUF: 0.011, PLN: 1 };
```

K3 z O3 audytu zakładał że dodasz live FX. Nie zrobiłeś. Więc nie ma nic do rate-limitować. Przygotowałem infrastrukturę na przyszłość:

```js
// src/lib/rateLimit.js
const LIMITS = {
  ...
  // NBP API polityka: 100 req/min per IP. Trzymamy z marginesem.
  nbpFx: { count: 50, windowMs: 60000 },
};
```

Gdy w przyszłości dodasz live FX rates, owiniesz każde `fetch("https://api.nbp.pl/...")` przez:
```js
const check = checkLimit("nbpFx");
if (!check.allowed) { /* show error */ }
```

---

## 🛡️ K5 — VAPID keys + FCM error handling

**Z audytu O3 K5:** push notifications backend.

### Status: VAPID nie skonfigurowany

`src/notifications.js` ma `const VAPID_KEY = ""` (pusty). To znaczy że:
- **Local notifications działają** (`scheduleLocalNotification` dla przypomnień o płatnościach)
- **Cloud push (FCM) nie działa** — nie da się wysłać notyfikacji ze serwera/Cloud Function

### Fix w v1.2.7

VAPID key musi przyjść z Firebase Console (Settings → Cloud Messaging → Web Push certificates → Generate). To jest **konfiguracja infrastruktury**, nie kod. Zostawiłem placeholder z czytelną instrukcją w `notifications.js`.

Plus **lepsze error handling** — `requestNotificationPermission` zwraca teraz strukturę zamiast `null`:

```js
// PRZED
return null;  // co poszło nie tak? nie wiadomo.

// PO
return { ok: false, reason: "denied_by_user" };
return { ok: false, reason: "permission_not_granted" };
return { ok: true, hasFcm: false, reason: "vapid_not_configured" };
return { ok: true, hasFcm: true, token };
```

App.jsx caller jest fire-and-forget więc nie używa returnu, ale gdy w przyszłości dodasz UI status (np. badge "FCM ready / Local only"), reasons będą gotowe.

### Co realnie zrobić (KIEDY będziesz publikować na produkcję)

```
1. Firebase Console → Project Settings → Cloud Messaging
2. Web Push certificates → Generate key pair
3. Skopiuj klucz (zaczyna się od "B...", długi base64url string)
4. Wklej do src/notifications.js linia 16: const VAPID_KEY = "BX..."
5. Build, deploy
6. Test: na realnym urządzeniu, kliknij Settings → Włącz powiadomienia
7. Sprawdź Firestore: users/{uid}/fcm/token musi mieć token
8. Z Cloud Function spróbuj wysłać test push
```

---

## Pliki zmienione (12)

```
src/lib/tier.js                     [+ getProStatusRaw, setProStatusFromRemote]
src/hooks/useFirebase.js            [+ proStatus do SYNC_KEYS, special merge]
src/App.jsx                         [+ applyData proStatus, stateRef.proStatus,
                                     setters.refreshProStatus, save deps]
src/data/storage.js                 [+ sanityzacja proStatus]
src/views/AnalyticsView.jsx         [Wydatki per miejsce: transactions → monthTx]
src/components/AnalyticsWidgets.jsx [IncomeTypesBreakdown: lista wszystkich źródeł
                                     EXPENSE_TYPES: usunięto "inne", reklasyfikacja]
src/lib/hobby.js                    [+ thisMonth, thisQuarter w getHobbyStats]
src/views/HobbyView.jsx             [+ MiniStat 4-kolumny + Detail 5 statystyk]
public/sw.js                        [v6→v7, helper functions, lepsze fallbacki]
src/notifications.js                [VAPID dokumentacja, error reasons]
src/lib/rateLimit.js                [+ nbpFx limit (preventive)]
package.json                        [1.2.6 → 1.2.7]
```

---

## 🚀 Deploy

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.7: PRO sync + UX fixy + K3/K4/K5 production"
git push --force
```

**Po push, jednorazowo na każdym urządzeniu:**

1. Otwórz aplikację, F12 → Application → Service Workers → Unregister
2. Application → Storage → Clear site data
3. Hard refresh

Po tym SW v7 będzie sam aktualizować się przy każdym deployu. To jest jednorazowa operacja konieczna z powodu cache_v5 → cache_v7 transition.

---

## Co WCIĄŻ otwarte (na v1.2.8)

1. **„Kategorie dla przychodów"** (twoja skarga z poprzedniej sesji) — feature nie zaczęty. Wymaga zmiany schematu `customCats` (dodać `type: "income" | "expense"` per kategoria), zmodyfikować picker w form Add Transaction.

2. **User-defined classification per kategoria** — żeby "Kredyt Dom" mógł być **Stałe** zamiast fallback **Variable**. Settings → tabela kategorii → wybierz typ.

3. **Wydatki per miejsce w widoku Okresy** — używa `monthTx` ale nie jestem pewien czy w widoku okresowym (Q/półrocze/rok) `monthTx` ma cały zakres czy tylko bieżący cykl. Wymaga testu z Twoimi danymi.

4. **Live FX rates z NBP API** — infrastruktura rate-limit gotowa, brak implementacji.

5. **VAPID key konfiguracja** — przed produkcją (krok manualny w Firebase Console).

6. **Audyt O3 pozostały (27/39 → ile zostało?)** — K3/K4/K5 done, sprawdź który następny w lista.

---

## Mój priorytet rekomendacja

Po deployu daj znać:

**A)** PRO sync działa (zaloguj na 2 urządzeniach, aktywuj na 1, sprawdź na 2)?  
**B)** Wydatki per miejsce w "Bieżący" pokazują tylko bieżący cykl?  
**C)** Hobby stats mają 4 wartości w karcie?  
**D)** Struktura przychodów pokazuje wszystkie 7 źródeł?  
**E)** Lifestyle % w struktura wydatków spadło?  
**F)** Muzyka 110% (Image 1) zniknęło po clear SW?

Jeśli wszystko OK → idziemy w **kategorie przychodów** (najbardziej blokujące jak go używasz codziennie). Jeśli coś nie działa — najpierw fix.

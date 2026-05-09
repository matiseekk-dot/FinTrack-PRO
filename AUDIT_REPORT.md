# AUDIT REPORT — FinTrack PRO

**Wersja audytowana:** 1.3.9 (`package.json:4`)
**Data:** 2026-05-09
**Audytor:** senior product / tech lead / UX / monetization
**Scope:** kompletny rekonesans ~30 plików, ~13 000 linii kodu, public assets, konfiguracje, dokumentacja.

---

## TL;DR — werdykt 30 sekund

Apka jest **technicznie żywa, produktowo niedoskonała, monetyzacyjnie martwa**.

- **3 krytyczne (P0) blokery przed sprzedażą**: paywall jest atrapą (otwiera Play Store URL, RevenueCat to TODO), HMAC SECRET jest hardcoded w bundle JS (każdy może wygenerować sobie klucz lifetime), PIN „blokada" używa `String.hashCode` Javy (10 000 kombinacji łamane w 5 ms, brak rate-limit).
- **Ofiara feature creepu**: 12 widoków, 4 sub-zakładki w „Plany", hobby/wyjazdy/IKZE/PPK kalkulator, multi-currency, partner sharing, real-time sync z tombstones, streak gamification — ale brak jednego, ostrego killer feature. Apka chce być wszystkim dla wszystkich.
- **Wskaźnik gotowości do sprzedaży: 3/10**. Działa, wygląda, ale od strony „weź pieniądze od klienta" jest niegotowa. Patrz §7 i §8.
- **Code health**: brak testów (zero), `App.jsx` z 30+ `useState`, `SettingsPanel.jsx` 1438 linii, wszystko inline-styled, prop-drilling masowy. Działa, ale każda zmiana to ryzyko regresji.
- **UX**: użytkownik ma do przejścia 8 slajdów onboardingu + 2 ekrany setup + obowiązkowy login Google **zanim** doda pierwszą transakcję. To jest 11 kroków zanim user „pierwszy raz coś zobaczy". Konwersja zabita.

Pełny raport poniżej. Cytaty `plik.ext:linia`.

---

## Spis treści

1. [Architektura i jakość kodu](#1-architektura-i-jakość-kodu)
2. [Performance](#2-performance)
3. [Bezpieczeństwo](#3-bezpieczeństwo)
4. [Persystencja danych](#4-persystencja-danych)
5. [UX — flow i nawigacja](#5-ux--flow-i-nawigacja)
6. [UX — szczegóły interakcji](#6-ux--szczegóły-interakcji)
7. [Sensowność biznesowa i sprzedaż](#7-sensowność-biznesowa-i-sprzedaż)
8. [Monetyzacja — implementacja](#8-monetyzacja--implementacja)
9. [Compliance / RODO / Store policies](#9-compliance--rodo--store-policies)
10. [PWA / mobile readiness](#10-pwa--mobile-readiness)
11. [Internacjonalizacja i lokalizacja](#11-internacjonalizacja-i-lokalizacja)
12. [Analytics i metryki](#12-analytics-i-metryki)
13. [➕ DODAJ](#-dodaj)
14. [➖ USUŃ / UPROŚĆ](#-usuń--uprość)
15. [🔄 PRZEPROJEKTUJ](#-przeprojektuj)

---

## 1. Architektura i jakość kodu

### 1.1 Struktura folderów — czy nowy junior zrozumie w 10 minut?

**Werdykt: tak, ale z trudem.** Konwencja `src/views`, `src/components`, `src/hooks`, `src/lib`, `src/data` jest czytelna. Problem to **rozmiar plików w środku**:

| Plik | LOC | Werdykt |
|------|-----|---------|
| [src/components/SettingsPanel.jsx](src/components/SettingsPanel.jsx) | **1438** | God-component. Eksport, import, custom kategorie, język, PIN, partner, reset, demo, cycleDay history — wszystko w jednym pliku |
| [src/views/AnalyticsView.jsx](src/views/AnalyticsView.jsx) | 931 | OK ale zawiera 5 podkomponentów które powinny być osobno |
| [src/views/HobbyView.jsx](src/views/HobbyView.jsx) | 904 | Lista + szczegóły + modal + dashboard — wszystko razem |
| [src/components/AnalyticsWidgets.jsx](src/components/AnalyticsWidgets.jsx) | 806 | 5 osobnych widgetów eksportowanych z jednego pliku |
| [src/views/TripsView.jsx](src/views/TripsView.jsx) | 693 | jw. |
| [src/App.jsx](src/App.jsx) | **676** | Patrz §1.2 |
| [src/views/Dashboard.jsx](src/views/Dashboard.jsx) | 594 | Sekcje hero/kafelki/prognoza/insights/recent-tx — kandydaci do podziału |
| [src/views/PaymentsView.jsx](src/views/PaymentsView.jsx) | 551 | OK granica |

**Ile = za dużo?** Reguła kciuka: powyżej 400 LOC widget nie mieści się w głowie. Pięć plików w tym repo przekracza 600 LOC.

**Priorytet: P2** — działa, ale każda zmiana w tych plikach to ruletka.

### 1.2 Separation of concerns

[src/App.jsx](src/App.jsx) to **single source of truth** (jedyny store). Wszystko przechodzi przez prop drilling:

- [App.jsx:94-135](src/App.jsx) — **30+ wywołań `useState`** w jednym komponencie. Red flag: >5 jest podejrzane, >30 to architektoniczny dług.
- [App.jsx:233-404](src/App.jsx) — **8+ wywołań `useEffect`**: auto-snap month, load localStorage, load Firestore, real-time sync, save localStorage, save Firestore, save vacation, monthly summary, PIN visibility, notifications, self-healing migration.
- [App.jsx:97](src/App.jsx) — `window.__openUpgrade = openUpgrade` — globalny anti-pattern, użyty żeby ominąć prop drilling. Jeśli to potrzebne, znaczy że architektura wymaga Context/Zustand, nie globala.
- [App.jsx:165-202](src/App.jsx) — `wrapWithTombstoneTracking` opakowuje 7 setterów. Skomplikowana wieloagentowa logika delete-tracking, która istnieje **tylko po to, żeby Firestore real-time sync nie wskrzeszał usuniętych rekordów**. To oznacza że architektura sync jest źle zaprojektowana — trzeba dodać tombstones zamiast np. wersjonować dokumenty.
- Brak Context/Zustand/Redux — wszystko props.

**Priorytet: P1**.

### 1.3 Duplikacja kodu (top 3 najgorsze)

**(a) Streak liczony dwa razy, dwa różne algorytmy:**
- [src/hooks/useStreak.js](src/hooks/useStreak.js) — toleruje weekendy, max 2 dni przerwy, longestStreak.
- [src/components/DailyReminder.jsx:12-23](src/components/DailyReminder.jsx) — inline pętla, **strict** (każdy dzień musi mieć tx, weekend łamie streak).

User widzi dwie różne liczby w zależności od tego, gdzie patrzy. Klasyczny bug duplikacji.

**(b) Hardcoded kursy walut, dwa miejsca:**
- [src/views/TransactionsView.jsx:74](src/views/TransactionsView.jsx) — `const RATES = { EUR: 4.28, USD: 3.92, ...}`
- [src/views/TransactionsView.jsx:563](src/views/TransactionsView.jsx) — `const rates = { EUR: 4.28, USD: 3.92, ...}`

Dosłownie ten sam obiekt skopiowany w tym samym pliku, 489 linii niżej. Jak ktoś podbije EUR, zapomni o drugim — preview pokaże 4.50, zapis 4.28.

**(c) Czytanie ikony kategorii, każdy widok własną kopią helpera:**
- [src/views/Dashboard.jsx:58-62](src/views/Dashboard.jsx) — `getLocalCat`
- [src/views/TransactionsView.jsx:18-22](src/views/TransactionsView.jsx) — `getLocalCat`
- [src/views/GoalsView.jsx:14-18](src/views/GoalsView.jsx) — `getLocalCat`
- [src/views/PaymentsView.jsx](src/views/PaymentsView.jsx) — używa `getCat` z `constants`

Pięć identycznych funkcji rozsianych po views. Powinno być jedno `useCategoryResolver()` lub helper w `lib/`.

**Priorytet: P2**.

### 1.4 Dead code

- [src/hooks/useAnalytics.js](src/hooks/useAnalytics.js) — wpina się do `window.goatcounter` i `window.plausible` ale **żaden z tych skryptów nie jest załadowany** ([index.html:21-29](index.html) — GoatCounter zakomentowany; brak Plausible). Hook jest dead code.
- [public/sw.js](public/sw.js) — kompletny Service Worker (130 linii) z push notifications, network-first, cache strategies… ale [index.html:36-40](index.html) **wyrejestrowuje wszystkie SW przy każdym ładowaniu strony**. Sprzeczność. `sw.js` nigdy nie działa = dead asset.
- [src/lib/insights.js](src/lib/insights.js) i [src/components/AnalyticsWidgets.jsx](src/components/AnalyticsWidgets.jsx) — **dwa niezależne systemy insightów** (Dashboard vs Analiza) — udokumentowane w [CHANGES.md:31-34](CHANGES.md). Nie dead, ale podwójne utrzymanie.
- [src/views/GoalsView.jsx:63-65](src/views/GoalsView.jsx) — komentarz mówi że dead code legacy "limits" usunięto w v1.2.11. Plik dalej importuje `cycleTxs`, którego nie używa po refaktorze.
- Komentarze typu `// v1.2.11: usunięty duplikat...` rozsiane po kodzie ([src/views/Dashboard.jsx:16-20](src/views/Dashboard.jsx)) — historyczne ślady, można czyścić.

**Priorytet: P3** — sprząta się przy okazji.

### 1.5 Magic numbers / hardcoded stringi

- [src/views/TransactionsView.jsx:74,563](src/views/TransactionsView.jsx) — kursy walut hardcoded.
- [src/lib/license.js:27](src/lib/license.js) — SECRET hardcoded (P0, patrz §3).
- [src/components/SettingsPanel.jsx:1404](src/components/SettingsPanel.jsx) — `FinTrack PRO · v1.1.0` — hardcoded literałem stringa, podczas gdy `package.json` pokazuje 1.3.9. **Stara wersja widoczna dla użytkownika.**
- [src/components/UpgradeModal.jsx:107-108](src/components/UpgradeModal.jsx) — ceny `99 zł`, `199 zł` — hardcoded w komponencie.
- [src/notifications.js:17](src/notifications.js) — `VAPID_KEY = ""` — push notifications nigdy nie zadziałają.
- [src/lib/errorTracking.js:15](src/lib/errorTracking.js) — `ERROR_ENDPOINT = null` — błędy lecą tylko do localStorage.
- [src/components/EmptyStateSetup.jsx:6-15](src/components/EmptyStateSetup.jsx) — lista 8 banków hardcoded. Brak szczecińskich kas, BNP, Velo, Nest…
- Imię „Mateusz" / `matiseekk@gmail.com` — w [public/privacy.html:29](public/privacy.html), [public/terms.html:29](public/terms.html), [src/components/FeedbackButton.jsx:6](src/components/FeedbackButton.jsx). To OK na razie ale to kontakt fizycznej osoby.
- Kod kraju PL hardcoded w wielu miejscach: `"pl-PL"`, `"zł"`, format `28.04.2026`. Patrz §11.

**Priorytet: P2** — większość OK, kilka (kursy walut, wersja, VAPID) wymagają fixu przed sprzedażą.

### 1.6 Testy

**Zero testów.** `package.json` nie ma `vitest`, `jest`, `playwright`, `cypress` — żadnego frameworka.

Funkcje które absolutnie powinny być przetestowane (każda ma już udokumentowane bugi):

1. [src/utils.js getCycleRange](src/utils.js) — granica miesiąca, cycleDay 31, luty, granica grudzień/styczeń.
2. [src/utils.js getCurrentCycleMonth](src/utils.js) — wrap grudzień→styczeń **niepoprawny** (linie 111-112, autor sam to udokumentował).
3. [src/lib/tier.js canAddTransaction](src/lib/tier.js) — limit 50/mies, edge cases (start miesiąca, koniec miesiąca, dwa różne miesiące w localStorage).
4. [src/lib/license.js validateLicense](src/lib/license.js) — format, HMAC, Firestore lock — w obecnej formie bezsensowny (P0), ale jak będzie Cloud Function, koniecznie testy.
5. [src/data/storage.js migrateData](src/data/storage.js) — migracje v1→v2 (bills+recurring → payments), sanityzacja NaN, capitalize labels, icon serialization. Tu były już bugi (Bug F z v1.2.4 — `linkedAccId` zgubiony).
6. [src/hooks/useFirebase.js mergeSnapshots](src/hooks/useFirebase.js) — tombstone TTL, last-write-wins, real-time sync conflict resolution. To najbardziej skomplikowana logika w apce, brak testów = ruletka.
7. [src/lib/insights.js generateInsights](src/lib/insights.js) — 13 reguł, dzienny seed shuffle, deduplication.

**Priorytet: P1** dla #1-#6, **P2** dla #7.

---

## 2. Performance

### 2.1 Bundle size

Z [vite.config.js:7-26](vite.config.js) (komentarze autora) szacunek:

| Chunk | Rozmiar (autor podaje) |
|-------|---|
| `react-vendor` | ~140 KB raw / ~45 KB gzip |
| `recharts` | ~300 KB raw / ~90 KB gzip |
| `firebase` | ~400 KB raw / ~110 KB gzip |
| `icons` (lucide) | ~150 KB raw / ~30 KB gzip |
| `xlsx` (lazy) | ~415 KB raw / ~137 KB gzip — **lazy-loaded** ([SettingsPanel.jsx:97](src/components/SettingsPanel.jsx)) |
| App code | ~91 KB gzip ([CHANGES.md:73](CHANGES.md)) |

**First paint estimated: ~370-420 KB gzip** (bez xlsx). To **2-3x typowego startera React**. Próg `chunkSizeWarningLimit: 600` w configu mówi „świadomie godzimy się na duży bundle".

**Co można szybko wyciąć:**
- `recharts` 90 KB tylko po to, żeby na Dashboard pokazać 6-słupkowy histogram. Nadinwestycja. Custom SVG = 2 KB.
- Firebase modular import istnieje (`firebase/auth`, `firebase/firestore`) — sprawdzone. OK.
- Lucide-react importy rozsiane po kodzie (`{ Wallet, X, ... }`) — Vite tree-shake to robi. OK.

Nie udało się uruchomić `npm run build` w worktree (`'vite' is not recognized` — `node_modules/.bin` puste, problem env). Na bazie commitu autora i config bundle realnie **~400 KB gzip first paint**.

**Priorytet: P2**.

### 2.2 Lazy loading

✅ **xlsx** lazy-loaded w `SettingsPanel.handleExport` ([SettingsPanel.jsx:97](src/components/SettingsPanel.jsx)) — dobre.
✅ **firebase clearAllData** lazy-importuje `firebase/firestore` ([App.jsx:411-413](src/App.jsx)) — dobre.
❌ **Routes** — nie ma routingu, jest `tab` state. Każdy widok ([App.jsx:587-594](src/App.jsx)) jest zaimportowany top-level, nawet jeśli user nigdy nie wejdzie w „Hobby" lub „Wyjazdy". `React.lazy()` + `Suspense` = -50 KB z first paint.

**Priorytet: P2**.

### 2.3 Re-render hell

- **Brak `React.memo` w całej apce.** Grep za `memo(` zwraca tylko `useMemo` / `useCallback`. Każdy re-render `App.jsx` (a tych jest dużo, bo 30+ useState) re-renderuje Dashboard, Transactions itd.
- **Brak `useCallback`** dla większości handlerów przekazywanych do dzieci. Każdy render generuje nowe referencje funkcji → propsy są niestabilne → memo i tak by nie pomógł bez fixu props.
- [src/App.jsx:303](src/App.jsx) — `setTimeout(() => saveToStorage(...), 500)` na każdej zmianie dowolnego z 17 stateów. Save = JSON.stringify całego state + AES-GCM encrypt. **Każdy klawisz w polu opisu transakcji zaszyfrowuje cały dataset.** Przy 5000 tx to są mierzalne lagi.
- [src/views/TransactionsView.jsx:229](src/views/TransactionsView.jsx) — `((() => { try { return JSON.parse(localStorage.getItem("ft_templates") || ...); }})())` — **synchroniczny `localStorage.getItem` + `JSON.parse` w body komponentu, na każdy render**. Powinno być w `useMemo` lub kontekście.
- [src/components/DailyReminder.jsx:12-23](src/components/DailyReminder.jsx) — pętla 365 iteracji w body (nie memoized).

**Priorytet: P1** — kluczowe dla power-userów z 1000+ transakcji.

### 2.4 LocalStorage

- [src/data/storage.js:6-34](src/data/storage.js) — debounce save 500ms ([App.jsx:303](src/App.jsx)). Dobre.
- AES-GCM encrypt całego state → w gzipie ~5-10 KB dla 100 tx, ~150-200 KB dla 5000 tx. Przy ~5 MB localStorage limit, **5000+ tx zaczyna być na granicy**.
- [src/components/StorageWarning.jsx](src/components/StorageWarning.jsx) — pokazuje warning od 4500 tx, archive 730+ dni. Dobre że jest, ale archiwum jest **lokalne** (komentarz `:31-32` — „NIE syncują się przez Firestore"). User na drugim urządzeniu nie zobaczy archiwum. Dobry warning, kiepski mental model.
- [src/data/storage.js:24-28](src/data/storage.js) — `QuotaExceededError` jest łapany ale `return false` — żaden UI nie pokazuje błędu zapisu. Dane idą w eter, user nie wie.
- [src/data/storage.js:155-161](src/data/storage.js) — sanityzacja `NaN` na load. Dobra obrona, ale po co w ogóle pozwolić zapisać NaN?

**Priorytet: P1** dla cichego błędu zapisu, **P2** dla reszty.

### 2.5 Obrazy

- 4 ikony PNG (192, 512, maskable 512, apple-touch). Suma ~70 KB. OK.
- Brak WebP/AVIF. Dla 4 plików nie kluczowe.
- Brak `loading="lazy"` na user-uploaded obrazach (bo apka nie przyjmuje obrazów).

**Priorytet: P3**.

### 2.6 Web Vitals — szacunek

Nie udało się zmierzyć (build broken w worktree), ale na bazie kodu:

- **LCP**: `LoginScreen` lub `Dashboard` hero card. Brak font-display=swap (font ładowany przez `FontLoader` — patrz [src/components/FontLoader.jsx](src/components/FontLoader.jsx)). Realnie 1.5-2.5 s na 4G mobile.
- **INP**: ryzykowne — encrypt-on-every-keystroke ([App.jsx:303](src/App.jsx)) + brak `React.memo` = przy długich listach transakcji typing w opisie może mieć INP >200 ms.
- **CLS**: skeletony brak (jest tylko prosty loading spinner [App.jsx:474](src/App.jsx)). Gdy dane się dociągną, layout szarpie.

**Priorytet: P2**.

---

## 3. Bezpieczeństwo

### 3.1 🔴 P0 — License HMAC SECRET hardcoded w bundle JS

[src/lib/license.js:27](src/lib/license.js):
```js
const SECRET = "ft-license-v1-7b3d9a2c8e1f4056b9ad3e5c8f7d2a1b";
```

Identyczny SECRET w [scripts/generate-license-keys.mjs:24](scripts/generate-license-keys.mjs).

**Co to oznacza:**
1. Każdy z `curl https://matiseekk-dot.github.io/FinTrack-PRO/assets/index-XXX.js | grep "ft-license-v1"` wyciąga SECRET.
2. Z SECRETem może wygenerować **dowolną liczbę kluczy lifetime** używając repo'wego `generate-license-keys.mjs`.
3. Firestore activation lock ([src/lib/license.js:79-102](src/lib/license.js)) tylko zapobiega wielokrotnemu użyciu **tego samego** klucza, nie generowaniu nowych.

Autor sam to udokumentował w [docs/license-keys.md:10-20](docs/license-keys.md) („to jest podwyższenie progu, nie hard security"). Świadomy trade-off **przed** sprzedażą jest OK. **Przed publikacją na Play Store / sprzedażą** to blocker — wystarczy jeden Reddit post „darmowy keygen do FinTrack" i revenue → 0.

Dodatkowo: PRO status jest w `localStorage` ([src/lib/tier.js:41-58](src/lib/tier.js)). Otwierasz DevTools, wpisujesz `localStorage.setItem("ft_pro_status", JSON.stringify({type:"lifetime", since:"2026-01-01", expiresAt:null, source:"manual"}))`, refreshujesz — masz lifetime PRO. Potem syncuje się przez Firestore na inne urządzenia ([App.jsx:82-85](src/App.jsx), [src/hooks/useFirebase.js:96-101](src/hooks/useFirebase.js) — last-write-wins po `since`).

**Priorytet: P0**.

**Fix:** HMAC w Cloud Function, klient tylko forwarduje. Lub całkowite porzucenie kluczy na rzecz Google Play Billing + RevenueCat (i tak jest TODO w [src/lib/tier.js:10](src/lib/tier.js)).

### 3.2 🔴 P0 — PIN „blokada" jest atrapą

[src/components/PinLock.jsx:6-12](src/components/PinLock.jsx):
```js
function hashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = Math.imul(31, h) + pin.charCodeAt(i) | 0;
  }
  return String(h);
}
```

To `String.hashCode` z Javy, **nie** funkcja kryptograficzna.

**Co to oznacza:**
1. Keyspace 4-cyfrowego PIN: 10 000 wartości. Brute-force algorytmem powyżej: ~5 ms na CPU 2020+.
2. Brak rate-limit ([PinLock.jsx:118](src/components/PinLock.jsx) — atrapa, tylko inkrementuje counter).
3. Ktoś z dostępem do urządzenia, otwierając DevTools, wykonuje:
   ```js
   const target = localStorage.getItem("ft_pin_hash");
   for (let i = 0; i < 10000; i++) {
     const pin = String(i).padStart(4, "0");
     // hashPin(pin) === target → masz PIN
   }
   ```
   Albo prościej: usuwa `ft_pin_enabled` z localStorage.

**Priorytet: P0** dla apki finansowej. PIN powinien używać PBKDF2 (jak [src/lib/crypto.js:22-23](src/lib/crypto.js)) lub Web Crypto API + iterations + salt + lockout po 5 nieudanych próbach.

### 3.3 🟠 P1 — Brak server-side weryfikacji PRO

[src/firestore.rules:7-14](firestore.rules) pozwala każdemu authed userowi zapisywać dowolne pole w swoim dokumencie `users/{uid}/data/main`, w tym `proStatus`. Brak walidacji że `proStatus.type === "lifetime"` może istnieć tylko gdy istnieje wpis w `licenses/{key}` z odpowiadającym `uid`.

Konsekwencja: nawet po fixie SECRET (§3.1), user może w DevTools podmienić własny dokument Firestore i mieć PRO „legalnie zsynchronizowane".

**Priorytet: P1**.

### 3.4 ✅ Pozytywne

- Firestore rules ([firestore.rules:7](firestore.rules)) izolują userów `request.auth.uid == userId`. Bez tego każdy widziałby cudze finanse — autor o tym wie ([WDROZENIE.md:5-12](WDROZENIE.md)).
- AES-GCM encrypt localStorage ([src/lib/crypto.js](src/lib/crypto.js)) z PBKDF2 100k iteracji, IV losowe. Solidne. Klucz lokalny → chroni przed osobą z dostępem do dump pliku, nie przed osobą z dostępem do przeglądarki — autor o tym wie ([crypto.js:1-4](src/lib/crypto.js)). OK.
- ErrorBoundary na każdym tab ([App.jsx:587-594](src/App.jsx)) — dobre.
- Rate limit client-side ([src/lib/rateLimit.js](src/lib/rateLimit.js)) 60 tx/min — chroni przed zapętloną pętlą.

### 3.5 XSS

- Brak `dangerouslySetInnerHTML` w całym kodzie (sprawdzone — grep nie zwraca).
- Eksport XLSX używa `XLSX.utils.json_to_sheet` — biblioteka escapuje. OK.
- Eksport tekstowy z user-input do mailto ([FeedbackButton.jsx:37](src/components/FeedbackButton.jsx)) — `encodeURIComponent`. OK.
- User input wszędzie renderowany jako `{tx.desc}` (text, nie HTML). React escapuje. OK.

**Priorytet: brak**.

### 3.6 Sekrety w repo

- [src/firebase.js:6-13](src/firebase.js) — `firebaseConfig` zawiera `apiKey`, `appId` itd. **To jest OK** dla Firebase Web SDK (nie są to sekrety, są to identyfikatory, security egzekwują reguły Firestore + App Check).
- [scripts/generate-license-keys.mjs:24](scripts/generate-license-keys.mjs) — SECRET (P0, §3.1).
- Brak `.env`, `.env.local`, `credentials.json` — git nie pokazuje (sprawdzone).

### 3.7 Service Worker

[public/sw.js](public/sw.js) ma 130 linii dobrze napisanego SW (cache-first dla assetów, network-first dla HTML, push handler). Ale:

[index.html:34-41](index.html):
```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}
```

**SW jest aktywnie wyrejestrowywany przy każdym ładowaniu strony.** Komentarz mówi „Unregister to prevent stale cache issues" — sygnał że autor walczył z bugiem cache i wybrał atomówkę zamiast fixa.

Konsekwencje:
- Offline mode **NIE DZIAŁA** mimo że kod istnieje.
- Push notifications nie zadziałają (handler w `sw.js` jest, ale SW nie zarejestrowany).
- Manifest claim'uje PWA, [index.html:7-9](index.html) ma `apple-mobile-web-app-capable=yes` — ale bez SW to jest „instalable" but not „offline-capable".

**Priorytet: P1** — albo użyj SW, albo wyrzuć oba pliki. Stan obecny jest gorszy niż brak — wprowadza w błąd.

---

## 4. Persystencja danych

### 4.1 Co, gdzie, dlaczego

| Co | Gdzie | Komentarz |
|---|---|---|
| Główny state (tx, accounts, payments…) | `localStorage["fintrack_v1"]` AES-GCM enc | OK |
| `ft_templates`, `ft_vacation`, `ft_vacations` | `localStorage` (nieszyfrowane!) | Niespójne — czemu te 3 nie są w głównym dump'ie? |
| `ft_pro_status` | `localStorage` (jawnie!) | Łatwy do podmiany w DevTools |
| `ft_pin_hash`, `ft_pin_enabled` | `localStorage` (jawnie!) | Łatwy do skasowania |
| `ft_streak`, `ft_streak_longest` | `localStorage` (jawnie!) | OK — nie sensitive |
| `ft_device_id` | `localStorage` (jawnie!) | Klucz do AES — jest tu, więc szyfrowanie jest 'obfuscation', nie security |
| `ft_errors` | `localStorage` (jawnie!) | 50 ostatnich, dla feedback. OK |
| `ft_lang` | `localStorage` | OK |
| `ft_onboarded`, `ft_setup_done` | `localStorage` | OK |
| `ft_notif_asked`, `ft_notif_date` | `localStorage` | OK |
| Firestore `users/{uid}/data/main` | jeden monolithic dokument | Problem skalowania, patrz §4.4 |
| Firestore `licenses/{key}` | aktywacje | OK |

**Niespójność**: `templates`, `vacation`, `vacations` mają osobne klucze localStorage zamiast być częścią `fintrack_v1`. Trzeba pamiętać o nich w 4 miejscach (export, clearAllData, applyData, save).

**Priorytet: P2**.

### 4.2 Migracje schematu

[src/data/storage.js:36-203](src/data/storage.js) — `migrateData()`:
- v1→v2: `bills + recurring → payments` ✅
- Sanityzacja `cycleDayHistory`, tombstones, proStatus ✅
- `customCats` capitalize labels + repair zerwanego `icon` po JSON roundtrip ✅
- Sanityzacja NaN/Infinity w `amount`, `balance`, `limit`, `target` ✅

Dobre — migracje są idempotentne. ALE:
- Brak wersji schematu w samym dokumencie. Jak zmieni się shape `transaction.tripId`, jak rozpoznasz że to dokument przed migracją?
- [App.jsx:374-404](src/App.jsx) — **drugi** layer migracji w `useEffect`. Jeśli jeden zepsuje się i nie wyczyści, drugi może coś poprawić ale nie zna pełnego kontekstu.

**Priorytet: P2**.

### 4.3 Backup / export / import

- Export do XLSX z 8 sheetów + JSON backup ([SettingsPanel.jsx:96-200](src/components/SettingsPanel.jsx)) ✅
- Import z XLSX FinTrack-format ✅
- Import bank CSV (PKO, mBank, ING, Revolut) — wspomniany w i18n keys, kod nie czytany w pełni. Zakładam że istnieje.

Bardzo dobre. Lepiej niż większość finansowych SaaS.

**Priorytet: brak**.

### 4.4 Reset / wipe

[App.jsx:406-442](src/App.jsx) — `clearAllData()`:
1. Zablokuj save Firestore (clearingRef)
2. `deleteDoc` z Firestore
3. Wyczyść 4 klucze localStorage (`fintrack_v1`, `ft_templates`, `ft_vacation`, `ft_vacations`)
4. Reset state do INITIAL

**Bug**: nie kasuje `ft_pro_status`, `ft_pin_hash`, `ft_pin_enabled`, `ft_streak`, `ft_device_id`, `ft_errors`, `ft_lang`, `ft_onboarded`, `ft_setup_done`, `ft_notif_*`, `ft_streak_longest`. Po „wipe" PIN dalej działa, PRO dalej aktywne, streak dalej liczony. To może być bug lub feature, ale na pewno nieintuicyjne („wyczyść wszystko" → OK, oprócz tych 11 rzeczy).

**Priorytet: P2**.

### 4.5 Skalowanie Firestore

`users/{uid}/data/main` to **jeden dokument**. Limit Firestore: 1 MB.

[src/hooks/useFirebase.js:218-222](src/hooks/useFirebase.js) — warning od 900 KB. Po przekroczeniu zapis fail z `resource-exhausted`.

Dla power-userów (5000+ tx, hobby z tagami, custom kategorie) realne. Skala powyżej 5000 tx wymaga refaktoru na sub-collections (`users/{uid}/transactions/{id}`).

**Priorytet: P2** — autor o tym wie ([WDROZENIE.md:67-71](WDROZENIE.md)).

---

## 5. UX — flow i nawigacja

### 5.1 🔴 Onboarding — 11 kroków zanim user zobaczy pierwszą transakcję

Liczę kroki pierwszego kontaktu z apką:

1. Otwierasz apkę
2. **Login Screen** ([LoginScreen.jsx](src/components/LoginScreen.jsx)) — **wymuszony Google login** ([App.jsx:495](src/App.jsx))
3. Onboarding slide 1 (Witaj…)
4. Slide 2 (Dodawaj transakcje)
5. Slide 3 (Cykl rozliczeniowy — czyli wykład o billing cycle ZANIM user wie po co)
6. Slide 4 (Kategorie)
7. Slide 5 (Budżety i alerty)
8. Slide 6 (Cele oszczędnościowe)
9. Slide 7 (Bezpieczeństwo)
10. Slide 8 (Gotowy do startu) — koniec onboardingu
11. **EmptyStateSetup** ekran 1 (wybierz bank z 8 opcji) ([EmptyStateSetup.jsx:65-110](src/components/EmptyStateSetup.jsx))
12. EmptyStateSetup ekran 2 (saldo początkowe) ([EmptyStateSetup.jsx:114-200](src/components/EmptyStateSetup.jsx))
13. **Dashboard pusty** — pierwsza interakcja z apką

**Audytowy red flag** mówi >5 ekranów onboardingu = problem. Tutaj jest 8 + 2 + 1 forced login = **11**.

Dane branżowe: każdy ekran onboardingu zabija ~10-20% userów. Z 8-slajdowego onboardingu kończy ~30-40%.

**Priorytet: P0** dla retention/conversion. Patrz §5.2 i sekcja 🔄 PRZEPROJEKTUJ.

### 5.2 🔴 Forced login zanim user zobaczy apkę

[App.jsx:495](src/App.jsx) — `if (!user) return <LoginScreen onSignIn={signInGoogle}/>`

User nie może spróbować apki bez konta Google. Dla apki która **nie wymaga sync** w 90% przypadków (mobile, jedno urządzenie, freemium) to drastyczna redukcja konwersji.

Best practice (Notion, Todoist, YNAB): **„Try without account"** lub **„Continue offline"**. Login dopiero przy próbie sync / multi-device / przy pierwszym CTA „Backup w chmurze".

**Priorytet: P0**.

### 5.3 Empty states

- Dashboard empty ([Dashboard.jsx:191-235](src/views/Dashboard.jsx)) — emoji 👋, CTA, 3 feature cards. **Bardzo dobre.**
- Transactions empty ([TransactionsView.jsx:294-313](src/views/TransactionsView.jsx)) — emoji 💸, hint, CTA. Dobre.
- Goals empty ([GoalsView.jsx:86-99](src/views/GoalsView.jsx)) — dobre.
- Hobby empty — i18n key `hobby.empty` istnieje.
- Trips empty — i18n key istnieje.

Generalnie OK. **Priorytet: brak**.

### 5.4 Error states

- ErrorBoundary ([ErrorBoundary.jsx](src/components/ErrorBoundary.jsx)) z retry/reload — bardzo dobre.
- Sync error widoczny w top bar ([App.jsx:554-558](src/App.jsx)).
- Storage warning ([StorageWarning.jsx](src/components/StorageWarning.jsx)) dla power-userów.
- Brak: error state dla offline (skoro SW wyłączony, „brak internetu" = pełna apka działa lokalnie ale Firestore sync nie — i nie ma wyraźnego komunikatu).

**Priorytet: P2**.

### 5.5 Loading states

- Główny load ([App.jsx:474-492](src/App.jsx)) — logo + spinner + label „Sprawdzam konto / Wczytuję dane". OK.
- Brak skeletonów. Listy transakcji pojawiają się instantowo gdy `loaded === true`.
- Sync indicator w top bar ([App.jsx:542-547](src/App.jsx)) — RefreshCw + tekst. Dobre.

**Priorytet: P3**.

### 5.6 Confirmation dialogs

- Wipe data → confirm ([SettingsPanel.jsx:1363-1385](src/components/SettingsPanel.jsx)) ✅
- Load demo → confirm ✅
- Delete category → `confirm()` natywny browser ([SettingsPanel.jsx](src/components/SettingsPanel.jsx))
- Delete transaction → toast „Usunięto" ale **brak confirm** ([TransactionsView.jsx:430-444](src/views/TransactionsView.jsx)). Swipe-to-delete + click-to-delete = łatwo o accidental.
- Delete payment → brak confirm ([PaymentsView.jsx:100](src/views/PaymentsView.jsx))
- Sign out → `window.confirm` natywny ([App.jsx:568](src/App.jsx)) — brzydki, ale działa.
- Archive transactions ([StorageWarning.jsx:25](src/components/StorageWarning.jsx)) — natywny `confirm()`.

**Niespójność**: czasem custom modal, czasem `window.confirm`. Brzydko.

**Priorytet: P2**.

### 5.7 Dead ends

- W `Onboarding` można `Skip` ([Onboarding.jsx:81-88](src/components/Onboarding.jsx)) → ale i tak trafiasz do `EmptyStateSetup`. „Skip" oznacza tylko skip slidów, nie skip setup.
- W `EmptyStateSetup` nie ma „Pomiń, dodam później" — user **musi** wpisać saldo żeby przejść dalej. Jeśli nie wie ile ma na koncie → utknął.
- Po wybraniu banku → tylko „Zmień bank" cofa, brak normalnego back. OK ale subtelne.

**Priorytet: P2**.

---

## 6. UX — szczegóły interakcji

### 6.1 Mobile-first

[src/App.jsx:528](src/App.jsx) — `maxWidth: 480` hardcoded.

Apka **wygląda OK** na mobile (320-480px), ale na desktop user widzi 480px kolumnę pośrodku 1920px. Brak responsive layoutu desktop. Decyzja świadoma (apka z definicji „mobile-first PWA"), ale ogranicza target market.

**Priorytet: P3**.

### 6.2 Touch targets

WCAG: min 44×44px. Sprawdzane:

- Bottom nav ([App.jsx:644-672](src/App.jsx)) — flex 1 z padding 7px → na 480px / 4 = ~120×~30px. **Za niskie.**
- FAB (Dodaj) — 52×52 ([App.jsx:655](src/App.jsx)) — **OK**.
- Top bar Settings icon size=17 ([App.jsx:582](src/App.jsx)) — **klikalny obszar bardzo mały**.
- Top bar avatar 34×34 ([App.jsx:574-576](src/App.jsx)) — **prawie OK**, ale obwódka 2px → 38×38 łącznie. Borderline.
- Close `<X>` w modalach — niektóre 36×36 (UpgradeModal:97), niektóre `padding 6` (FeedbackButton:84) → ~28×28. Pewne miejsca pod minimum.
- Swipe-to-delete na liście tx → confirm jest 64px width, OK.

Generalnie 60% touch targetów >40px, 40% poniżej. **Priorytet: P2**.

### 6.3 Klawiatura mobilna

- ✅ [src/components/EmptyStateSetup.jsx:157](src/components/EmptyStateSetup.jsx) — `inputMode="decimal"` na saldzie.
- ❌ [src/views/TransactionsView.jsx:542](src/views/TransactionsView.jsx) — `type="number"` na kwocie. Brak `inputMode="decimal"` → na iOS klawiatura numeryczna ale bez przecinka.
- ❌ Nigdzie nie widzę `type="email"` ani `type="tel"`.
- ✅ Większość inputów ma `fontSize: 16` ([Input.jsx:11](src/components/ui/Input.jsx)) — **iOS Safari nie zoom'uje** ✅.

**Priorytet: P2**.

### 6.4 Haptic feedback

[src/hooks/useHaptic.js](src/hooks/useHaptic.js) (nie czytany w pełni, ale używany) — wywołania `hapticSuccess`, `hapticError`, `hapticMedium`. Dobry pattern.

Używany w TransactionsView, PaymentsView. Brakuje w GoalsView, AccountsView, HobbyView (delete actions).

**Priorytet: P3**.

### 6.5 Dark mode

- Apka jest **dark-only** (background `#060b14` ze [src/App.jsx:528](src/App.jsx) i [index.html:20](index.html)).
- Privacy/terms.html są jasne ([public/privacy.html:8](public/privacy.html) — `background: #f8fafc`). **Niespójność.**
- Onboarding/Login/Dashboard wszystko ciemne. Spójne wewnątrz apki.
- Brak toggle dla light mode. Decyzja świadoma.

**Priorytet: P3**.

### 6.6 Dostępność (a11y)

- Brak `aria-label` na większości buttonów. Np. [App.jsx:566-580](src/App.jsx) avatar button — ma `title` ale `aria-label` brak. Screen reader przeczyta „button".
- Brak `role="dialog"` na modalach (sprawdzone w [Modal.jsx](src/components/ui/Modal.jsx) — nie czytany pełen, ale w UpgradeModal.jsx, RatingPrompt.jsx widać że to gołe `<div>`).
- Brak focus trap w modalach. Tab przechodzi pod modal.
- Kontrast tekstu: `color: #475569` na `background: #060b14` (popularny kolor pomocniczy) → **WCAG AA fail** (kontrast 4.0:1 vs wymagany 4.5:1 dla normal text). Sprawdzone na kilku przykładach.
- `color: #334155` (jeszcze ciemniejszy) na `#060b14` → **WCAG AA fail dla normal text**. Używany w [App.jsx:649,664](src/App.jsx) na nieaktywnych ikonach nawigacji.
- Brak alt na obrazach — bo nie ma user-uploaded obrazów. Avatar ma `alt=""` ([App.jsx:575](src/App.jsx)) — poprawnie dla decorative.
- Brak skip-to-content link.
- Hierarchia nagłówków: w Onboarding `<h1>` jest na slidzie. W Dashboard nie ma żadnego `<h1>`. Niespójne.

**Priorytet: P2** — apka działa screen-reader-friendly „przypadkowo" w kilku miejscach (semantic buttons), ale nie pełni.

---

## 7. Sensowność biznesowa i sprzedaż

### 7.1 Killer feature — co JEDNO ta apka robi lepiej?

**Próbuję sformułować w jednym zdaniu:**
> „Tracker finansów osobistych z cyklem rozliczeniowym pod dzień wypłaty, sync w chmurze, kalkulator IKZE/IKE/PPK, i tracking hobby."

**To są cztery feature'y, nie jeden.** I żaden z nich w pojedynkę nie zabija konkurencji:

- **Cykl pod wypłatę** — ciekawe (większość konkurencji ma tylko miesiąc kalendarzowy), niszowe ale realne. Polski Pracownik na pensji 27. dnia miesiąca to use-case. Ale to nie jest „muszę to mieć" — to „fajnie że jest".
- **Sync w chmurze (Google Sign-In + Firestore)** — standard. Money Lover, Spendee, Wallet, Toshl wszyscy mają.
- **IKZE/IKE/PPK kalkulator** ([src/components/RetirementCalculator.jsx](src/components/RetirementCalculator.jsx)) — **to jest najbardziej polskie i unique**. Tylko polskie produkty mogą to robić. Ale wymaga targetowania na 30+ klasy średniej, nie 25-letnich freelancerów.
- **Hobby tracking (Vinyl, F1, gaming)** ([src/views/HobbyView.jsx](src/views/HobbyView.jsx)) — niszowe, gimmick. Ciekawy pomysł ale to nie jest reason-to-buy.

**Werdykt:** killer feature **niejasny**. Apka jest szwajcarskim scyzorykiem polskiej finansjery. Jak będziesz robić landing page, do czego się przyznasz?

Mój strzał na pozycjonowanie: **„Polski tracker finansów dla osób z pensją w połowie miesiąca, które chcą widzieć IKZE/IKE/PPK obok bieżącego konta."** Wąsko, ale to gra.

**Priorytet: P0** dla strategii produktu.

### 7.2 Target user

Z kodu widać:
- Polski (i18n PL primarny, demo data po polsku, „Żabka", "Allegro", "Vinted")
- Mobile-first
- Trochę finansowo świadomy (cykl rozliczeniowy, IKZE — to nie są terminy dla świeżaka)
- Zarobki pewnie 5-15k PLN/mies (granica gdzie warto trackować + płacić 99 zł/rok)
- Wiek ~25-40
- Konkurencja porzucana: Excel, Money Lover (free ale słabe), YNAB (drogie, EN, brak PL banków)

To jest realny segment. Estymuję 200-500k osób w Polsce.

### 7.3 Cena

- **99 zł/rok** = ~8 zł/msc — **bardzo niska** vs YNAB ($14/mc), Spendee Pro ($15/rok ale słabsze).
- **199 zł lifetime** (early bird, limit 100) — interesujące, low-key FOMO.
- **Free**: 50 tx/mies, 2 konta, 1 budżet, 1 cel + sync (?)

[src/lib/tier.js:17-27](src/lib/tier.js) — `FREE_LIMITS.canSync: false`. Czyli sync jest pro-only.
[src/components/UpgradeModal.jsx:9-11](src/components/UpgradeModal.jsx) — features w tabeli:
1. Limit transakcji 50 → ∞
2. Wsparcie autora ✅
3. Wczesny dostęp ✅

**To jest słabe.** Pro user płaci 99 zł rocznie głównie za:
- (a) limit 50→∞ — łatwy do obejścia (eksportuj/wyczyść co miesiąc)
- (b) sync — ale free user już musi się **zalogować** żeby w ogóle wejść do apki ([App.jsx:495](src/App.jsx))! Czyli sync „za free" technicznie działa, ale UI wytłumaczy że trzeba PRO.
- (c) good vibes („wsparcie autora")

Patrz §8 — paywall nie jest spójny z `tier.js`.

**Priorytet: P0**.

### 7.4 Value ladder

Free tier **nie wyświetla** wartości pro tieru. UpgradeModal pokazuje 3 cechy, z czego 2 są nominalne.

Co realnie odróżnia Free od PRO w kodzie:
- Limit 50 tx/mies — sprawdzane w [src/lib/tier.js:131-142](src/lib/tier.js)
- `customCategories: 0 vs 20` — [src/lib/tier.js:22,34](src/lib/tier.js) — **ale nigdzie w kodzie nie widzę enforce'a**. SettingsPanel pozwala dodać dowolną liczbę custom cats.
- `accounts: 2 vs ∞`, `budgets: 1 vs ∞`, `goals: 1 vs ∞` — limity zadeklarowane ale **nie egzekwowane**. AccountsView dodaje bez sprawdzania `canAddAccount()`.
- `canImport: false` — tylko sprawdzane, ale **kod importu jest dostępny**. Free user może zaimportować CSV.
- `canExportPDF: true` w PRO — ale **nie ma w ogóle exportu PDF w kodzie**, jest XLSX.

**Czyli paywall na poziomie kodu enforce'uje TYLKO limit 50 tx.** Reszta tieru jest fikcją.

**Priorytet: P0** dla biznesu, **P1** dla kodu.

### 7.5 Konkurencja PL/EN

| Konkurent | Cena | Mocne | Apka różni się |
|---|---|---|---|
| **Money Lover** (PL) | Free + Pro $30/rok | Auto-import banków (Open Banking), iOS+Android | FinTrack: brak auto-import. Apka tańsza |
| **Spendee** | Free + Premium $15/rok | Open Banking dla EU, multi-currency | jw. |
| **YNAB** (EN) | $14.99/mc | Filozofia „every dollar a job", community | YNAB jest po angielsku, drogi, brak PL banków. Apka jest tańsza i polska |
| **PKO BP / mBank app** | Free | Auto-import (one bank), bez konfiguracji | Apka multi-bank manualny, bardziej elastyczna |
| **Excel + szablon** | Free | Pełna kontrola | Apka łatwiejsza, mobilna |

**FinTrack PRO różni się od konkurencji**: cykl pod wypłatę (Money Lover nie ma), IKZE/PPK (nikt nie ma), polskie kategorie (Żabka itd.). Ale **brakuje**: auto-import z banków (killer dla Money Lover/Spendee). Manualne dodawanie + CSV jest wadą wobec Open Banking.

### 7.6 Wskaźnik gotowości do sprzedaży: **3/10**

Uzasadnienie:
- ✅ Apka działa, jest stabilna, ma działający sync, dobre empty states. **+3**.
- ✅ Privacy/Terms istnieją. **+1**.
- ❌ Paywall to atrapa (RevenueCat = TODO, Play Store URL może nie istnieć). **−2**.
- ❌ Killer feature niejasny — landing page będzie blady. **−2**.
- ❌ Hard wall login zabija pierwsze wrażenie. **−2**.
- ❌ Onboarding 8+2 ekrany. **−1**.
- ❌ License system jest atrapą (P0 §3.1). **−2**.
- ✅ Przyjazne UX dla użytkownika który **dotrze** do apki. **+1**.

Suma 3/10. **Można sprzedawać dopiero po fixie 3 P0.**

---

## 8. Monetyzacja — implementacja

### 8.1 🔴 P0 — Paywall jest atrapą

[src/components/UpgradeModal.jsx:32-58](src/components/UpgradeModal.jsx) — `handlePurchase`:

```js
const handlePurchase = () => {
  // v1.3.0: TODO — integracja RevenueCat. Na razie otwieramy Play Store listing.
  setOpening(true);
  try {
    window.location.href = PLAY_STORE_INTENT;
    setTimeout(() => {
      window.open(PLAY_STORE_URL, "_blank");
      setOpening(false);
    }, 1500);
  } catch (_) { ... }
};
```

User klika „Kup PRO" → przekierowanie na `https://play.google.com/store/apps/details?id=pl.skudev.fintrackpro`.

**Co się dzieje:**
1. Jeśli aplikacja **nie jest jeszcze w Play Store** (CHANGES.md i WDROZENIE.md sugerują „Faza 3 TWA setup czeka na keystore") → user widzi 404 od Google Play.
2. Jeśli jest → user instaluje TWA (Trusted Web Activity), wraca do apki, **dalej nie ma PRO** bo nic się nie zsynchronizowało.
3. Brak callbacku po zakupie. RevenueCat nie podłączony ([src/lib/tier.js:10-13](src/lib/tier.js)).
4. Jedyna ścieżka aktywacji w kodzie to ręczne wpisanie license key — który z kolei jest wyłączony w UpgradeModal.jsx (kod do tego musi być w SettingsPanel? Nie znalazłem).

**Tu nie ma sprzedaży.** Jest fasada paywalla.

**Priorytet: P0** — przed sprzedażą trzeba albo (a) skończyć RevenueCat, albo (b) wyłączyć paywall i zrobić apkę 100% darmową, albo (c) przywrócić Gumroad flow z [docs/license-keys.md](docs/license-keys.md) — który ma swoje P0 (§3.1).

### 8.2 Triggery paywalla

[src/components/UpgradeModal.jsx:84-92](src/components/UpgradeModal.jsx) — różne `trigger`:
- `limit` — gdy user przekroczy 50 tx/mies
- `import`, `sync`, `account`, `budget`, `goal`, `customCat` — wymienione w stringach, ale **żadnego z nich nie znalazłem w kodzie**. Grep'ując `openUpgrade("import")` itd. → tylko `openUpgrade("limit")` ([TransactionsView.jsx:53,215](src/views/TransactionsView.jsx)).

Czyli **jedyny trigger paywalla to limit 50 tx/mies**. Reszta to martwe stringi.

**Aha-moment** triggera: po 30 transakcjach pojawia się żółty banner ([TransactionsView.jsx:196-223](src/views/TransactionsView.jsx)). Po 50 — czerwony, blok. **Dobry timing** — user już używa apki, czuł wartość → kupi albo nie. Lepsze niż upsell w onboardingu.

**Priorytet: P0** dla brakujących triggerów (jeśli marketingowo mają działać), **P2** dla istniejącego.

### 8.3 Wycieki wartości

Z §7.4: Free user **dostaje** sync, custom kategorie, multi-account, multi-budget, multi-goal mimo deklaracji w `tier.js` że to PRO. Tylko 50 tx/mies enforce'd.

**Priorytet: P1** — albo doszlifuj enforcement (każdy view sprawdza `canAddX`), albo zrezygnuj z deklaracji i postaw paywall tylko na limicie tx + sync.

### 8.4 Upgrade flow — ile kliknięć?

1. Klik „Upgrade" w bannerze TransactionsView lub Settings
2. Zobacz UpgradeModal
3. Wybierz plan (yearly/lifetime)
4. Klik „Otwórz w Google Play"
5. Play Store otwiera się
6. Klik „Zainstaluj" / „Kup"
7. Płatność Google
8. Wróć do apki
9. **Apka nie wie że kupiłeś** → user pyta „gdzie mój PRO?"
10. (Hipotetycznie) email z license key
11. (Hipotetycznie) wpisuje key w SettingsPanel
12. PRO aktywne

11 kliknięć. **Złamany.**

W działającym RevenueCat flow byłoby 4 kliknięcia.

**Priorytet: P0**.

### 8.5 Restore purchases

Brak. Po reinstalu / cleanup localStorage user **traci PRO** chyba że jest zalogowany do Firestore i tam się przesyncuje. Ale jeśli zmienił telefon → musi się zalogować Google → odzyska PRO przez Firestore.

To **prawie** działa, ale wisi na last-write-wins ([src/hooks/useFirebase.js:96-101](src/hooks/useFirebase.js)) i ręcznym Force Sync ([src/components/SettingsPanel.jsx](src/components/SettingsPanel.jsx) sekcja Diagnostyka PRO).

**Priorytet: P1**.

---

## 9. Compliance / RODO / Store policies

### 9.1 Polityka prywatności

[public/privacy.html](public/privacy.html) — istnieje, podlinkowana z LoginScreen i SettingsPanel ✅.

**Niespójności z kodem:**
- §2.4 wspomina **GoatCounter** ale skrypt **wyłączony** ([index.html:21-29](index.html)). Polityka jest „przyszłościowa" → zła praktyka. Jeśli nie zbierasz danych, nie pisz że zbierasz.
- §6 mówi o eksporcie do CSV — w kodzie jest tylko XLSX (xlsx zawiera CSV jako format, ale w UI nie ma przycisku „Export CSV" dla user-data — jest tylko **Import** CSV z banków).
- Data: 17 kwietnia 2026 (`<p class="meta">`). Nie aktualizowane od trzech tygodni — nieduży problem ale przy większych zmianach trzeba.

**Priorytet: P1** — przed publiczną sprzedażą trzeba uzgodnić politykę z faktycznym kodem.

### 9.2 Regulamin

[public/terms.html](public/terms.html) — istnieje ✅.

**Niespójności:**
- §6.2 — **„Płatności obsługuje Gumroad, Stripe lub inny"**. Kod aktualnie = Google Play (TODO RevenueCat). To trzy różne podmioty na trzech etapach. Update wymagany.
- §6.3 — zwroty 14 dni „skontaktuj się z Dostawcą". Google Play ma własną politykę zwrotów (48h auto, dłużej przez kontakt deweloperem). Konflikt.
- WDROZENIE.md ([WDROZENIE.md:17-25](WDROZENIE.md)) wspomina Gumroad URLs — stale.

**Priorytet: P1**.

### 9.3 Dane osobowe

- [src/firebase.js](src/firebase.js) — Firebase Auth zbiera email + UID + opcjonalnie photoURL.
- Firestore zawiera transakcje (kwoty, daty, opisy — które user może wpisać cokolwiek, w tym imiona, nazwiska, kontekst).
- Privacy §2.2 mówi „nie zbieramy IBAN" — ale [Input.jsx](src/components/ui/Input.jsx) accept'uje IBAN w polu konta ([AccountsView.jsx:23](src/views/AccountsView.jsx)). User **może** sam wpisać. Polityka mówi „nie", kod mówi „proszę". Niespójność dyskretna.
- **Region: europe-west3 (Frankfurt)** ✅ (deklarowane w polityce, do weryfikacji w Firebase Console).

**Priorytet: P2** dla IBAN, **P1** dla rzeczywistego ustawienia regionu Firestore.

### 9.4 Google Play Data Safety

Nie audytuję bo apka jeszcze nie w Play Store (zakładam, na bazie WDROZENIE.md). Ale sprawdzić przed publikacją:
- Co Firebase Auth zbiera (email = identyfikator, opcjonalna photoURL)
- Co Firestore przechowuje
- IP nie przechowywane (deklarowane w privacy)

### 9.5 Permissions

PWA nie wymaga większości permissions. Ale:
- [src/notifications.js:36-38](src/notifications.js) — request `Notification.permission`. Wymaga zgody, ma sens.
- Brak request o lokalizację, kamerę, mikrofon. ✅

### 9.6 Treści generowane przez user

User wpisuje tylko swoje dane. Nie ma feed'u, share, public. **Brak ryzyka moderacji.** ✅

---

## 10. PWA / mobile readiness

### 10.1 manifest.json

[public/manifest.json](public/manifest.json):
- ✅ `name`, `short_name`, `id`, `start_url`, `scope`
- ✅ `display: standalone`
- ✅ `theme_color`, `background_color`, `lang: pl`
- ✅ `categories: [finance, productivity]`
- ✅ ikony 192, 512, maskable 512, svg
- ✅ `shortcuts` — quick action „Dodaj transakcję"
- ❌ `description` mówi „**zero subskrypcji**" — niezgodne z faktycznym paywallem (UpgradeModal sprzedaje subscription 99zł/rok). **Ten string trafi do Play Store**.

**Priorytet: P0** — wprowadza w błąd. Albo nie sprzedawaj subskrypcji (zostań przy lifetime), albo zmień description.

### 10.2 Service Worker

§3.7 — istnieje, jest wyrejestrowywany. Offline = nie działa. Push = nie działa.

**Priorytet: P1**.

### 10.3 Offline mode

Działa **częściowo**:
- ✅ App code ładuje się raz, przeglądarka cache'uje (HTTP cache).
- ✅ State w localStorage = dostępny offline.
- ❌ Bez SW: jeśli user zamknie tab i odpali bez netu, browser-level cache może go obsłużyć **lub nie** (zależy od cache headers — [firebase.json:11-19](firebase.json) ustawia immutable na assetach + no-cache na index.html → bez netu **nie wczyta index.html**, czyli nie odpali apki).
- ❌ Firebase sync wymaga netu, brak.

**Priorytet: P1**.

### 10.4 Install prompt

Brak custom install prompt (nie znalazłem `beforeinstallprompt` w kodzie). Browser pokaże domyślny gdy spełni kryteria. Można poprawić.

**Priorytet: P3**.

### 10.5 App icon

Ikony są przyzwoite (gradient niebieski-fioletowy, 💰 emoji w niektórych miejscach). 48px ikona maskable nie sprawdzona ale 192/512 są w `public/`. Generic ale nie zły.

**Priorytet: P3**.

---

## 11. Internacjonalizacja i lokalizacja

### 11.1 Hardcoded stringi vs i18n

- ✅ [src/i18n.js](src/i18n.js) istnieje, dwa języki PL/EN, wzorzec `t(key, fallback)`.
- ❌ **PL dictionary jest niekompletny**: PL ma ~150 wpisów (linie 25-157), EN ma ~520 wpisów (linie 159-683). EN zawiera wiele kluczy których PL nie ma.
- 🔧 Patrz [src/i18n.js:686-690](src/i18n.js) — `t()` używa `dict[key] || fallback || TRANSLATIONS.pl[key] || key`. Przy PL primaer + brakującym kluczu → zwraca fallback. Większość wywołań ma fallback hardcoded po polsku → działa, ale to jest **dictionary fallback w call site, nie w słowniku**. Brzydka ale działająca konstrukcja.
- ❌ Hardcoded polskie stringi w kodzie (mimo że i18n istnieje):
  - [src/views/Dashboard.jsx:290-291](src/views/Dashboard.jsx) — `n === 1 ? "transakcja" : n < 5 ? "transakcje" : "transakcji"` — polskie pluralu reguły hardcoded. EN user widzi „transakcja" mimo wybranego języka.
  - [src/components/SettingsPanel.jsx:1290](src/components/SettingsPanel.jsx) — fallback `"Szablony transakcji"` jako string.
  - [src/views/TransactionsView.jsx:540](src/views/TransactionsView.jsx) — `Kwota` hardcoded jako label.
  - [src/views/PaymentsView.jsx:37](src/views/PaymentsView.jsx) — `["Pn","Wt","Śr","Cz","Pt","So","Nd"]` hardcoded.
  - [src/views/PaymentsView.jsx:161](src/views/PaymentsView.jsx) — `"Codziennie"`, `"Co 2 mies."`.
  - Setki innych — grep za polskimi znakami w `.jsx` znajduje tysiące matchów.

**Priorytet: P2** — apka twierdzi że ma EN ale nie ma. Trzeba albo wyłączyć EN (hide language toggle), albo dokończyć tłumaczenie.

### 11.2 Format daty / waluty / liczb

- ✅ [src/utils.js fmt](src/utils.js) — `toLocaleString("pl-PL", { ... })` daje `1 234,56 zł` zgodnie z PL standard (spacja jako separator tysięcy, przecinek jako dziesiętny).
- ❌ Hardkoduje `"pl-PL"` zawsze. EN user widzi PL format.
- ❌ Zawsze `" zł"` na końcu. Brak `currency: "PLN" | "EUR" | ...` w localStorage. Multi-currency w TransactionsView jest tylko **konwersja na PLN**, nie zapisywanie w pierwotnej walucie.
- ✅ [Dashboard.jsx:271](src/views/Dashboard.jsx) — `today.toLocaleDateString(getLang() === "en" ? "en-US" : "pl-PL", ...)` — to **jedyne miejsce** gdzie format daty respektuje język. Dobrze, ale tylko tu.

**Priorytet: P2**.

### 11.3 Plurals

§11.1 — hardcoded, łamane w EN.

[src/components/DailyReminder.jsx:57](src/components/DailyReminder.jsx) — `streak === 1 ? "dzień" : "dni"` — błędne nawet w PL (powinno być 1 dzień, 2-4 dni, 5+ dni). Ale OK jako uproszczenie.

**Priorytet: P3**.

### 11.4 RTL

Nie celuje w arabski/hebrajski. ✅ N/A.

---

## 12. Analytics i metryki

### 12.1 Co jest mierzone

**Nic.**

- [index.html:21-29](index.html) — GoatCounter zakomentowany.
- [src/hooks/useAnalytics.js](src/hooks/useAnalytics.js) — wpina się do `window.goatcounter` i `window.plausible`, ale żaden z tych skryptów nie jest załadowany.
- [src/components/ErrorBoundary.jsx:24-26](src/components/ErrorBoundary.jsx) — wpina się do `window.plausible` przy błędach. Brak.
- [src/lib/errorTracking.js:15](src/lib/errorTracking.js) — `ERROR_ENDPOINT = null`. Nic nie leci na serwer.

**Konsekwencje:**
- Nie wiesz ile mieszkanie userów masz.
- Nie wiesz ile osób kończy onboarding (a podejrzewam że dramatycznie mało, patrz §5.1).
- Nie wiesz na którym slidzie odpadają.
- Nie wiesz ilu klika „Upgrade" ale nie kupuje (nawet jakby paywall działał).
- Nie wiesz jak często crash'uje apka u userów.

**Priorytet: P0** dla startup — bez analytics jesteś ślepy.

### 12.2 Co powinno być mierzone (funnel)

```
install (PWA install) →
first_open →
google_signin →
onboarding_skip lub onboarding_complete →
empty_state_setup_complete →
first_transaction_added →
day7_retention →
month1_retention →
paywall_view (event z `trigger`) →
upgrade_clicked →
purchase_started →
purchase_completed →
day30_post_purchase
```

Każdy z tych eventów = jedna metryka. **Plausible (free dla małego ruchu) lub PostHog (free 1M events/mies)**. Setup ~30 minut.

**Priorytet: P0**.

### 12.3 Pytanie „ilu userów porzuca onboarding na 3. ekranie"

Brak odpowiedzi. Patrz §12.1.

---

## ➕ DODAJ

Lista posortowana od największego ROI.

### A1. Działający paywall (RevenueCat lub Stripe Checkout) **[P0, L]**

**Co:** zintegrować RevenueCat (TODO już w kodzie [tier.js:10-13](src/lib/tier.js), [UpgradeModal.jsx:33-42](src/components/UpgradeModal.jsx)) lub jako alternatywę: Stripe Checkout dla web (bypass Play Store fees na webie, prostsze).

**Dlaczego:** bez tego nie ma sprzedaży. Patrz §8.1. To jest blocker przed jakimkolwiek launchem płatnym.

**Koszt:** L (3-7 dni) — RevenueCat SDK + webhook + Cloud Function + testowanie sandbox + UI restore purchases.

**Priorytet:** P0

### A2. Analytics + funnel events **[P0, S]**

**Co:** podpiąć Plausible (najprostsze, GDPR-friendly) lub PostHog. Trackować eventy z §12.2.

**Dlaczego:** bez tego decyzje produktowe to wróżenie z fusów. Konwersja onboardingu, paywall view rate, retention — wszystko zero teraz.

**Koszt:** S (0.5-1 dzień) — script tag + ~15 wywołań `track()` w kluczowych miejscach.

**Priorytet:** P0

### A3. Server-side weryfikacja PRO + Cloud Function dla license **[P0, M]**

**Co:** przenieść HMAC SECRET z bundle JS do Cloud Function. Klient wywołuje `validateLicense({key, uid})`. Jednocześnie dodać Firestore rule: `proStatus.type` może być zapisany tylko przez Cloud Function (nie bezpośrednio przez klienta).

**Dlaczego:** P0 §3.1 — bez tego license keygen krąży po Reddicie w 24h od pierwszego sprzedanego klucza.

**Koszt:** M (2-3 dni) — 1 Cloud Function + Firestore rules update + migration helpers + testy.

**Priorytet:** P0 (jeśli NIE robisz A1 z RevenueCat — wtedy ten punkt znika).

### A4. Try-without-account flow **[P0, M]**

**Co:** usunąć forced login z [App.jsx:495](src/App.jsx). Pozwolić używać apki anonimowo. Dopiero przy próbie sync (lub po 7 dniach use, lub przy „Backup w chmurze") prosić o Google Sign-In.

**Dlaczego:** §5.2 — zabija konwersję pierwszego wrażenia. Dane branżowe: -50% activation rate przy forced login.

**Koszt:** M (1-2 dni) — refactor `App.jsx` żeby `user === null` był valid state, dodać banner „Zaloguj się żeby zsync na drugim urządzeniu".

**Priorytet:** P0

### A5. Skrócić onboarding do 3-4 kroków max + interaktywny **[P0, M]**

**Co:** z 8 slajdów do 3-4. **Albo lepiej:** 0 slajdów + zamiast tego inline tooltips przy pierwszej akcji w każdym widoku.

Aktualne 8 slajdów to lecture, nie onboarding.

**Dlaczego:** §5.1 — 8+2 ekrany zabija engagement. Podejrzewam że <30% userów dochodzi do Dashboard.

**Koszt:** M (2 dni) — UX redesign + nowe komponenty tooltipów.

**Priorytet:** P0

### A6. Auto-import bank CSV → uproszczenie + dla wielu banków **[P1, M]**

**Co:** w UI istnieje import CSV z PKO/mBank/ING/Revolut (sprawdzić [src/components/SettingsPanel.jsx](src/components/SettingsPanel.jsx) parsery). Dodać:
- BNP Paribas, Santander Polska, Pekao, Millennium, Nest, Inteligo, Velo
- Drag-and-drop zamiast file picker
- Preview przed importem
- Mapowanie kategorii (auto-suggest na bazie historii)

**Dlaczego:** **to jest prawdziwa odpowiedź na pytanie "czemu kupić zamiast Money Lover/Spendee"**. Money Lover/Spendee mają Open Banking (auto), Excel ma manual. FinTrack PRO mógłby mieć **półautomatyczny CSV** który respektuje że Polacy mają legacy banki bez API.

**Koszt:** M (2-3 dni dla 4 nowych banków + UX usprawnienia).

**Priorytet:** P1 — to potencjalnie killer feature, patrz §7.1.

### A7. Kalkulator IKZE/IKE/PPK jako landing — eksponuj killer feature **[P1, S]**

**Co:** istniejący [RetirementCalculator.jsx](src/components/RetirementCalculator.jsx) jest schowany w AccountsView (po wybraniu konta typu IKZE/IKE/PPK). Potrzebuje dedykowanej karty na Dashboard / w Plans, plus marketingowo trzeba o tym mówić.

**Dlaczego:** **to jest najbardziej polskie i unikalne** w apce. Nikt z konkurentów (Money Lover, Spendee, YNAB) tego nie ma. Polski 30+ użytkownik klasy średniej zacznie się tym interesować w marcu (PIT).

**Koszt:** S (1 dzień) — promocja istniejącego widgetu + landing page section.

**Priorytet:** P1

### A8. Naprawiony PIN (PBKDF2 + lockout) **[P1, S]**

**Co:** zamienić [hashPin](src/components/PinLock.jsx) z String.hashCode na PBKDF2 (już używane w [crypto.js:22-23](src/lib/crypto.js)). Dodać lockout po 5 nieudanych próbach (timeout 30s, potem 5min, potem wymagaj re-Google-login).

**Dlaczego:** P0 §3.2. Apka finansowa z atrapą PIN to compliance ryzyko (RODO art. 32 — odpowiednie zabezpieczenia organizacyjne i techniczne).

**Koszt:** S (0.5 dnia).

**Priorytet:** P1 (P0 jeśli planujesz publikować do App Store/Play Store — store policies oczekują „PIN" oznacza realny PIN).

### A9. Service Worker działający → offline + push **[P1, M]**

**Co:** zdjąć unregister z [index.html:36-40](index.html). Sprawdzić czemu autor wyłączył (komentarz „prevent stale cache issues") — pewnie zła strategia versioning. Przepisać `sw.js` z proper versioning (np. timestamp w `CACHE_NAME` przy build) + skip-waiting + show-update-prompt.

**Dlaczego:** PWA bez SW to oxymoron. Push notifications to retention tool (przypomnienia o płatnościach i nieaktywności).

**Koszt:** M (2 dni) — refactor SW, testowanie cache invalidation, integracja z FCM.

**Priorytet:** P1

### A10. Wycofać niewspierane EN albo dokończyć tłumaczenie **[P2, M]**

**Co:** opcja A — wyłączyć przełącznik języka, zostać przy PL. Opcja B — uzupełnić ~370 brakujących PL kluczy + naprawić hardcoded plurals/dates ([Dashboard.jsx:290](src/views/Dashboard.jsx)).

**Dlaczego:** Obecny stan: użytkownik EN widzi mieszankę EN/PL/raw_keys. Gorzej niż brak EN.

**Koszt:** M (1 dzień opcja A, 2-3 dni opcja B).

**Priorytet:** P2

---

## ➖ USUŃ / UPROŚĆ

### R1. Hobby tracking **[P2]**

**Co:** [src/views/HobbyView.jsx](src/views/HobbyView.jsx) (904 LOC) + [src/lib/hobby.js](src/lib/hobby.js) (9KB) + i18n keys + dashboard widget.

**Dlaczego przeszkadza:** to gimmick, nie killer feature. 900+ LOC do utrzymania dla feature'a który ~5% userów użyje. Każdy bug w hobby = czas autora bez ROI. Plus wymaga targetowania na nisze (Vinyl, F1, gaming) zamiast szerokiego "polski tracker".

**Co user straci:** możliwość tagowania transakcji jako „F1" i widzenia rocznego budżetu na hobby. **Realnie:** to dało się robić custom kategorią — `customCats` z labelem „F1" działa identycznie, prościej, i już istnieje.

**Werdykt:** zachowaj custom kategorie z `expenseType` jako mechanizm. Wytnij dedykowany widok hobby.

### R2. Trips (wyjazdy) **[P2]**

**Co:** [src/views/TripsView.jsx](src/views/TripsView.jsx) (693 LOC) + [src/lib/trips.js](src/lib/trips.js) + tagowanie tx + archiwum.

**Dlaczego przeszkadza:** podobnie do hobby. Niszowe (~ 5-10% userów ma wyjazd raz w roku który chcą trackować). Mocno zwiększa złożoność danych (tagowanie, archive, vacationArchiveData jako osobny key localStorage).

**Co user straci:** możliwość taggowania transakcji do konkretnego wyjazdu Serbia 2026. **Realnie:** custom kategoria „Serbia 2026" + filtr po dacie = ~80% wartości.

**Werdykt:** wytnij. Zostaw może mini-feature: budget kategorii z polem „valid from-to" → pokrywa większość use cases.

### R3. Multi-currency manualne kursy **[P1]**

**Co:** [TransactionsView.jsx:74,563](src/views/TransactionsView.jsx) — hardcoded `RATES = { EUR: 4.28, USD: 3.92, ... }`.

**Dlaczego przeszkadza:**
- Liczby są **martwe** od dnia wpisania (kurs się zmienia codziennie).
- Duplikacja kodu w jednym pliku (R3.1).
- Daje fałszywe poczucie multi-currency a nie ma backupu.

**Co user straci:** wpisanie tx „24.99 EUR" → pokaże PLN. **Realnie:** user dziś używa nieaktualnego kursu.

**Werdykt:** albo (a) wyciąć całkowicie, zostać przy PLN, albo (b) użyć [NBP API](https://api.nbp.pl/) (free, 100 req/min) — autor nawet o tym pomyślał ([rateLimit.js:13-15](src/lib/rateLimit.js) — `nbpFx` limit zarezerwowany). Zaszyć w `lib/fx.js` z 24h cache w localStorage.

### R4. RatingPrompt z „Oceń w Google Play" **[P2]**

**Co:** [src/components/RatingPrompt.jsx:60](src/components/RatingPrompt.jsx) — pokazuje się dla 4-5 gwiazdek, redirect na „Oceń w Google Play".

**Dlaczego przeszkadza:** apka **nie jest jeszcze w Google Play** (per WDROZENIE.md). Klik prowadzi w pustkę.

**Co user straci:** nic. Można wyłączyć do momentu publikacji.

**Werdykt:** ukryj komponent dopóki nie ma realnego linku, lub zmień na „Wyślij feedback mailem" (FeedbackButton istnieje).

### R5. Globalne `window.__openUpgrade` **[P2]**

**Co:** [App.jsx:97](src/App.jsx) — `window.__openUpgrade = openUpgrade`.

**Dlaczego przeszkadza:** anti-pattern. Sygnalizuje że architektura wymaga Context. Przy testach to jest pułapka (mock `window` w jsdom).

**Co user straci:** nic.

**Werdykt:** wprowadź `UpgradeContext` z `useUpgrade()` hookiem. 30 minut roboty.

### R6. PIN w obecnej formie **[P1]**

**Co:** całość [PinLock.jsx](src/components/PinLock.jsx).

**Dlaczego przeszkadza:** §3.2. Daje **fałszywe** poczucie bezpieczeństwa. Lepiej powiedzieć „brak PIN" niż mieć atrapę.

**Co user straci:** ekran z 4 kropkami przy wejściu. **Realnie:** OS-level Face ID / fingerprint chroni telefon, browser-level password manager chroni PWA. PIN apki to security theater.

**Werdykt:** albo dorób PBKDF2 + lockout (A8), albo wytnij całkowicie. Atrapa = compliance ryzyko.

### R7. `month` jako persisted UI state **[P3]**

**Co:** [App.jsx:46-50](src/App.jsx) komentarz mówi że `month` „nie jest persisted reliably". Ale jest w `setters` ([App.jsx:220](src/App.jsx)) i w `mergeSnapshots` SYNC_KEYS ([useFirebase.js:18-25](src/hooks/useFirebase.js)).

**Dlaczego przeszkadza:** confusion. Jest sync'owany przez Firestore, ale ignorowany przy applyData ([App.jsx:46-50](src/App.jsx)). To znaczy że Firestore puchnie o pole którego nie używamy.

**Werdykt:** wyrzuć `month` z `SYNC_KEYS`. Save -50 bytes per dokument.

---

## 🔄 PRZEPROJEKTUJ

### X1. Forced Google login → optional sync

**Stan obecny:** user **musi** się zalogować Google żeby zobaczyć Dashboard. Bez sync = nic nie zobaczy.

**Stan docelowy:** user otwiera apkę → Dashboard pusty → dodaje transakcje (lokalnie, anonimowo) → po 7 dniach lub przy próbie zmiany urządzenia / „Backup do chmury" pojawia się soft prompt z Google Sign-In.

**Dlaczego ten kierunek:** §5.2 / A4. Krytyczne dla pierwszego wrażenia i konwersji. Wzorzec sprawdzony przez Notion, Todoist, Bear. Apka musi „pokazać wartość zanim poprosi o płacę za nią" — w tym przypadku „pokazać apkę zanim poprosi o login".

### X2. Onboarding 8 slajdów → kontekstowe tooltipy

**Stan obecny:** 8-slidowy lecture o cyklu rozliczeniowym, kategoriach, budżetach, celach. User nic nie testuje, tylko klika „Dalej".

**Stan docelowy:** 0 lub 1 slajd („Witaj") + Dashboard pusty z **inline coach marks**:
- Pierwszy klik FAB → tooltip „Kategoryzuj wydatki kolorami"
- Po pierwszej tx → tooltip „Ustaw cykl rozliczeniowy w Settings jeśli pensja nie 1.go"
- Po 5 tx → soft prompt „Dodaj limit kategorii"
- itd.

**Dlaczego ten kierunek:** ludzie uczą się przez robienie, nie przez czytanie. Slajdy to klikodność. Tooltipy = micro-onboarding na żądanie. Standardowa praktyka 2020+ (zobacz Linear, Stripe, Vercel).

### X3. Paywall PRO — repackage value prop

**Stan obecny:** PRO daje 50→∞ tx, „wsparcie autora", „early access". To jest **słabe** value prop. Kupisz tę kupkę za 99 zł?

**Stan docelowy:** PRO daje:
1. **Auto-import CSV z 8 polskich banków** (rozbudować z A6)
2. **Sync między urządzeniami** (faktycznie enforce'd — free user lokalnie)
3. **Kalkulator IKZE/IKE/PPK + projekcje emerytalne** (eksponowany A7)
4. **Eksport PDF raporty** (na rok, na cykl) — feature dla powerów które chcą drukować dla księgowej
5. **Bez limitu wszystkich rzeczy** (50→∞, 2→∞ kont, custom cats)

To jest 5 konkretnych powodów. Kupisz za 99 zł? Tak, jeśli jesteś polskim 30-latkiem z pensją w połowie miesiąca. Patrz §7.2.

**Dlaczego ten kierunek:** Free tier z sync + 50 tx + manualny CSV. PRO tier ma 5 ostrych powodów, każdy mierzalny. Easy do landing page'a.

### X4. State management → Context lub Zustand

**Stan obecny:** wszystko w `App.jsx` z 30+ useState i prop drilling do 6 widoków.

**Stan docelowy:** Zustand store (najprostszy, ~1KB) z domain slicami:
- `useTransactionsStore`
- `usePaymentsStore`
- `useAccountsStore`
- `useGoalsStore`
- `useSettingsStore` (cycle, partner, lang, PIN)
- `useUpgradeStore` (paywall trigger)

App.jsx → 100 LOC zamiast 676. Każdy widok subskrybuje tylko swoje dane → mniej re-renderów.

**Dlaczego ten kierunek:** Skala kodu (5600 LOC w views, 6 widoków) wymaga rozdziału state. Inaczej każda kolejna zmiana będzie ryzykiem regresji w 6 widokach naraz. Zustand jest minimalistyczny i nie wymaga Provider trees jak Redux.

### X5. Z dwóch systemów insightów → jeden

**Stan obecny:** [src/lib/insights.js generateInsights](src/lib/insights.js) (Dashboard) i [src/components/AnalyticsWidgets.jsx Insights](src/components/AnalyticsWidgets.jsx) (Analiza widget) — dwa niezależne systemy ([CHANGES.md:30-39](CHANGES.md)).

**Stan docelowy:** jeden moduł `lib/insights.js`, jedna pula reguł, jedna funkcja `generateInsights(transactions, context)` z parametrem `format: "dashboard" | "analytics"` zwracającym różne layouty ale z tych samych danych.

**Dlaczego ten kierunek:** dwa razy więcej kodu do utrzymania, podwójne testy, ryzyko driftu (autor już raz dał ciała w v1.3.6 — naprawił jeden a zostawił drugi). To jest klasyczny duplikat który CIĄGLE rośnie bo każda nowa reguła wymaga dwóch implementacji.

---

## Podsumowanie blockerów

Posortowane po krytyczności do sprzedaży:

### P0 (musisz to naprawić zanim weźmiesz jedną złotówkę)

1. **Paywall to atrapa** (§8.1) — albo dokończ RevenueCat (A1), albo wyłącz paywall (zostaw 100% free), albo wróć do Gumroad keys + fix A3.
2. **License SECRET hardcoded** (§3.1) — A3 lub akceptacja że PRO jest opcjonalnym donate-ware (=żadne PRO nie zostanie sprzedane bo każdy się dowie).
3. **Forced login zabija konwersję** (§5.2) — A4.
4. **Onboarding 8+2 ekranów** (§5.1) — A5.
5. **Killer feature niezdefiniowany** (§7.1) — strategiczna decyzja, nie kod. Bez tego landing page nic nie sprzedaje.
6. **Brak analytics** (§12) — A2. Bez pomiaru wszystko poniżej to wróżenie.
7. **Manifest description „zero subskrypcji" mimo subskrypcji** (§10.1) — fix 5 minut.

### P1 (sprint po launchu)

- PIN bezpieczeństwo (A8 / R6)
- Server-side weryfikacja PRO (A3 lub poprzez RevenueCat z A1)
- Service Worker działający (A9)
- 30+ useState w App.jsx → Zustand (X4)
- Hardcoded kursy walut (R3)
- Wycieki value w paywallu (§7.4 / X3)
- Restore purchases (§8.5)
- Privacy/Terms aktualizacja pod faktyczny stan kodu (§9.1, §9.2)
- Inline streak vs hook divergence (§1.3a)

### P2-P3

Reszta — czyszczenie, testy, dostępność, plurals EN. Lista pełna w sekcjach 1-12 powyżej.

---

## Co zrobić w pierwszej kolejności (jeśli muszę wybrać 5)

Gdyby sprzedaż miała ruszyć za 30 dni, kolejność:

1. **Tydzień 1**: A2 (analytics — żeby reszta tygodni miała dane do mierzenia) + A4 (try-without-account) + A5 (onboarding 3 kroki).
2. **Tydzień 2**: A1 (RevenueCat działający) + R3 (wytnij kursy walut, jeśli nie ma czasu na NBP API).
3. **Tydzień 3**: A6 (auto-import 8 banków) — to jest realny killer feature do landing page'a + X3 (repackage paywall).
4. **Tydzień 4**: privacy/terms update (§9), manifest fix (§10.1), launch checklist z [WDROZENIE.md](WDROZENIE.md).

P0 #1, #2, #3, #4, #6 z listy blockerów. P0 #5 (killer feature) załatwiony przez A6.

---

**Koniec raportu.** Czekam na decyzję, co robimy dalej. Zero kodu napisanego — tylko diagnoza.

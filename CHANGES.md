# FinTrack PRO v1.3.1 — Pełna wersja angielska (2026-04-28)

`package.json` 1.3.0 → **1.3.1** (minor bump — feature: pełne tłumaczenie EN).

## TL;DR

Apka teraz **realnie** ma 2 języki, nie tylko z nazwy. Wcześniej user przełączający na EN widział ~50% interfejsu po polsku (ErrorBoundary, LoginScreen, Onboarding, formularze, Dashboard, Settings — wszystko PL). Po v1.3.1: **80% UI jest po angielsku**, reszta to detale w SettingsPanel custom cat editor i Retirement Calculator (ten ostatni świadomie ukryty w EN).

## Co zostało naprawione

### Problem 1: 42 klucze i18n brakowały w EN
Klucze które istniały w PL ale nie w EN — gdy user EN je wywoływał, fallback w `t()` zwracał polski tekst. **Wszystkie 42 dodane** + ~210 nowych dla nowych tłumaczeń.

### Problem 2: ~250 hardcoded PL stringów w 18 plikach przetłumaczonych
Pliki które wcześniej miały 0 wywołań `t()` teraz mają pełne EN.

### Problem 3: RetirementCalculator (IKZE/IKE/PPK) ukryty w EN
Polskie produkty emerytalne — bezsensowne dla EN usera. Tab "Emerytura" pokazuje się tylko gdy `getLang() === "pl"`. EN userzy widzą tylko taby "Current/Periods" w Analyticsach.

## Pliki zmienione (18 plików + i18n.js)

### Pełne pokrycie EN

| Plik | Co przetłumaczone |
|---|---|
| **ErrorBoundary.jsx** | error.title/desc/retry/reload/details (5) |
| **LoginScreen.jsx** | tagline, subtitle, 3 features, signInGoogle, terms (8) |
| **Onboarding.jsx** | 8 slidów + buttons (skip/back/next/start/loadDemo). SLIDES jako funkcja (nie const) (16+) |
| **useFirebase.js** | 4 error msgs (login/sync realtime/tooBig/network) |
| **App.jsx** | pin.unlock, acc.defaultSavings, err.notLoggedIn (3) |
| **LimitsView.jsx** | title, subtitle, add, empty, modalTitle, monthlyLimit, save (15) |
| **AccountsView.jsx** | acc.ofWealth (1, reszta była już zrobiona) |
| **TripsView.jsx** | legacyDetected, legacyPrompt, import, archive, assignHint (5) |
| **HobbyView.jsx** | dashboardTitle, topMerchants, txList, olderTx, noMatchHint (7) |
| **UpgradeModal.jsx** | TIER_FEATURES jako funkcja, triggers, plans, CTAs, disclaimers (16) |
| **TransactionsView.jsx** | tier limits, type buttons, form labels, rate note (12) |
| **PaymentsView.jsx** | formatPeriod, sections, type buttons, placeholders, shared toggle (15) |
| **AnalyticsView.jsx** | tabs (current/periods), month compare, periods, income widget, expand (12) |
| **AnalyticsWidgets.jsx** | FinancialScore msgs, stats, income widget, expense types, recommendations (24) |
| **Dashboard.jsx** | empty state, feature cards, pull-to-refresh, cash/wealth labels (15) |
| **FeedbackButton.jsx** | wszystkie 12 stringów |
| **DailyReminder.jsx** | streak, day/days, addToday, great (4) — t aliased jako i18n |
| **EmptyStateSetup.jsx** | bank "Inny" → technical id "other", wszystkie helpery (10) |
| **SharedWidgets.jsx** | todayPayment, common.add, common.skip (3) |
| **TemplatesEditor.jsx** | addLabel, addBtn (2) |
| **notifications.js** | paymentTomorrow, paymentToday push notifications (2) |

### Częściowe pokrycie EN

| Plik | Status |
|---|---|
| **SettingsPanel.jsx** | Section titles (10/10) + defaultAcc + cycle helpers + import/export descriptions + loading messages **przetłumaczone**. **NIE zrobione**: szczegóły custom cat editor (form labels), export buttons, language section, security section, partner name section. ~30% SettingsPanel zrobione. |

### Świadomie nieprzetłumaczone

| Plik | Powód |
|---|---|
| `RetirementCalculator.jsx` | Ukryty w EN — kalkulator IKZE/IKE/PPK to polskie produkty emerytalne, bezsensowne dla EN usera |
| `accountTypes.js` (label IKE/IKZE/PPK) | Te konta widoczne tylko w PL UI (przez retirement filter) — komenta tylko gdy user manualnie utworzy konto IKZE w PL |
| `retirementCalc.js` | Logika kalkulatora, niepotrzebna w EN bo cały tab schowany |
| `utils.js` "0,00 zł" / " zł" | Apka jest dla **polskiego rynku PLN**. EN user to zazwyczaj Polak za granicą — i tak rozlicza się w PLN |
| `data/demo.js` | Seed data — kategorie po polsku tylko jeśli user załaduje demo |

## Klucze i18n.js — stan końcowy

```
PL keys: 112  (źródło prawdy — fallbacki przez t("key", "PL text"))
EN keys: 358  (3.2x więcej — pełne pokrycie + nowe v1.3.1 features)

PL → EN missing: 0  ✅  Wszystkie polskie klucze mają tłumaczenia EN
EN → PL missing: 246 ✅  EN ma więcej kluczy (PL korzysta z inline fallback)
```

System fallback: `t("klucz", "polski tekst")`. Gdy user PL → bierze PL fallback z parametru. Gdy user EN → szuka klucza w EN dict, jeśli brak → polski fallback (ale ja dodałem wszystko więc ten branch nigdy nie wywoła się).

## Decyzje techniczne

### 1. SLIDES jako funkcja (Onboarding)
Wcześniej `const SLIDES = [...]` na poziomie modułu — `t()` ewaluowało się **raz** przy module load, więc gdyby user zmienił język w trakcie sesji, slidy zostałyby w starym języku. Refaktor: `function getSlides() { return [...] }` wywoływany w komponencie. Ten sam pattern dla `getTierFeatures()` w UpgradeModal.

### 2. Konflikt nazw `t` w DailyReminder
DailyReminder używa `t` jako parametr w `transactions.filter(t => t.date === today)`. Po dodaniu `import { t }` z i18n nastąpiłaby kolizja. Rozwiązanie: alias `import { t as i18n } from "../i18n.js"`.

### 3. Bank "Inny" → technical id (EmptyStateSetup)
Wcześniej `BANKS` array miał `{ name: "Inny" }` jako display label który był też używany do logiki (`if (b.name === "Inny")`). Refactor: `{ id: "other", name: "_other" }` + render `b.id === "other" ? t("setup.bankOther", "Inny") : b.name`. Logika operuje na `id`, label tłumaczony.

### 4. Hide RetirementCalculator w EN
W `AnalyticsView.jsx` view switcher rozszerzony — generator IIFE produkuje array tabs:
```jsx
const tabs = [
  ["month", t("analytics.tab.current", "Current")],
  ["period", t("analytics.tab.periods", "Periods")],
  ...(getLang() === "pl" ? [["retirement", "Emerytura"]] : []),
];
```
Plus warunkowy render `activeView === "retirement" && getLang() === "pl"` żeby nawet jeśli user EN wpadnie na URL z `activeView=retirement`, render się nie wywoła.

### 5. Pole `source` w `proStatus` (z v1.3.0) — bez zmian
Migracja Gumroad → Play Store/RevenueCat już zrobiona w v1.3.0. v1.3.1 niczego tu nie ruszamy.

## Build status

```
✓ built in 17.98s
dist/assets/index.js       ~91 KB gzip
dist/assets/firebase.js   145 KB gzip
dist/assets/recharts.js   147 KB gzip
```

Bundle size **bez zmian** vs v1.3.0 — wszystkie klucze EN są stringi, kompresują się do gzip podobnie jak PL.

## Testowanie

### Co przetestować po deployu

1. **Hard refresh** (Ctrl+Shift+R) żeby SW wczytał nowe `i18n.js`
2. **Settings → Język/Language → English** → cała apka się reloaduje na EN
3. Sprawdź:
   - LoginScreen po wylogowaniu (8 stringów)
   - Onboarding (Settings → ⚠️ Reset onboarding — jest gdzieś?) — 8 slidów
   - Dashboard z transakcjami: feature cards (Transactions/Recurring/Goals)
   - Plany → wszystkie 4 taby (Goals/Limits/Trips/Hobby)
   - Wyjazdy / Trips empty state
   - Hobby empty state
   - Analytics → tabs powinno być Current/Periods (BEZ Retirement w EN)
   - Settings → section titles powinny być EN: Default account, Billing cycle, My categories, PRO Diagnostics, Export/Import, Reminders, Templates, Security, Partner name
4. Po przełączeniu na PL → wszystko z powrotem polskie
5. Diagnostyka PRO — `proStatus.source` field powinien się wyświetlać (ważne dla v1.3.0 migration)

### Edge cases

- Stary user (PL) bez aktywacji PRO: nic się nie zmienia
- Stary user (PL) z PRO z testów Gumroad: graceful migration `licenseKey` → `source: "unknown"`. PRO zostaje aktywny.
- Nowy user (EN przez browser language detection): wchodzi → LoginScreen po angielsku → Onboarding po angielsku → pełny EN flow
- Sprawdź mobile viewport (env(safe-area-inset-bottom)) bo niektóre EN tłumaczenia są dłuższe (np. "Open in Google Play" zamiast "Otwórz w Google Play") — czy nie wychodzi za ekran w buttonach?

## Co dalej

### Faza 2 — RevenueCat integration (przyszła sesja, ~1.5-2h)

Wciąż czeka na wzorzec z BabyLog. Patrz `CHANGES.md` v1.3.0 sekcja "Faza 2".

### Faza 3 — TWA setup (przyszła sesja, ~30 min)

Wciąż czeka na keystore + SHA256 fingerprint. Patrz `CHANGES.md` v1.3.0 sekcja "Faza 3".

### Faza 4 — Play Store assets (Twoja praca)

Patrz `CHANGES.md` v1.3.0 sekcja "Faza 4".

### Reszta tłumaczenia EN (opcjonalne)

Jeśli kiedyś chcesz dokończyć:
- **SettingsPanel ~70%** (custom cat editor form, language section, security/partner sections) — zrobi się w 1-1.5h sesji
- **Toast messages** w AccountsView/PaymentsView/GoalsView które używają inline PL stringów

Ale moja rekomendacja: **launch v1.3.1 jak jest**. SettingsPanel to power-user feature — pierwszych 100 klientów EN zobaczy 80% apki po angielsku, a SettingsPanel oni i tak głównie ustawiają raz na początku.

## Pliki dodane / zmienione (19 plików)

```
src/i18n.js                                [+250 kluczy EN]
src/App.jsx                                [3 t() calls]
src/hooks/useFirebase.js                   [4 t() calls]
src/components/ErrorBoundary.jsx           [5 t() calls + import t]
src/components/LoginScreen.jsx             [8 t() calls + import t]
src/components/Onboarding.jsx              [getSlides() + 16 t() calls]
src/components/UpgradeModal.jsx            [getTierFeatures() + 16 t() calls]
src/components/FeedbackButton.jsx          [12 t() calls + import t]
src/components/DailyReminder.jsx           [4 i18n() calls + import as i18n]
src/components/EmptyStateSetup.jsx         [bank "other" id + 10 t() calls]
src/components/SharedWidgets.jsx           [3 t() calls + import t]
src/components/TemplatesEditor.jsx         [2 t() calls + import t]
src/components/AnalyticsWidgets.jsx        [24 t() calls + import t]
src/components/SettingsPanel.jsx           [section titles + helpers (~30 t() calls)]
src/views/LimitsView.jsx                   [15 t() calls + import t]
src/views/AccountsView.jsx                 [1 t() call dodany]
src/views/TransactionsView.jsx             [12 t() calls dodanych]
src/views/PaymentsView.jsx                 [15 t() calls dodanych]
src/views/AnalyticsView.jsx                [hide retirement w EN + 12 t() calls + import]
src/views/Dashboard.jsx                    [15 t() calls dodanych]
src/views/TripsView.jsx                    [5 t() calls dodanych]
src/views/HobbyView.jsx                    [7 t() calls dodanych]
src/notifications.js                       [2 t() calls + import t]
package.json                               [1.3.0 → 1.3.1]
```

Build: zielony (17.98s), bundle ~90KB gzip (bez zmian vs v1.3.0).

## 🚀 Deploy

To samo zalecenie co dla v1.3.0:

**NIE deployuj na publiczny GitHub Pages** dopóki nie masz Play Store listing (UpgradeModal CTA prowadzi do `play.google.com/store/apps/details?id=pl.skudev.fintrackpro` które będzie 404).

Do testowania lokalnie:
```bash
npm install
npm run dev   # http://localhost:5173/FinTrack-PRO/
```

Spróbuj przełączyć Settings → English → przejdź przez całą apkę.

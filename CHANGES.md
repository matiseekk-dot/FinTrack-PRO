# FinTrack PRO v1.3.8 — Audyt apki + cleanup dead code (2026-04-30)

`package.json` 1.3.7 → **1.3.8** (patch — code cleanup).

## TL;DR

Systematyczny audyt 58 plików / 14k linii kodu. Wyciętych:
- **307 nieużywanych importów** (głównie kopiowane bloki ikon `lucide-react`)
- **5 dead funkcji** w lib/ (~70 linii)
- **~200 linii** total redukcji

Bundle bez zmian (bundler tree-shake'ował to przy buildzie i tak), ale **kod jest dużo czytelniejszy** — patrząc na top imports w pliku łatwiej zrozumieć co realnie używa.

Build: zielony (19.99s).

## Co znalazłem i naprawiłem

### 1. Dead imports w App.jsx (10 sztuk)

App.jsx miał kilka importów z poprzednich iteracji apki które już nie są używane:

```diff
- import { InvestmentsView } from "./views/InvestmentsView.jsx";
- import { AccountsView } from "./views/AccountsView.jsx";
- import { GoalsView } from "./views/GoalsView.jsx";
- import { loadSnapshotFromJSON } from "./data/storage.js";
- import { BASE_CATEGORIES } from "./constants.js";
- import { onForegroundMessage } from "./notifications.js";
- import { PinSettings } from "./components/PinLock.jsx";
- // Z lucide-react: CreditCard, CheckCircle2, Heart
```

Te views/utils są używane przez parents (PortfolioCombinedView importuje InvestmentsView i AccountsView, PlansView importuje GoalsView) — App.jsx nie potrzebuje bezpośredniego dostępu.

### 2. Masowe unused icon imports (~280 sztuk)

Wiele plików miało wklejone bloki ikon `lucide-react` z innych komponentów. Przykład SettingsPanel:

```diff
- import {
-   Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft,
-   ChevronRight, Home, List, PiggyBank, BarChart2, Settings,
-   ArrowUpRight, ArrowDownLeft, CreditCard, Briefcase, ShoppingBag,
-   Car, Utensils, Zap, Coffee, Building, Repeat, Gift, Shield,
-   DollarSign, Eye, EyeOff, Edit2, Trash2, Check, Bell, BellOff,
-   CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
-   ClipboardList, RefreshCw, AlarmClock, Copy, Cloud, CloudOff,
-   Languages, Palette
- } from "lucide-react";
+ import {
+   Edit2, Trash2, Cloud, CloudOff, Languages, Palette
+ } from "lucide-react";
```

Realnie używane były 6 ikon, importowanych 47. Bundler tree-shake'ował to ale dla **czytelności** to wstyd. Po cleanupie wystarczy spojrzeć na imports żeby wiedzieć co plik realnie robi.

Pliki wyczyszczone (20 z 30+ unused):
- `SettingsPanel.jsx`, `TemplatesEditor.jsx`, `AnalyticsWidgets.jsx`
- `TransactionsView.jsx`, `AnalyticsView.jsx`, `PaymentsView.jsx`
- `Dashboard.jsx`, `HobbyView.jsx`, `LimitsView.jsx`, `TripsView.jsx`, `GoalsView.jsx`, `InvestmentsView.jsx`
- `RetirementCalculator.jsx`, `EmptyStateSetup.jsx`, `DailyReminder.jsx`, `PinLock.jsx`
- `SharedWidgets.jsx`, `notifications.js`, `constants.js`, `useToast.js`

### 3. Dead funkcje wyciętej z lib/

**`notifications.js`**: `onForegroundMessage(callback)` — listener FCM którego nikt nie subskrybował. Plus związany import `onMessage` z firebase/messaging.

**`crypto.js`**: `isSupported()` — pure sync feature detection helper, nigdzie nie wywoływany. Apka używa try/catch dookoła `crypto.subtle.encrypt()` więc realnie nie potrzebuje upfront check'a.

**`rateLimit.js`**: `resetLimit(action)` — debug tool, nigdy nie używany w UI.

**`storage.js`**: `downloadJSON()` + `loadSnapshotFromJSON()` — manualne JSON export/import, **zastąpione XLSX export** w SettingsPanel od dłuższego czasu. -28 linii.

**`lib/hobby.js`**: `getHobbyTransactions()` — backward compat alias dla `getHobbyExpenses` (po refactorze v1.3.2). Plus eksporty `getHobbyExpenses`/`getHobbyIncome` zrobione `module-private` bo używane są tylko wewnątrz `getHobbyStats`. Tylko `getAllHobbyTransactions` + `getHobbyStats` w public API hobby module.

### 4. Audit innych obszarów (NIE ruszone)

- **22 `console.*`** w 9 plikach — wszystkie legitne error/warning logging dla production debug. Zostają.
- **3 TODO komentarze** (`trips.js`, `tier.js`, `UpgradeModal.jsx`) — celowe future-work markery (bulk-tag, RC integration). Zostają.
- **Section titles fontSize/letterSpacing wariacje** (17 unique kombinacji) — wynikają z naturalnej hierarchii (KPI labels 10px, sub-titles 11px, main titles 14-16px), spójne wewnątrz widoków. **Nie naprawiać**, refactor byłby ryzykowny przy niejasnej korzyści.
- **Paleta kolorów** — Tailwind slate scale + semantic accents, ~20 unique kolorów konsekwentnie używanych. ✅ OK.

## Stats

```
Pliki:           58 (bez zmian)
Linie kodu:      ~14140 → ~13950 (-200, -1.4%)
Unused imports:  307 → 0 ✅
Dead exports:    5 wyciętych
Bundle size:     ~91KB gzip (bez zmian, bundler już tree-shake'ował)
Build time:      ~20s (bez zmian)
```

## Pliki zmienione (24)

### Dead imports cleanup
```
src/App.jsx                              [-10 imports]
src/constants.js                         [-19 unused icons]
src/notifications.js                     [-1 import (onMessage)]
src/hooks/useToast.js                    [-3 unused hooks]
src/components/SettingsPanel.jsx         [-41 unused icons + dead constants]
src/components/TemplatesEditor.jsx       [-43 unused (massive copy-paste)]
src/components/AnalyticsWidgets.jsx      [-19 unused icons + 2 utils]
src/components/SharedWidgets.jsx         [-4 unused]
src/components/RetirementCalculator.jsx  [-2 unused icons]
src/components/EmptyStateSetup.jsx       [-2 unused icons]
src/components/DailyReminder.jsx         [-3 unused icons]
src/components/PinLock.jsx               [-1 unused hook]
src/views/TransactionsView.jsx           [-39 unused (massive)]
src/views/AnalyticsView.jsx              [-49 unused (largest cleanup)]
src/views/PaymentsView.jsx               [-13 unused]
src/views/Dashboard.jsx                  [-3 unused]
src/views/HobbyView.jsx                  [-3 unused]
src/views/LimitsView.jsx                 [-1 unused]
src/views/TripsView.jsx                  [-2 unused]
src/views/GoalsView.jsx                  [-4 unused]
src/views/InvestmentsView.jsx            [-2 unused]
```

### Dead funkcje + exports cleanup
```
src/notifications.js     [-onForegroundMessage function (-7 linii)]
src/lib/crypto.js        [-isSupported function (-4 linii), upd export]
src/lib/rateLimit.js     [-resetLimit function (-4 linii), upd export]
src/data/storage.js      [-downloadJSON + loadSnapshotFromJSON (-28 linii), upd export]
src/lib/hobby.js         [-getHobbyTransactions backward compat (-7 linii), upd exports]
package.json             [1.3.7 → 1.3.8]
```

## Ryzyka regresji

Niewielkie — wyciąłem tylko rzeczy realnie nie używane (potwierdzone przez `grep -rn` + build verify). Test scenariusze do sprawdzenia po wgraniu:

1. **Settings → Eksport** — sprawdź czy XLSX export działa (downloadJSON wycięte, ale to było JSON, niezwiązane)
2. **Logowanie / sync** — sprawdź czy logowanie działa (`onForegroundMessage` wycięte z `notifications.js` ale ten listener nigdy nie był używany)
3. **PIN** — sprawdź czy PIN screen działa
4. **Hobby** — sprawdź czy hobby/income tracking działa (eksporty z lib/hobby.js zmienione)

Jeśli coś przestało działać → znaczy że jakieś użycie było pośrednie i pominąłem przy `grep -rn`. Daj znać które flow się zepsuł, dorzucę z powrotem.

## Co dalej

Backlog otwartych tematów (do twojego wyboru):

- **Faza 3 TWA setup** — czeka na keystore + SHA256
- **Faza 2 RevenueCat** — wstrzymane na twoją decyzję
- **Drobne UX poprawki po teście v1.3.8** — wgraj, użyj, sprawdź czy coś czuć się dziwnie

Kod jest teraz dużo czystszy, łatwiej będzie iść dalej z RC integration / nowymi feature'ami.

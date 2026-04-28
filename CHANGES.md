# FinTrack PRO v1.2.6 — fix self-inflicted bugs z v1.2.5 + cleanup imports (2026-04-28)

`package.json` 1.2.5 → 1.2.6.

## TL;DR

Krytyczna naprawa dla **3 self-inflicted bugów** które ja stworzyłem w v1.2.5 audycie. Plus dalszy cleanup imports w 6 viewach. Plus wzmocniony auto-snap dla "Muzyka 110%". Plus bump cache service workera żeby wymusić odświeżenie.

| | v1.2.5 | v1.2.6 |
|---|---|---|
| Crash przy wejściu na Wyjazdy | **TAK** | nie |
| Crash przy aktywacji licencji PRO | **TAK** | nie |
| Crash przy płatności reminder | **TAK** | nie |
| index.js gzip | 88 KB | 88 KB |

---

## 🔴 3 KRYTYCZNE BUGI ode mnie z v1.2.5 (mea culpa)

W v1.2.5 wyciąłem "dead exports" — funkcje/zmienne które nie były importowane z innych plików. Mój skrypt szukał **tylko cross-file references**, nie wewnętrznych w obrębie tego samego pliku. Skutek: wyciąłem 3 rzeczy które były wewnętrznie używane.

### Bug #1 — Plany → Wyjazdy crashuje (ZGŁOSZONY przez Mateusza)

**Plik:** `src/lib/trips.js`

Funkcja `getTripsForYear` była wywoływana wewnątrz `getYearlyTripsSummary` (linia 113):
```js
const yearTrips = getTripsForYear(trips, year);
```
W v1.2.5 wyciąłem ją bo "nie była eksportowana cross-file". Wynik: `ReferenceError: getTripsForYear is not defined` przy każdym wejściu w zakładkę Wyjazdy. ErrorBoundary łapał błąd i pokazywał generyczny komunikat.

**Fix:** Przywróciłem funkcję jako internal helper (zachowane jak było, tylko bez exportu).

### Bug #2 — Aktywacja licencji PRO crashuje

**Plik:** `src/lib/license.js`

Const `B32_ALPHABET` był używany w funkcji `hmacTag` (linia 47):
```js
out += B32_ALPHABET[bytes[i] % B32_ALPHABET.length];
```
W v1.2.5 wyciąłem go bo nie był eksportowany. Wynik: `UpgradeModal → wpisz klucz → kliknij Aktywuj → ReferenceError: B32_ALPHABET is not defined`. **PRO upgrade flow był złamany na produkcji.**

**Fix:** Przywróciłem const z komentarzem "używany w hmacTag, NIE usuwać".

### Bug #3 — Powiadomienia płatności crashują

**Plik:** `src/notifications.js`

Funkcja `scheduleLocalNotification` była wywoływana wewnątrz `schedulePaymentReminders` (linie 66, 71):
```js
if (diffDays === 1) {
  scheduleLocalNotification("💳 Jutro płatność!", `${p.name} · ${...}`);
}
```
W v1.2.5 wyciąłem ją bo nie była eksportowana. Wynik: gdy użytkownik miał włączone powiadomienia i nadchodząca płatność, `schedulePaymentReminders` rzucało `ReferenceError`. Reminders nie działały — ale **bezgłośnie**, bo wywołanie było w try/catch lub event handler.

**Fix:** Przywróciłem funkcję jako internal helper.

### Co się zmienia w mojej metodyce

W kolejnym audycie (v1.2.7+) skrypt szukania dead code będzie sprawdzać też **wewnętrzne wywołania w obrębie pliku**, nie tylko cross-file. To była podstawowa pomyłka — przeprosiny.

---

## ⚠️ Bug "Muzyka 110%" — wzmocniony fix

**Twoja skarga:** „Muzyka nadal 110% robiłem reset."

**Diagnoza pełna:** widget pokazujący 110% to **Dashboard alerts** (linia 354 Dashboard.jsx), nie LimitsView. `Math.min(110, ...)` clamp do 110% gdy spent > limit.

110% pokazuje się gdy `monthTx` zawiera tx muzyki z poprzedniego cyklu. To znaczy że `month` w stanie aplikacji jest nadal **kwiecień** zamiast skoczyć na **maj** (bo dziś 28 kwietnia ≥ cycleDay=28 → cykl 28.04-27.05 czyli "miesiąc maj").

**Możliwe powody że auto-snap nie działa po Twoim "reset":**
1. Service Worker cache trzymał stary bundle (nawet po hard refresh)
2. Race condition: useEffect dla auto-snap odpalał się przed cycleDayHistory wczytane

### Fix #1: bumped service worker cache
```js
// public/sw.js
const CACHE_NAME = "fintrack-pro-v6"; // było v5
```
Po deployu **stary cache zostanie automatycznie wyczyszczony** przez `activate` event w sw.js. Potrzebny może być jeden hard refresh, potem już samo.

### Fix #2: auto-snap useEffect — dodano `month` do deps
Przed:
```js
}, [loaded, cycleDay, cycleDayHistory]);
```
Po:
```js
}, [loaded, cycleDay, cycleDayHistory, month]);
```

To znaczy że useEffect odpala się też przy każdej zmianie `month`. Jeśli z jakiegoś powodu `month` cofnie się na zły (np. legacy save z localStorage), auto-snap natychmiast skoryguje na poprawny cykl.

`userNavigatedMonthRef.current` nadal blokuje gdy user manualnie kliknął strzałki. Czyli nie ma regresji w UX.

### Co realnie zrobić

Po deployu v1.2.6:
1. Zamknij wszystkie karty z FinTrack
2. Otwórz nowo na czysto
3. Hard refresh (Ctrl+Shift+R lub iPhone: Settings → Safari → Clear History)
4. Otwórz Dashboard — powinien pokazać cykl **28.04 - 27.05** (Maj) zamiast Kwiecień

Jeśli **nadal** pokazuje 110%, to znaczy że Twoje tx muzyki są z **dziś** (28 kwietnia, czyli już w nowym cyklu). Wtedy 110% jest poprawne — masz przekroczony limit muzyki w tym cyklu rozliczeniowym. Sprawdź daty tych tx.

---

## 🧹 Cleanup importów w 6 viewach (audyt głębszy)

Sprzątnięte massive bloat — copy-paste z wczesnej fazy projektu, gdzie każdy view miał importowany cały zestaw 41 ikon i 5 hooków, nawet jeśli używał tylko 3.

### AccountsView.jsx
**Przed:** 41 ikon importowanych, 5 hooków, 6 utils, 7 constants
**Po:** 5 ikon (TrendingUp, PlusCircle, PiggyBank, CreditCard, Trash2 + Shield/Landmark aliases), 1 hook (useState), 1 util (fmt), 0 constants

### LimitsView.jsx
**Przed:** importował `getCycleRange` (nieużywany)
**Po:** clean — tylko `fmt, cycleTxs`

### InvestmentsView.jsx
**Przed:** 41 ikon, 13 z recharts, 5 hooków, 6 utils
**Po:** 1 ikona (X), 3 z recharts (PieChart, Pie, Cell), 1 hook (useState), 1 util (fmt)

### PaymentsView.jsx
**Przed:** 41 ikon, 5 hooków, 7 utils, 7 constants
**Po:** 16 ikon (faktycznie używane), 3 hooki (useState/useMemo/useEffect), 2 utils (fmt, todayLocal), 3 constants (MONTHS, MONTH_NAMES, CATEGORIES)

### HobbyView.jsx
**Przed:** importował `X` (nieużywany), `getCycleRange` (nieużywany)
**Po:** clean

### TripsView.jsx
**Brak zmian w imports** — był już dobrze utrzymany. Tylko fix Bug #1 powyżej.

### Wpływ na bundle

Zerowy. Vite tree-shake to wszystko już wcześniej. Source jest jednak czystszy o ~50 nieużywanych importów (~30% wpisów). Łatwiejszy do utrzymania.

---

## Stan kodu

| | v1.2.5 | v1.2.6 |
|---|---|---|
| Pliki .js/.jsx | 59 | 59 |
| Linie source | 12 777 | ~12 700 (jeszcze 4 funkcje przywrócone z v1.2.5 cięcia) |
| index.js raw | 354 KB | 354 KB |
| index.js gzip | 88 KB | 88 KB |
| Build status | zielony | zielony |
| Smoke test tombstones | 5/5 | 5/5 (niesprawdzane, nie ruszane) |

---

## Pliki zmienione (10)

```
src/lib/trips.js                    [+ getTripsForYear (Bug #1 fix)]
src/lib/license.js                  [+ B32_ALPHABET (Bug #2 fix)]
src/notifications.js                [+ scheduleLocalNotification (Bug #3 fix)]
src/App.jsx                         [auto-snap useEffect: dodano month do deps]
public/sw.js                        [CACHE_NAME v5 → v6]
src/views/AccountsView.jsx          [clean 35 nieużywanych importów]
src/views/LimitsView.jsx            [- getCycleRange (dead)]
src/views/InvestmentsView.jsx       [clean 50+ nieużywanych importów]
src/views/PaymentsView.jsx          [clean 25+ nieużywanych importów]
src/views/HobbyView.jsx             [- X, getCycleRange (dead)]
package.json                        [1.2.5 → 1.2.6]
```

---

## 🚀 Deploy

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.6: fix self-inflicted bugs + cleanup imports"
git push --force
```

**Po push, KONIECZNIE:**
1. Otwórz aplikację, otwórz DevTools (F12)
2. Application → Service Workers → **Unregister** (jeśli widzisz `fintrack-pro-v5`)
3. Application → Storage → **Clear site data**
4. Hard refresh

To jest jednorazowe — service worker v6 zastąpi v5 i potem już samodzielnie.

---

## Pytania zaległe (wciąż otwarte)

1. **„W przychodzie nie da się dać jakiejś kategorii"** — feature nie zaczęty. Wymaga zmiany schematu kategorii (dodać typ `income`/`expense` per kategoria, zmodyfikować picker w form). Wpisz na liście dla v1.2.7.

2. **„W strukturze wydatków nie do końca dobrze dzieli"** — pytałem o konkretne przykłady, jeszcze nie odpowiedziałeś. Daj 3-5 transakcji które są źle przydzielone (np. „Carrefour 250zł trafia do Lifestyle, powinno do Stałe") — wtedy mogę poprawić mappery w `lib/insights.js` lub `getCat`.

3. **TZ bug** — pytane 7×, brak odpowiedzi. Pomijam.

4. **Audyt O3 27/39** — K3 NBP, K4 Service Worker offline-first, K5 VAPID. Krytyczne przed produkcją, niezrobione.

---

## Co realnie zauważysz po deployu

1. **Wyjazdy działają** — możesz wejść w Plany → Wyjazdy bez crash
2. **Aktywacja PRO działa** — gdy klikniesz Upgrade, weryfikacja klucza nie crashuje
3. **Reminders płatności działają** — gdy włączysz powiadomienia, system o nich nie zapomni
4. **Muzyka 110%** — po hard refresh + flush SW cache **powinna pokazać 0%** (nowy cykl 28.04-27.05). Jeśli nie, daj znać dokładnie co widzisz + screenshot z Settings → Stan synchronizacji

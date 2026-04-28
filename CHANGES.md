# FinTrack PRO v1.2.2 — 4 bugfixy ze zrzutów ekranu (2026-04-28)

`package.json` 1.2.1 → 1.2.2.

## TL;DR

Cztery konkretne bugi z Twoich screenshotów + jeden nieadresowany (Bug F czeka na info).

| # | Bug | Status |
|---|-----|--------|
| A | Pierwszy dzień nowego cyklu pokazuje stary cykl jako bieżący ("100% przekroczony, 0 dni do końca") | ✅ Fix |
| B | Trip selector przy dodawaniu tx pokazuje tylko aktywne wyjazdy — nie da się tagować pre-trip wydatków | ✅ Fix |
| C | IncomeTypesBreakdown nie ma nawigacji wstecz | ✅ Fix |
| D | "Poduszka finansowa" goal pokazuje stary `acc.balance` zamiast `getEffectiveBalance(acc, portfolio)` | ✅ Fix |
| E | Limity 110% (Muzyka, Zakłady) | ✅ Auto-fix przez Bug A |
| F | Inwestycje 11 000 zł "nie zgadza się" | ⏳ Potrzebuję info — patrz koniec |

Build zielony (vite 2384 modułów, 22.8s, 344KB raw / 86KB gzip).
Smoke testy: `getCurrentCycleMonth` 10/10, `changeCycleDay` 5/5 (zachowane z v1.2.1), integracja Bug A 7/7.

---

## Bug A — Edge case: dziś = pierwszy dzień nowego cyklu

### Co widziałeś

Screenshoty Image 1 + Image 2:
- 28 kwietnia, +9 952,09 zł, 8 transakcji ✓
- Limity „Muzyka 110%", „Zakłady 110%" 🔴
- „Możesz jeszcze wydać 0,00 zł — Budżet wyczerpany" 🔴
- „Prognoza końca miesiąca −13 303,00 zł, ~23 738,00 zł szac. wydatki" 🔴
- „100% miesiąca minęło, 0 dni do końca" 🔴

### Dlaczego

Twój `cycleDay = 28`. To znaczy że cykl rozliczeniowy „kwietniowy" trwa **28.03 – 27.04**. Wczoraj (27.04) ten cykl się skończył. Dziś (28.04) jest **pierwszym dniem nowego cyklu** (28.04 – 27.05).

Stary kod: `month = new Date().getMonth()` → zwraca `3` (kwiecień). Dashboard używa `month=3` jako „bieżący cykl rozliczeniowy" → ale ten cykl już wczoraj się zakończył. Stąd 100% przekroczony, 0 dni do końca, limity 110%.

### Fix

Nowy helper `getCurrentCycleMonth(cycleDayHistory)` w `utils.js`:
```js
function getCurrentCycleMonth(cycleDayOrHistory) {
  const today = new Date();
  const m = today.getMonth();
  const day = resolveCycleDay(m, cycleDayOrHistory, today.getFullYear());
  if (day <= 1) return m;                                    // calendar mode
  if (today.getDate() >= day) {
    return m + 1 > 11 ? 0 : m + 1;                            // wrap dec → jan
  }
  return m;
}
```

Logika: jeśli `today.getDate() >= cycleDay`, jesteśmy już w nowym cyklu, więc bieżący month to `current+1`.

W `App.jsx`:
1. Nowy `userNavigatedMonthRef` useRef — ustawia się gdy user kliknie strzałkę
2. Wrapper `setMonthByUser` → ustawia flag + standard setMonth
3. Auto-snap useEffect po loadzie: jeśli user nie nawigował manualnie, snap month do `getCurrentCycleMonth(...)`
4. Dashboard dostaje `setMonth={setMonthByUser}` zamiast `setMonth`

Po fix dla Twojego przypadku (28.04, cycleDay=28): Dashboard pokazuje cykl majowy 28.04–27.05 jako bieżący → 0% przekroczony, prognoza pełna.

### Edge case: zmiana cycleDay w środku miesiąca

Twoja sytuacja po migracji:
- `cycleDayHistory: [{from: "2024-11-01", day: 26}, {from: "2026-04-01", day: 28}]`
- Cykl marcowy (cd=26): 26.02 – 25.03
- Cykl kwietniowy (cd=28): 28.03 – 27.04
- **Luka: 26-27.03 (2 dni)** — tx z tych dni nie wpadną do żadnego cyklu miesięcznego

Tx z tej luki pojawiają się w widoku „Wszystkie transakcje", ale nie wchodzą do żadnej sumy cyklu. Jeśli masz tam jakieś, można:
- Edytować tx i zmienić datę na 25.03 (wpadną w cykl marca) lub 28.03 (wpadną w cykl kwietnia)
- Albo zignorować — to 2 dni z 1.5 roku Twojej historii, nie zmieniają wniosków

Pełna implementacja „bezstratnej" historii cycleDay wymaga refactoru `getCycleRange` (split cyklu na pół-cykle przy zmianie). Odkładam — gdyby było potrzebne, daj znać.

---

## Bug B — Trip selector pokazuje tylko aktywne wyjazdy

### Co widziałeś

Image 3: w modalu dodawania tx, sekcja „PRZYPISZ DO WYJAZDU" pokazuje tylko `Bez tagu` + `Ostrawa`. Drugi wyjazd (Serbia/Turcja) nie istnieje w selektorze.

### Dlaczego

W v1.2.0 selektor używał `getActiveTrips(trips)` który zwraca tylko wyjazdy gdzie dziś jest między `dateFrom-3` a `dateTo+3`. Wyjazdy w przyszłości (Serbia za 2-3 miesiące) były niewidoczne.

To blokuje legitne use case: rezerwacja hotelu na 3 miesiące przed wyjazdem, lot kupiony 6 miesięcy wcześniej, etc.

### Fix

Nowa funkcja `getSelectableTrips(trips)` w `lib/trips.js`:
- Aktywne (dziś w zakresie ±3 dni) → pokazuje + zielony znacznik ●
- Nadchodzące do **90 dni naprzód** → pokazuje
- Niedawno zakończone do **14 dni wstecz** → pokazuje (na wypadek tx wprowadzonych z opóźnieniem)
- Sortowanie: najpierw aktywne, potem chronologicznie

W `TransactionsView.jsx`:
- `selectable = getSelectableTrips(trips)` — lista dostępnych w UI
- `active = getActiveTrips(trips)` — używane tylko jako preselect/wyróżnienie wizualne (zielona kropka, jaśniejszy kolor tekstu)

Edge case: lot na 7 miesięcy do przodu nadal nie będzie tagowalny (poza 90 dniami). Jeśli to jest dla Ciebie real use case (np. rezerwacja hotelu w styczniu na lipiec), zmień `TRIP_FUTURE_DAYS` w `lib/trips.js`. Albo edytuj tx ręcznie po dodaniu wyjazdu.

---

## Bug C — IncomeTypesBreakdown bez nawigacji

### Co widziałeś

Image 4: STRUKTURA PRZYCHODÓW pokazuje „Pensja 100% 10.4k zł" + „Główne źródło: Ekwiwalent — 3000,00 zł". Mówisz że nie ma wszystkiego i nie da się cofnąć do zeszłego miesiąca.

### Dlaczego

Pochodna Bug A — widget dostawał `monthTx` pre-filtered z parent (AnalyticsView) który używał `month` z Dashboardu. Dla bieżącego cyklu (28.04 – 27.05) widget widzi tylko jedną tx przychodową (Ekwiwalent 3000) bo to dopiero pierwszy dzień. Nie ma jeszcze pensji ani Vinted.

Plus widget nie miał własnej navigacji — user nie mógł przeskoczyć do zeszłego cyklu.

### Fix

W `AnalyticsWidgets.jsx` IncomeTypesBreakdown:
- Sygnatura zmieniona: `(transactions, month, cycleDay)` zamiast `(monthTx)`
- Lokalny `localMonth` state (initialized z `parentMonth`)
- Strzałki ◀ ▶ w nagłówku do nawigacji
- Przycisk „Dziś" (widoczny gdy `localMonth ≠ parentMonth`) - powrót do bieżącego
- Header pokazuje aktualnie wybrany miesiąc: „STRUKTURA PRZYCHODÓW · Kwiecień"
- Empty state „Brak przychodów w [miesiąc]" zamiast `return null`

Dlaczego lokalny state a nie globalny `setMonth`? Bo nie chcemy żeby kliknięcie strzałki w widget przesuwało CAŁY Analytics. User może chcieć zerknąć na zeszłe przychody nie ruszając reszty.

---

## Bug D — Goal pokazuje stary acc.balance

### Co widziałeś

Image 5: „Poduszka finansowa 22% — 11 000,00 zł / 50 000,00 zł — XTB Inwestycyjne". Mówisz że nie zgadza się kwota.

### Dlaczego

W v1.1.1 fix K6 dodał `getEffectiveBalance(acc, portfolio)` który dla kont typu `invest` sumuje wartość pozycji z `portfolio[]` (gdzie `linkedAccId === acc.id`). Dashboard tego używa przez `sumByGroup`.

Ale `GoalsView` przeoczyłem:
```js
const effectiveSaved = acc ? acc.balance : goal.saved;  // stary balance
```

Gdy XTB Inwestycyjne ma frozen `acc.balance = 11000` ale portfolio aktualizuje się rynkowo (np. faktyczna wartość 12 500 zł), goal nadal pokazuje 11 000.

### Fix

`GoalsView.jsx`:
- Import `getEffectiveBalance` z `lib/accountTypes.js`
- Nowy prop `portfolio = []`
- `const effectiveSaved = acc ? getEffectiveBalance(acc, portfolio) : goal.saved`

Wire propa: `App.jsx → PlansView → GoalsView`. PlansView dostała `portfolio` jako prop i przekazuje do GoalsView.

---

## Bug E — Limity 110%

Pochodna Bug A. Po naprawie A, Dashboard pokazuje bieżący cykl (28.04-27.05) → limity są na 0% bo dopiero pierwszy dzień. Auto-fix.

---

## Bug F — Inwestycje 11 000 zł nie zgadza się ⏳

### Co widziałeś

Image 1: w sekcji „Gotówka dostępna" pasek „INWESTYCJE 11 000,00 zł". W „Majątek łączny" też „INWESTYCJE 11 000,00 zł".

Mówisz że to się nie zgadza.

### Czego nie wiem

Nie wiem co konkretnie powinno być wartością. Możliwości:
1. Konto „XTB Inwestycyjne" ma faktyczną zawartość portfela ≠ 11 000 (np. 14 500 z aktualnej wyceny ETF), ale balance konta jest stary (11 000) i `portfolio[]` jest pusty/bez `linkedAccId` → effectiveBalance fallback do `acc.balance = 11000`
2. Masz w portfolio kilka pozycji z `valuePLN` które się sumują do np. 13 500, ale Dashboard pokazuje 11 000 → bug w `sumByGroup` lub `getEffectiveBalance`
3. „11 000" to suma kilku invest accounts ale pominęło jakieś (np. konto bez `type: invest` ale z investmentami)
4. Suma się zgadza księgowo (=11 000 zł na saldzie XTB), ale Ty oczekujesz że to się aktualizuje rynkowo i **nie aktualizuje się** bo nie wpisałeś świeżych cen

### Co potrzebuję

- W aplikacji: **Portfel → Inwestycje** — ile pozycji widzisz, jaka jest suma `valuePLN` po prawej?
- W aplikacji: **Portfel → Konta** — co konto „XTB Inwestycyjne" ma jako balance, czy jego typ to `invest`?
- Czego oczekujesz że ma być pokazane jako „Inwestycje 11 000"? Aktualna wycena rynkowa portfela? Saldo cash konta XTB? Suma cash + papiery?

Jak odpowiesz, naprawię w v1.2.3.

---

## Pliki

### Nowe (0)
Brak — wszystkie zmiany w istniejących plikach.

### Zmodyfikowane (7)
```
src/utils.js                              [+ getCurrentCycleMonth helper, eksport]
src/App.jsx                               [+ userNavigatedMonthRef, setMonthByUser, auto-snap useEffect, portfolio do PlansView]
src/lib/trips.js                          [+ getSelectableTrips funkcja + export]
src/views/TransactionsView.jsx            [Trip selector używa getSelectableTrips zamiast getActiveTrips, znacznik ● dla aktywnych]
src/views/PlansView.jsx                   [+ portfolio prop, przekazane do GoalsView]
src/views/GoalsView.jsx                   [import getEffectiveBalance, + portfolio prop, effectiveSaved używa portfolio]
src/components/AnalyticsWidgets.jsx       [IncomeTypesBreakdown — own month state + ChevronLeft/Right navigator + empty state]
src/views/AnalyticsView.jsx               [IncomeTypesBreakdown wywołanie zaktualizowane]
package.json                              [1.2.1 → 1.2.2]
```

### Bundle size
| Wersja  | index.js (raw) | index.js (gzipped) |
|---------|----------------|---------------------|
| v1.1.1  | 308 KB         | 78 KB               |
| v1.2.0  | 354 KB         | 87 KB               |
| v1.2.1  | 342 KB         | 85 KB               |
| v1.2.2  | 344 KB         | 86 KB               |

+2KB / +1KB gzip. Akceptowalne dla 4 buugfixów + IncomeTypes navigator.

---

## Deployment + manual smoke test

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.2: Bug A cycleDay edge case + Bug B/C/D fixes"
git push --force
```

### Manual smoke test (po deployu)

**Dziś (28.04):**
1. Hard refresh (Ctrl+Shift+R)
2. Dashboard:
   - Wpłynęło/Wydano powinny pokazywać sumy z cyklu **majowego** (28.04-27.05) — czyli prawie 0 bo dopiero pierwszy dzień
   - Limity Muzyka/Zakłady → 0% (jeśli dziś nic nie wydałeś w tych kat)
   - „Możesz jeszcze wydać" > 0 zł
   - „Prognoza końca miesiąca" pokazuje normalną kwotę (nie −13k)
   - „X% miesiąca minęło · X dni do końca" → ~3% / 29 dni
3. Strzałkę ◀ kliknij w Dashboard:
   - Powinieneś widzieć **kwiecień** (cykl 28.03-27.04 = ten który się zakończył wczoraj)
   - Limity 110% TAM (bo był stary cykl)
   - Wpłynęło/Wydano = sumy z 28.03-27.04
4. Goal „Poduszka finansowa":
   - Sprawdź czy procent się zgadza z aktualnym `valuePLN` z portfolio
5. Modal „Dodaj transakcję" → expense → przewiń do „PRZYPISZ DO WYJAZDU":
   - Powinny być widoczne: aktywne (z ● kropka) + nadchodzące do 90 dni + niedawno zakończone do 14 dni
   - Jeśli masz Serbia (lipiec) — powinna już być widoczna jeśli za < 90 dni, niewidoczna jeśli > 90 dni
6. Analiza → przewiń do STRUKTURA PRZYCHODÓW:
   - W headerze widoczne strzałki ◀ ▶
   - Kliknij ◀ — przeskoczy do marca, pokaże Twoje przychody marcowe
   - Pojawi się przycisk „Dziś" — kliknij żeby wrócić

### Krótki manual test żeby potwierdzić że Bug A faktycznie naprawiony

Jutro (29.04) otwórz apkę → Dashboard powinien dalej pokazywać cykl majowy 28.04-27.05. Po hard refresh — to samo. Kliknij ◀ → kwietniowy. Kliknij ▶ → majowy. To znaczy że auto-snap działa i strzałki też.

---

## Wciąż otwarte

- TZ bug („streak/daily reminder/data tx pokazuje złą datę") — **nadal czekam na konkretny przypadek**. Po hard refresh którą datę widzisz że jest zła i gdzie?
- Bug F (Inwestycje 11 000) — czekam na info z Portfel → Inwestycje
- 27 z audytu wciąż nieadresowane (K3 NBP, K4 ServiceWorker, K5 VAPID, ~15 ważnych, O3 GoalsView refactor)

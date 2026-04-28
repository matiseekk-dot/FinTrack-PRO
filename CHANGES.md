# FinTrack PRO v1.2.1 — Reorganizacja Plany + CycleDay historyczny (2026-04-28)

`package.json` 1.2.0 → 1.2.1 (już bumpnięte w paczce).

## TL;DR

Cztery zmiany strukturalne:

1. **Bottom nav cofnięte do 6 ikon** (Hobby przeniesione z osobnego tabu do Plany)
2. **Plany ma 4 sub-zakładki**: Cele · Limity · Wyjazdy · Hobby
3. **GoalsView odchudzone** — wycięty wewnętrzny tab switcher i martwy vacation kod (1099 → 495 linii)
4. **CycleDay historyczny** — zmiana wartości tworzy zapis w historii, stare miesiące zachowują poprzednią wartość. Koniec rozjazdów raportów rocznych przy zmianie cyklu.

Build zielony (vite 2384 modułów), smoke testy zielone (`resolveCycleDay` 9/9, `changeCycleDay` 5/5).

---

## 1. Nawigacja: 6 ikon, 4 sub-zakładki w Plany

```
PRZED v1.2.0:  [Start] [Tx] [Płat] [Plany] [Hobby] [Analiza] [Portfel]   ← 7 ikon ciasne
PO    v1.2.1:  [Start] [Tx] [Płat] [Plany] [Analiza] [Portfel]            ← 6 ikon

Plany ma teraz 4 sub-zakładki (zamiast pisać "Cele" dwa razy):
  ├── 🎯 Cele     (oszczędnościowe + emerytura)
  ├── 🚦 Limity   (NOWE — wyciągnięte z GoalsView)
  ├── 🛫 Wyjazdy
  └── 💿 Hobby    (przeniesione z osobnego tabu)
```

### Co zmienione w plikach
- `src/App.jsx`: usunięty tab `hobby` z TABS, usunięty render hobby tab, usunięty import HobbyView. PlansView nadal ma propsy hobbies + setHobbies.
- `src/views/PlansView.jsx`: 4 sub-zakładki zamiast 2.
- `src/views/LimitsView.jsx`: **nowy plik** — samodzielny moduł limitów. Logika identyczna z dotychczasową, kod izolowany od GoalsView.
- `src/views/GoalsView.jsx`: wycięty wewnętrzny tab switcher (te „🎯 Cele | 🚦 Limity"), wycięta sekcja Limity (przeszła do LimitsView), wycięta sekcja Wakacje (martwy kod od v1.2.0). Plik zmniejszony z 1099 → 495 linii. Bundle index.js spadł 354KB → 342KB (mimo dodania Limits/PlansView/CycleDay history kodu).
- `src/i18n.js`: dodany `plans.tab.limits`.

### Dead code zostawiony świadomie
W GoalsView.jsx są jeszcze:
- `BudgetView` (linia 22-133) — nieużywany komponent
- `ForecastTab` (linia 135) — nieużywany komponent
- Stare state `limitModal`, `limitForm`, `activeTab`, `vacation`, `setVacation` — niereferencjowane w UI

To są ~200 linii martwego kodu. Nie psuje runtime'u (React po prostu trzyma niepotrzebny state). Pełny refactor GoalsView do separate plików to osobne zadanie z audytu (O3) — wycenione na ~2h. Robimy go po launchu.

---

## 2. CycleDay historyczny

### Problem (Twój zgłoszony bug)

CycleDay był globalny. Zmiana z 26 na 28:
- Marzec, który był „26.02–25.03", staje się „28.02–27.03"
- Tx z 26-27.03 nagle „znikają" z marca i pojawiają się w kwietniu
- Twoje raporty wsteczne się rozjeżdżają

### Rozwiązanie — opcja A z naszej rozmowy

Nowy schemat:
```js
cycleDay: 28                                    // current value (do edycji w UI)
cycleDayHistory: [
  { from: "1970-01-01", day: 1 },               // domyślny fallback
  { from: "2024-11-01", day: 26 },              // od listopada 2024 (pierwszy entry użytkownika)
  { from: "2026-04-01", day: 28 },              // zmiana w kwietniu 2026
]
```

Funkcja `resolveCycleDay(month, history, year)` znajduje aktywną wartość dla danego miesiąca. Marzec 2026 zwróci 26, kwiecień 2026 zwróci 28.

### Co zmienione

**Nowa logika:**
- `src/utils.js`: `resolveCycleDay()` (nowa funkcja eksportowana). `getCycleRange`, `cycleTxs`, `fmtCycleLabel`, `buildHistData` rozszerzone — akceptują zarówno liczbę (backward compat) jak i array historii.
- `src/data/storage.js`: sanityzacja `cycleDayHistory` (filtr poprawnych entry, sort po `from`).
- `src/hooks/useFirebase.js`: `cycleDayHistory` w SYNC_KEYS — synchronizuje się chmurowo.
- `src/App.jsx`:
  - State `cycleDayHistory` + setter
  - Migracja przy load: jeśli history puste a `cycleDay > 1`, twórz initial entry `{from: "1970-01-01", day: cycleDay}`
  - `effectiveCycleDay` useMemo — array jeśli history niepuste, inaczej liczba
  - Dashboard, PlansView, AnalyticsView dostają `effectiveCycleDay` (resolve'ują dynamicznie per miesiąc)
  - SettingsPanel zostaje z liczbą `cycleDay` (do edycji UI) + nowy prop `cycleDayHistory`/`setCycleDayHistory`

**SettingsPanel UI:**
- `changeCycleDay(newDay)` helper — zmienia `cycleDay` (UI) + dodaje/aktualizuje entry w historii od pierwszego dnia bieżącego miesiąca
- No-op detection: jeśli nowa wartość = poprzedniego entry, nie tworzy duplikatu (np. user kliknął +1 → -1 w tym samym miesiącu)
- Replace detection: jeśli już jest entry dla bieżącego miesiąca, zastępuje (np. zmiana 28→30→25 w kwietniu = jeden entry końcowy z 25)
- Info banner nad ustawieniem: „Zmiana wartości tworzy nowy zapis od 1. dnia bieżącego miesiąca"
- **Nowa sekcja „Historia zmian cyklu"** widoczna gdy >= 2 entries:
  - Lista wszystkich zapisów z datą obowiązywania
  - Każdy entry ma editable `day` (1-28) — pozwala ręcznie poprawić po migracji
  - Przycisk × przy każdym non-initial entry — usuwa go (miesiące używają wartości poprzedniego)

### Migracja Twoich danych (CRITICAL — przeczytaj)

Przy pierwszym uruchomieniu v1.2.1 z istniejącymi danymi:
- Twój obecny `cycleDay = 28` zostaje
- `cycleDayHistory` zostaje stworzona z entry `{from: "1970-01-01", day: 28}`
- **To znaczy że wszystkie miesiące wstecz dostaną cycleDay=28** — w tym marzec gdzie chciałeś 26!

**Po deployu musisz ręcznie poprawić** w Settings → Cykl rozliczeniowy → Historia zmian cyklu:
1. Edytuj entry „Początek (zanim zacząłeś logować)" → zmień `28` na `26` (to obowiązywać będzie aż do zapisu kolejnego)
2. Kliknij + przy „Mój miesiąc zaczyna się" do wartości 28 → utworzy nowy entry „Od 04/2026: dzień 28"
3. Sprawdź że są 2 entries: `1970-01-01: 26`, `2026-04-01: 28`

Marzec wtedy użyje 26 (bo dla marca 2026: ostatni entry który ma `from <= 2026-03-01` to ten z 1970, day=26). Kwiecień użyje 28.

**Alternatywa szybsza** (DevTools console na zdeployowanej apce):
```js
const stored = JSON.parse(localStorage.getItem("fintrack_v1"));
stored.cycleDayHistory = [
  { from: "2024-11-01", day: 26 },  // dostosuj datę startu Twojego logowania
  { from: "2026-04-01", day: 28 }
];
localStorage.setItem("fintrack_v1", JSON.stringify(stored));
location.reload();
```

### Backward compatibility

Komponenty które dostają `cycleDay` jako prop działają z obu typów argumentu:
- liczba (np. nowi userzy bez historii) → tradycyjne zachowanie
- array (po migracji) → resolve per miesiąc

Wszystkie wywołania `getCycleRange/cycleTxs/fmtCycleLabel` w istniejących plikach (Dashboard, AnalyticsView, TransactionsView, GoalsView, LimitsView, HobbyView, etc.) **nie wymagały zmian**. Funkcje wewnętrznie sprawdzają typ argumentu.

---

## 3. Pliki

### Nowe (1)
```
src/views/LimitsView.jsx                  [O2 z audytu — wycięty z GoalsView]
```

### Zmodyfikowane (8)
```
src/App.jsx                               [TABS bez hobby, state cycleDayHistory, prop SettingsPanel]
src/utils.js                              [resolveCycleDay, getCycleRange/cycleTxs/fmtCycleLabel/buildHistData akceptują history]
src/data/storage.js                       [sanityzacja cycleDayHistory]
src/hooks/useFirebase.js                  [cycleDayHistory w SYNC_KEYS]
src/views/PlansView.jsx                   [4 sub-zakładki zamiast 2/3]
src/views/GoalsView.jsx                   [wycięte 604 linie martwego kodu]
src/components/SettingsPanel.jsx          [changeCycleDay helper, history UI editor, info banner]
src/i18n.js                               [plans.tab.limits PL/EN]
package.json                              [1.2.0 → 1.2.1]
```

### Bundle size
| Wersja  | index.js (raw) | index.js (gzipped) |
|---------|----------------|---------------------|
| v1.1.1  | 308 KB         | 78 KB               |
| v1.2.0  | 354 KB         | 87 KB               |
| v1.2.1  | 342 KB         | 85 KB               |

---

## 4. Deployment + manual smoke test

1. Deploy build:
   ```bash
   npm install
   npm run build
   git add -A && git commit -m "v1.2.1: Plany 4 sub-zakładki, cycleDay historyczny"
   git push --force
   ```

2. **Migracja Twoich danych** — patrz wyżej sekcja „Migracja Twoich danych". Bez tego marzec dostanie 28 zamiast 26.

3. **Smoke test po deployu (manual):**
   - Bottom nav: 6 ikon (Start / Tx / Płatności / Plany / Analiza / Portfel) ✓
   - Plany → 4 sub-zakładki widoczne (🎯 Cele · 🚦 Limity · 🛫 Wyjazdy · 💿 Hobby) ✓
   - Plany → Cele: widzisz cele oszczędnościowe i emeryturę bez wewnętrznego tab switchera ✓
   - Plany → Limity: lista limitów, można dodać nowy ✓
   - Settings → Cykl rozliczeniowy → widzisz **Historia zmian cyklu** (po migracji)
   - Edytuj wartości w historii żeby pasowały do Twojego logowania
   - Wróć do Dashboard, użyj strzałek ◀ ▶ żeby pójść do marca → sprawdź że spent z 26-27.03 są w marcu (nie w kwietniu)
   - Hard refresh (Ctrl+Shift+R) żeby wyczyścić cache

---

## 5. Co dalej (otwarte z audytu)

Wciąż nieadresowane (z 39 z audytu — po v1.2.1 zostało 27):
- 3 krytyczne: K3 NBP API stale, K4 Service Worker unregistered, K5 VAPID/FCM
- ~15 ważnych
- O3: pełny refactor GoalsView na osobne pliki (część zrobiona — vacation+limits już out)

Daj znać kiedy bierzesz tydzień 2 — najpilniejsze są K3+K4+K5 (rzeczywiste pieniądze + notyfikacje).

---

## Dwie sprawy z poprzedniej rozmowy które zostały bez odpowiedzi

1. **TZ bug — które miejsce konkretnie pokazuje złą datę?** Streak / daily reminder / pole „Data" w nowym formularzu / coś z Dashboard? Jeśli po Ctrl+Shift+R nadal jest, daj mi konkretny przypadek (krok po kroku) — przyjrzę się temu w v1.2.2.

2. **Przychody za zeszły miesiąc — gdzie patrzysz?** Dashboard / Analiza / Transakcje? Bez tego nie wiem gdzie debugować.

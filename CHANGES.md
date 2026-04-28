# FinTrack PRO v1.2.0 — Plany + Hobby (2026-04-28)

Bumpuj `package.json` z `1.1.1` → `1.2.0` przed deployem (już zrobione w paczce).

## TL;DR

Dwa nowe moduły:
- **Wyjazdy** — sub-zakładka w nowym tabie „Plany" (ex-„Cele"). Tagowanie tx
  przez `tripId`, lista wyjazdów aktywnych/archiwalnych, breakdown per kategoria,
  sumy roczne, mini wykres YoY.
- **Hobby** — osobny tab w bottom nav (7. ikonka). Lista hobby z kategoriami +
  keywordami, optional roczny target, breakdown wydatków, top sklepy, trend YoY.

Build zielony (vite, 2383 modułów), smoke testy zielone.

---

## Co zmieniliśmy w nawigacji

```
PRZED:  [Start]  [Tx]  [Płat]  [Cele]  [Analiza]  [Portfel]
                  6 tabów

PO:     [Start]  [Tx]  [Płat]  [Plany]  [Hobby]  [Analiza]  [Portfel]
                  7 tabów  (uwaga: ciasno na małych telefonach)
```

**Tab „Plany"** zastępuje „Cele" i ma 3 sub-zakładki widoczne wewnątrz:

```
[Plany]
  ├── 🎯 Cele      (oszczędnościowe + emerytura, jak było)
  └── 🛫 Wyjazdy   (NOWE)
```

**Tab „Hobby"** to nowy 7. tab w bottom nav z ikoną Heart.

> **Uwaga produktowa:** 7-tabowa nawigacja na rzeczywistym mobile (375-414px)
> jest ciasna. Każdy element ma `flex: 1` co daje ~28-32px na ikonę + label
> 8px font. Po deployu sprawdź wizualnie. Jeśli labele się obcinają, opcje:
> (a) skrócić labele (np. „Plany" → „Plan", „Hobby" → „Hob"), (b) zmniejszyć
> font do 7px, (c) cofnąć Hobby do sub-zakładki w „Plany".

---

## WYJAZDY (Trips)

### Schema danych

```js
trip = {
  id:        Date.now(),     // unique number
  name:      "Serbia z dzieckiem",
  dateFrom:  "2026-07-10",
  dateTo:    "2026-07-20",
  budget:    8000,           // PLN, 0 = bez budżetu
  color:     "#3b82f6",      // z DEFAULT_TRIP_COLORS
  notes:     "Belgrade...",  // opcjonalne
  archived:  false,
  createdAt: ISO string,
}

// Na transakcji:
tx.tripId = 12345 | null
```

### Tagowanie transakcji

**Auto-preselect przy aktywnym wyjeździe.** Modal dodawania tx pokazuje selector
wyjazdów **tylko gdy** istnieje aktywny wyjazd (dziś jest między `dateFrom-3` a
`dateTo+3` — bufor na dojazd/powrót). Aktywny wyjazd jest preselected, można
odznaczyć kliknięciem „Bez tagu".

**Bufor ±3 dni** pozwala oznaczyć tx „taxi z lotniska" dzień przed wyjazdem oraz
„powrót w nocy" dzień po. Smoke test potwierdza:
- Wyjazd 10-20.07 → aktywny od 7.07 do 23.07
- Tx z 6.07 lub 25.07 → wyjazd nieaktywny → selector ukryty

**Edycja:** edytując tx która ma `tripId` ale wyjazd jest już zarchiwizowany /
poza bufforem, selector pokaże ten wyjazd jako pierwszą opcję żebyś mógł
zachować lub usunąć tag.

### Widok pojedynczego wyjazdu

- Header: nazwa, daty, notes, edytuj/archiwum/usuń
- 3 KPI: wydane / budżet / zostało
- Pasek progress (kolor wyjazdu, czerwony jeśli przekroczony)
- **Breakdown wg kategorii** — wszystkie kategorie z udziałem %
- **Lista wszystkich tx** powiązanych z wyjazdem, każda z buttonem usuwającym
  tag (przesuwa tx z powrotem do „nietagowane")

### Sumy roczne

Na liście wyjazdów u góry karta z:
- Year navigator (◀ 2026 ▶)
- Suma wydanych w roku, suma budżetów, zostało
- Mini YoY wykres słupkowy (od 2024) gdy ≥ 2 lata danych

### Migracja ze starych danych

Stare `vacationArchive` (z v1.1.x) wyświetla się jako sekcja **„Archiwum przed
v1.1.2 (tylko podgląd)"** na końcu listy wyjazdów. Read-only, bez breakdown bo
te dane nie były przechowywane.

Stary `ft_vacation` (pojedynczy aktywny obiekt) — przy pierwszym wejściu na
zakładkę Wyjazdy, jeśli `trips` puste, pokaże się button „Importuj" i jednym
kliknięciem zmigruje do nowego schematu.

### Stary kod vacation w GoalsView

Nie wycinałem agresywnie — vacation tab nadal ma kod w `GoalsView.jsx` ale **już
nie jest renderowany w UI** (tab buttons mają tylko `goals` i `limits`). Kod
nieosiągalny zostanie wycięty w refaktorze GoalsView (ta klasa to 1100 linii i
jest oznaczona w audycie jako dług techniczny).

### Co NIE jest zaimplementowane (świadomy minimalizm)

- ❌ Bulk-tag ("zaznacz tx z 10-20.07 → przypisz do Serbii") — wymaga UI
  multi-select w TransactionsView. Czas: ~1h. Workaround: ręczna edycja
  pojedynczych tx i wybór wyjazdu.
- ❌ Checklisty wyjazdowe (paszport, hotel) — poza scope finansowym
- ❌ Kategorie wydatków per wyjazd (jedne kategorie globalnie)

---

## HOBBY

### Schema danych

```js
hobby = {
  id:           Date.now(),
  name:         "Winyle",
  color:        "#ec4899",
  categories:   ["muzyka", "rozrywka"],   // dowolne kategorie
  keywords:     ["winyl", "ghost", "trivium"],  // case-insensitive substring
  yearlyTarget: 4000,                      // null = brak limitu
  archived:     false,
  createdAt:    ISO string,
}
```

### Logika matchowania (OR)

Transakcja „pasuje" do hobby jeśli:
1. Jej kategoria jest w `hobby.categories`, **LUB**
2. Jakiekolwiek słowo z `hobby.keywords` jest w `tx.desc` (case-insensitive
   substring)

Pomijamy zawsze: przychody (`amount >= 0`) i transfery (`cat === "inne"`).

Smoke test potwierdza wszystkie kombinacje.

### Widok listy hobby

- KPI bar u góry: cykl / rok / total + komentarz „💡 To są pieniądze które
  mógłbyś przesunąć do oszczędności"
- Lista hobby kartami: nazwa, ikonka, 3 mini-staty (cykl/rok/total)
- Jeśli `yearlyTarget` ustawiony: progress bar z % + alert przy przekroczeniu
- Empty state z CTA do dodania pierwszego hobby

### Widok pojedynczego hobby

- Header z nazwą, listą kategorii, edytuj/usuń
- 3 KPI: cykl / rok / total
- Progress bar yearly target (jeśli ustawiony)
- **Trend YoY** — słupkowy wykres rok-do-roku
- **Breakdown wg kategorii** (jeśli >1 kategoria w bucket)
- **Top 5 sklepów** (lifetime) — po polach `desc`
- **Lista 30 ostatnich tx** z linkiem „+ X starszych"

### Co świadomie pominięto

- ❌ Time tracking (warianty B/C z propozycji) — to FinTrack, nie HobbyOS
- ❌ Lista przedmiotów w kolekcji (np. lista winyli z pressing-info) — to
  byłaby osobna apka
- ❌ Integracje TMDB/RAWG/Spotify — j.w.
- ❌ Hard limity (zablokowanie dodawania tx po przekroczeniu) — soft cap +
  alert wystarczy, decyzja należy do użytkownika

---

## Pliki nowe (5)

```
src/lib/trips.js              [helpery wyjazdów]
src/lib/hobby.js              [helpery hobby]
src/views/PlansView.jsx       [parent z 2 sub-zakładkami: Cele + Wyjazdy]
src/views/TripsView.jsx       [moduł wyjazdów]
src/views/HobbyView.jsx       [moduł hobby]
```

## Pliki zmodyfikowane (6)

```
src/App.jsx                          [+ tab "plans" i "hobby", state, sync, render]
src/i18n.js                          [+ nav.plans/nav.hobby, plans.tab.*, trips.*, hobby.*]
src/data/storage.js                  [sanityzacja trips/hobbies w migrateData]
src/hooks/useFirebase.js             [trips/hobbies w SYNC_KEYS, ARRAY_KEYS_WITH_ID]
src/views/TransactionsView.jsx       [pole tripId, selector, edit fill]
package.json                         [1.1.1 → 1.2.0]
```

## Bez zmian (kod legacy zostawiony świadomie)

- `src/views/GoalsView.jsx` — vacation tab kod (linie 252-700) jest
  **nieosiągalny w UI** (nie ma buttona w tabs row), ale plik nadal go zawiera.
  Refaktor GoalsView do mniejszych plików = osobne zadanie po launchu.
- `src/components/SettingsPanel.jsx` — `vacationArchive` settings nadal działa,
  bo stare archiwum musi się wyświetlać w nowym TripsView jako read-only.

---

## Deployment checklist

1. Bump version w `package.json` (już 1.2.0 w paczce — nadpisz).
2. Build:
   ```bash
   npm install
   npm run build
   ```
3. **Test po deployu (manual smoke):**
   - Otwórz tab „Plany" → powinieneś zobaczyć 2 sub-zakładki: Cele (z istniejącymi
     celami i emeryturą) + Wyjazdy
   - W „Wyjazdy" dodaj jeden wyjazd na za-tydzień (np. test 5.05-7.05.2026,
     budżet 1000)
   - Idź do Transakcje → Dodaj nową → typ Wydatek → powinieneś zobaczyć selector
     wyjazdu z preselected „test" (bo bufor ±3 dni dla 5.05 = active od 2.05 do 10.05)
   - Wybierz „Bez tagu" i zapisz tx — sprawdź że nie ma tripId
   - Dodaj drugą tx z preselected wyjazdem — sprawdź w widoku wyjazdu
     że tx się pojawia
   - Idź do tab „Hobby" → dodaj „Test hobby" z kategorią „jedzenie" i keywordem
     „test"
   - Wróć do Transakcji, dodaj wydatek z kategorią jedzenie, opisem
     „test pizza" — w widoku Hobby ta tx powinna być policzona
4. **Synchronizacja Firestore** — przy pierwszym save trips/hobbies pójdą do
   chmury. Sprawdź na drugim urządzeniu czy się synchronizują.

---

## Co zostało z poprzedniego audytu

Wciąż nieadresowane (z 39 z audytu, po v1.1.1 zostało 31):
- 3 krytyczne: K3 NBP API stale, K4 Service Worker unregistered, K5 VAPID/FCM
- ~15 ważnych (W4-W19) z różnym priorytetem
- Architektura: O3 GoalsView refactor (teraz pilniejszy bo dodał się ukryty
  vacation tab)

Daj znać kiedy bierzesz tydzień 2 audytu — proponuję od K3+K4+K5 (real-money
features: notyfikacje + waluty).

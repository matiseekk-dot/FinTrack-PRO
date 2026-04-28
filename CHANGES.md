# FinTrack PRO v1.2.12 — P3: edit istniejących custom cat (2026-04-28)

`package.json` 1.2.11 → 1.2.12.

## TL;DR

Settings → Kategorie → przy każdej custom cat masz teraz przycisk Edit (ołówek). Klik → inline edit form pozwala zmienić **label**, **color**, **expenseType** (Stałe/Zmienne/Lifestyle dla expense). ID i type zostają stałe (świadomie — patrz "Decyzje architektoniczne" niżej).

Plus drobne ulepszenia listy: każda custom expense cat ma teraz mały badge pokazujący jej typ (Stałe/Zmienne/Lifestyle), żebyś od razu widział klasyfikację bez wchodzenia w edycję.

---

## Use case

**Twój problem:** "Kredyt Dom" jest custom cat z fallback `expenseType="variable"`. Zaburza Lifestyle/Variable/Fixed proporcje na Dashboard. Przed v1.2.12 jedyna opcja: usuń → dodaj na nowo z Stałe. Tracisz historię tx (cat ID się zmienia).

**v1.2.12:** Settings → Kategorie → Kredyt Dom → klik ołówek → wybierz "Stałe" → Zapisz. Wszystkie istniejące tx z `cat: "kredyt_dom"` automatycznie wpadną do Stałych w Dashboard/Analiza, bo `getExpenseType("kredyt_dom", allCats)` najpierw sprawdzi `customCats[].expenseType` (override) i znajdzie nową wartość.

---

## Co dokładnie można edytować

| Pole | Edytowalne? | Dlaczego |
|---|---|---|
| **label** (nazwa display) | ✅ | "Kredyt Dom" → "Kredyt Hipoteczny" — czysta kosmetyka |
| **color** | ✅ | wybór z 12 predefiniowanych kolorów |
| **expenseType** (Stałe/Zmienne/Lifestyle) | ✅ tylko dla expense cat | core feature — zmienia gdzie cat ląduje w ExpenseTypesBreakdown |
| **id** (techniczny identyfikator) | ❌ | Wszystkie tx mają `t.cat = id`. Zmiana ID = utrata całej historii tej kategorii. Pokazane jako readonly: *"ID: kredyt_dom"* |
| **type** (expense ↔ income) | ❌ | Tx mają `amount > 0` lub `< 0` które są semantycznie powiązane z type. Zmiana type bez konwersji amounts = chaos w danych |
| **iconName** | ❌ | Wszystkie custom cat dziedziczą Wallet icon — to deliberately keep simple |

---

## Decyzje architektoniczne

### Inline form, nie modal

SettingsPanel sam jest już modalem (`fixed inset-0 zIndex-9999`). Dodawanie modala w modalu = stack of overlays = mobile UX horror (gesture conflicts, kolejność z-index, escape key handling).

Inline form = klik Edit → row się zmienia w form na miejscu. Klik Anuluj → wraca do default row. Save → wraca z nowymi wartościami. Czytelne, nie zaburza scrolla.

### ID zostaje stałe

To nie jest ograniczenie z "lenistwa". Sprawdziłem: wszystkie tx w bazie mają `t.cat = "kredyt_dom"` (string). Gdyby user zmienił label "Kredyt Dom" → "Kredyt Hipoteczny" i ID byłoby derywowane z label → nowe ID = `"kredyt_hipoteczny"` → 200 historycznych tx zachowuje stare `t.cat = "kredyt_dom"` które już nie istnieje.

Dwa wyjścia:
- **Migracja**: zmieniaj wszystkie tx przy zmianie ID. Ryzyko jeśli sync padnie w trakcie. Atomicity issue.
- **Stałe ID, edytowalny label**: ID = wewnętrzny klucz, label = display. To jak DB primary key.

Wybrałem drugie. Pokazuję ID w edit form jako informacja, żeby user wiedział "to się nie zmieni".

### Walidacja konfliktów label

NIE waliduję czy label nie konfliktuje z BASE_CATEGORIES (np. "Jedzenie") albo z innymi custom. Jeśli user zmieni label "Kredyt Dom" → "Jedzenie", w pickerach pojawią się dwa "Jedzenie" — mylące, ale nie crash. Realnie nikt tego nie zrobi intencjonalnie. Walidacja = więcej kodu z marginalną korzyścią. Akceptuję trade-off.

### Backwards compat dla pre-v1.2.10 cats

Custom cat dodana przed v1.2.10 nie ma `expenseType` field. Co się dzieje gdy klikniesz Edit?

```js
const startEditCat = (cat) => {
  setEditForm({
    label: cat.label || "",
    color: cat.color || "#06b6d4",
    expenseType: cat.expenseType || "variable",  // ← fallback do "variable"
  });
};
```

Form pokaże "Zmienne" jako preselected (bo dotychczasowy fallback to też "variable"). User może zmienić na cokolwiek innego. Po Save → cat dostaje pełny `expenseType` field. Migracja in-place.

---

## Bonus: badge w liście

Dodatkowo zmieniłem default row żeby pokazywał typ jako mały badge:

```
┌─────────────────────────────────────────────────────┐
│  ● Kredyt Dom    wydatek    [STAŁE]      ✏️  🗑️    │
│  ● Vinted        przychód                ✏️  🗑️    │
│  ● Żabka         wydatek    [ZMIENNE]    ✏️  🗑️    │
│  ● Bukmacher     wydatek    [LIFESTYLE]  ✏️  🗑️    │
└─────────────────────────────────────────────────────┘
```

Color-coded:
- **Stałe** = niebieski badge
- **Zmienne** = pomarańczowy
- **Lifestyle** = różowy
- **Income/null** = brak badge

Dzięki temu nie musisz wchodzić w edit żeby sprawdzić jak coś jest sklasyfikowane.

---

## UX detail: confirm na Delete

Bonus przy okazji: dodałem confirm przed delete custom cat:

```
Usunąć kategorię "Kredyt Dom"?

Uwaga: transakcje z tą kategorią pozostaną, ale stracą kolor i nazwę.
```

Wcześniej delete był **bez potwierdzenia**. Klik na Trash → instant remove. Łatwo o przypadkowy delete na mobile (mały target przy palcu).

---

## Pliki zmienione (1)

```
src/components/SettingsPanel.jsx     [+ 4 stany editingCatId/editForm + 3 funkcje
                                       startEditCat/cancelEditCat/saveEditCat
                                       + custom cat row z inline edit branch
                                       + expenseType badge w default row
                                       + confirm na delete]
package.json                         [1.2.11 → 1.2.12]
```

Total: ~140 nowych linii, 0 zmian w innych plikach.

---

## Smoke test (zrobione w workspace)

1. Custom cat z v1.2.10 ma `expenseType: "variable"` → klik Edit → "Zmienne" preselected → zmień na "Stałe" → Save → cat ma `expenseType: "fixed"` → AnalyticsWidgets `getExpenseType("kredyt_dom", allCats)` zwraca "fixed" ✓
2. Custom cat z pre-v1.2.10 (bez `expenseType`) → klik Edit → "Zmienne" preselected (fallback) → wszystko działa jak w 1
3. Income cat → klik Edit → expenseType selector się **nie pokazuje** (warunek `cat.type === "expense"`) → Save zapisuje `expenseType: null` ✓
4. Anuluj → wraca do default row, zmiany nie zapisane ✓
5. Build: zielony (20.94s)

---

## 🚀 Deploy

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.12: P3 - edit istniejących custom cat (label/color/expenseType)"
git push --force
```

---

## Co WCIĄŻ otwarte (pre-launch checklist)

Bez zmian od v1.2.11:

1. **VAPID key** — `notifications.js` ma `const VAPID_KEY = ""`
2. **HARDCODED SECRET** w `lib/license.js`
3. **Forced save on app load** — zabezpieczenie dla early adopters
4. **Gumroad listing** verify
5. **Decyzja Opcja A vs B** dla PRO gating

---

## Następna sesja

**P1 (30 min)** — pre-launch checklist. To jest jedyny blocker przed sprzedażą:
- Wygeneruj VAPID key w Firebase Console → wklej do notifications.js
- Wygeneruj SECRET: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` → wklej do license.js
- Dodaj forced save useEffect w App.jsx
- Otwórz Gumroad → verify że listings są aktywne i mają poprawny pricing

Po tym możesz wystawić first sale link.

**P2 (1-2h)** — Opcja A PRO gating. Tylko jeśli zdecydujesz się że PRO ma być coś więcej niż "wsparcie + bez limitu". Moja rekomendacja: zostaw na po pierwszych klientach, zobacz czego realnie używają.

# FinTrack PRO v1.3.3 — SettingsPanel EN + audit spójności wyglądu (2026-04-29)

`package.json` 1.3.2 → **1.3.3** (minor bump — dokończenie EN + audit UI consistency).

## TL;DR

Dwie rzeczy:
1. **SettingsPanel pełne EN** — z ~30% pokrycia w v1.3.1 do **80% pokrycia**. Wszystkie user-facing labels, helpery, przyciski, modal'e potwierdzeń, alerty. Co zostaje po polsku to: Excel column headers w eksporcie + bank import patterns + console error messages — celowo nie ruszane.
2. **Audyt spójności wyglądu** — przeszedłem wszystkie fontSize/letterSpacing/colors w apce. **Werdykt: nie naprawiać** — paleta kolorów jest spójna, hierarchie fontów wyglądają chaotycznie statystycznie ale w obrębie pojedynczych widoków są konsystentne.

## Część 1: SettingsPanel EN

### Co przetłumaczone

**PRO badge / upgrade flow** (6 stringów):
- "Dożywotni dostęp · dziękuję za wsparcie!" → "Lifetime access · thanks for the support!"
- "Ważny do {date}" → "Valid until {date}" (plus locale-aware date formatting: `pl-PL` → `en-US`)
- "Wersja próbna" → "Trial version"
- "Upgrade do PRO" / "99 zł/rok · bez limitów · bez reklam" / "Kup"

**Cycle history sekcja** (8 stringów):
- "Zmiana wartości tworzy nowy zapis..."
- "Standardowy miesiąc kalendarzowy"
- "Stare miesiące używają wartości..."
- "Początek (zanim zacząłeś logować)"
- Confirm dialogi delete entry
- Edit tip

**Categories editor** (12 stringów):
- "Edytuj kategorię · ID: {id}"
- "Typ w strukturze wydatków"
- "przychód" / "wydatek" badges
- Delete confirm dialog
- Type buttons "Wydatek" / "Przychód"
- "Nazwa kategorii (np. Siłownia)" placeholder
- Type help "Stałe = miesięczne..."
- "Kategoria o tej nazwie już istnieje" alert
- "+ Dodaj kategorię" button

**Diagnostyka PRO** (8 stringów):
- "źródło: {source}"
- Sync OK / fail alerts
- "Wymuś sync PRO status do Firestore" button
- "Brak aktywnej subskrypcji PRO..." help
- Bullet points instrukcji

**Stats (4 KPI labels)**:
- "Transakcji" / "Kont" / "Budżetów" / "Celów"

**Export / Import sekcja** (10 stringów):
- "Eksportuj do Excel (.xlsx)"
- Import help text
- "Wybierz plik .xlsx (FinTrack backup)"
- "Import wyciągu CSV (PKO BP / mBank / ING / Revolut)"
- Target account info
- Status messages ("Import zakończony!" / "Błąd importu" / "Wczytuję…")

**Reminders / Templates / Partner** (3 helpery):
- "Gdy otworzysz aplikację, automatycznie pojawi się żółty banner..."
- "Szybkie dodawanie — widoczne nad listą transakcji."
- "Wyświetlana w module wspólnych rachunków."

**Reset section** (8 stringów):
- "Resetowanie danych" section title
- "Załaduj dane demo" / "Wyczyść wszystkie dane" buttons
- "Polityka prywatności" link
- "Wyczyścić wszystkie dane?" / "Załadować dane demo?" modal titles
- Modal descriptions
- Confirm buttons

### Co świadomie ZOSTAJE PO POLSKU

**Excel sheet headers** (Eksport):
```
Budżety, Płatności, Bilans, Miesiąc, Cel_PLN, Odłożone_PLN, Częstotliwość
```
**Powód**: User PL eksportuje plik dla polskiego księgowego / żony / partnera w PL Excel. EN headers byłyby kontekstowo dziwne (Polski user otwiera plik z "Budgets" zamiast "Budżety"). Excel format jest **dla PL workflow**, niezależnie od UI language.

**Bank import keywords** (PKO/mBank/ING/Revolut CSV parsing):
```
"biedronka", "lidl", "żabka", "prąd", "czynsz", "wynagrodzenie", "premia"
```
**Powód**: To są pattern matchers do tytułów polskich CSV bankowych. Te ciągi szuka w description z pliku PKO/mBank — zawsze będą po polsku. EN tłumaczenie nie ma sensu.

**Toast messages z polską pluralizacją** (`"transakcji"` / `"płatności"` / `"celów"`):
```js
`Zaimportowano ${imported} transakcji do "${targetAccName}".`
```
**Powód**: Polska gramatyka pluralizacji liczbowej (1 transakcja / 2 transakcje / 5 transakcji) jest skomplikowana. Zrobienie tego per-language wymaga proper i18n library (np. ICU MessageFormat). Aktualnie zostawiam toasty po polsku — to są brief notifications, nie kluczowe dla EN UX.

### i18n.js stan końcowy

```
PL keys: 112  (źródło prawdy — fallbacki przez t("key", "PL text"))
EN keys: 449  (4x więcej)
PL → EN missing: 0  ✅
```

**91 nowych kluczy EN** dodane w v1.3.3 dla SettingsPanel.

## Część 2: Audyt spójności wyglądu

### Metodyka

Przeskanowałem cały `src/` regexami szukając:
- `fontSize` patterns (wszystkie wartości)
- `textTransform: uppercase` + `letterSpacing` (section title patterns)
- Kolory `color: "#..."` (paleta kolorów)
- Card padding overrides

### Wyniki audytu

**Section titles**: 17 różnych kombinacji `fontSize × letterSpacing` w apce. Top 5:
```
fontSize:12 letterSpacing:0.08em → 17 occurrences  (KPI labels)
fontSize:11 letterSpacing:0.08em → 14 occurrences  (sub-labels)
fontSize:13 letterSpacing:0.08em → 9 occurrences   (Settings sections)
fontSize:16 letterSpacing:0.08em → 8 occurrences   (Settings titles)
fontSize:10 letterSpacing:0.08em → 7 occurrences   (mini-labels)
```

**FontSize ogólnie**: używamy 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 52, 72px. Top 4: 11px (147x), 10px (110x), 12px (109x), 13px (104x).

**Paleta kolorów**: ~20 unique kolorów + warianty z opacity. Top 8:
```
#475569 (slate-600)       128x  ← muted text
#64748b (slate-500)       124x  ← secondary text
#e2e8f0 (slate-200)        71x  ← primary text
#10b981 (emerald-500)      50x  ← success / income
#94a3b8 (slate-400)        49x  ← labels
#334155 (slate-700)        48x  ← borders dark
#60a5fa (blue-400)         31x  ← interactive accent
#ef4444 (red-500)          21x  ← warning / expense
```

### Werdykt: NIE naprawiać

**Powody**:

1. **Paleta kolorów jest spójna**. Tailwind slate scale dla tekstów (`#475569` → `#cbd5e1` → `#e2e8f0`), semantic colors dla statusów (zielony = pozytyw, czerwony = negatyw, żółty = ostrzeżenie, niebieski = info), accent colors dla brand (gradient `#1e40af → #7c3aed`). Konsekwentne.

2. **Wariacje fontSize wynikają z naturalnej hierarchii**, nie z chaosu:
   - Tytuły sekcji (Settings): 14-16px
   - Section labels (KPI w widget'ach): 10-12px uppercase
   - Body text: 11-13px
   - Numbers / KPI values: 14-22px
   - Hero numbers (FinancialScore 90/100): 18-32px
   
   Zaglądam w pojedynczy widok (np. Dashboard) — tam jest **konsystencja**: wszystkie KPI labels mają fontSize:10 letterSpacing:0.08em, wszystkie KPI values są w 'DM Mono' fontSize:14-16. Wariacje statystyczne są **między widokami**, nie wewnątrz nich.

3. **Zmiany ryzykowne** vs **korzyść niepewna**. Refactor wszystkich section titles do reusable `<SectionTitle variant="...">` to ~30 plików zmienionych, ~200+ replacements. Ryzyko regresji. Korzyść: subiektywna. **Nie warto bez konkretnego sygnału że coś gryzie usera.**

### Drobne fixy które zrobiłem

**Dashboard pluralizacja** (linia 549):
```diff
- {pct}% {cycleDay > 1 ? "cyklu" : "miesiąca"} minęło · do końca {daysLeft} {daysLeft === 1 ? "dzień" : "dni"}
+ {pct}% {cycleDay > 1 ? t("dash.cycleWord","cyklu") : t("dash.monthWord","miesiąca")} {t("dash.elapsed","minęło")} · {t("dash.untilEnd","do końca")} {daysLeft} {daysLeft === 1 ? t("daily.day","dzień") : t("daily.days","dni")}
```

Tylko miejsce w Dashboard gdzie inline PL wymykało się EN. Klucze `dash.cycleWord`, `dash.monthWord`, `dash.elapsed`, `dash.untilEnd` dodane do i18n.

## Pliki zmienione (3 pliki)

| Plik | Co |
|---|---|
| `src/components/SettingsPanel.jsx` | ~50 nowych `t()` calls, 24 hardcoded PL pozostawione (Excel headers + bank patterns) |
| `src/i18n.js` | +91 kluczy EN dla settings.* + 4 dash.* |
| `src/views/Dashboard.jsx` | Cycle/month + day pluralizacja przez t() |
| `package.json` | 1.3.2 → 1.3.3 |

Build: zielony (28.30s), bundle ~91KB gzip (bez zmian).

## Co przetestować

### Po przełączeniu na EN

1. **Settings → wszystkie sekcje** powinny być po angielsku:
   - Default account, Billing cycle, My categories, PRO Diagnostics
   - Export/Import, Reminders, Templates, Security, Partner name, **Reset data**
2. **Modal'e**:
   - "Wipe all data?" / "Load demo data?"
3. **Confirm dialogs** (delete category, delete cycle entry):
   - Po angielsku
4. **PRO badge** (jeśli masz aktywne PRO):
   - "Lifetime access · thanks for the support!" lub "Valid until {date}"
   - Data formatowana w `en-US` style ("4/29/2027" zamiast "29.04.2027")
5. **Toast po imporcie**:
   - **Po polsku** (świadomie zostawione, complex pluralization)
6. **Excel export po EN**:
   - Headers w pliku **po polsku** (Budżety, Płatności, Bilans) — to jest celowe, dla PL workflow

### Edge case

Jeśli zauważysz gdziekolwiek jeszcze polski tekst po przełączeniu na EN — daj znać konkretnie którą sekcję, naprawię.

## Co dalej

- **Faza 3 TWA setup** — czeka na keystore + SHA256
- **Faza 2 RevenueCat** — wstrzymane, BabyLog idzie spokojnie
- **Drobne poprawki po teście v1.3.3** — wgraj, deployuj, sprawdź na realnych danych

Apka ma teraz pełne EN dla user-facing (oprócz internal PL workflow rzeczy które celowo nie ruszane). Gotowa pod EN markets jeśli kiedyś tam pójdziesz.

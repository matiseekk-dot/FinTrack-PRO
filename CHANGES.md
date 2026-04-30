# FinTrack PRO v1.3.9 — Fix duplikacji "zł zł" + variety w Dashboard insightach (2026-04-30)

`package.json` 1.3.8 → **1.3.9** (patch — bug fixes na podstawie screenshotu z produkcji).

## Bug 1: "1044,63 zł zł" duplikacja sufiksu

**Symptom**: w Dashboard widget'ach "Średnia dzienna" i "Możesz dziennie" sufiks "zł" pokazuje się dwa razy (np. "1044,63 zł zł" zamiast "1044,63 zł").

**Root cause**: Dashboard linia 504 i 508 robiło `{fmt(dailySpend)} zł` ale `fmt()` **już zwraca string z " zł"**. Czyli template wyświetlał "X zł" + " zł" = "X zł zł".

**Fix**: usunięty redundantny sufiks " zł" w renderze:
```diff
- {fmt(dailySpend)} zł
+ {fmt(dailySpend)}
- {safePerDay > 0 ? fmt(safePerDay) : "0,00"} zł
+ {safePerDay > 0 ? fmt(safePerDay) : "0,00 zł"}
```

Plus naprawione `"0,00"` (bez zł) w fallback dla zerowego budgetu — teraz `"0,00 zł"`.

**Plik**: `src/views/Dashboard.jsx` linia 504, 508.

## Bug 2: Insighty w Dashboard nigdy się nie zmieniały

**Symptom**: insighty na Dashboard ("Auto to Twoja największa kategoria", "Wydajesz X% mniej", "W tym tempie wydasz Y rocznie") pokazywały się **codziennie te same**, mimo że w v1.3.6 dodałem variety mechanism.

**Root cause**: Dashboard renderuje `<InsightsCard>` z `src/components/InsightsCard.jsx` które używa `generateInsights()` z `src/lib/insights.js`. Mój fix w v1.3.6 dotyczył **innego komponentu** — `<Insights>` z `src/components/AnalyticsWidgets.jsx` (widget w widoku Analiza, nie Dashboard).

Czyli były dwa **niezależne systemy insightów**:
- Analiza widget → `AnalyticsWidgets.jsx::Insights` → naprawione w v1.3.6 ✅
- Dashboard card → `lib/insights.js::generateInsights` → **nieruszone** ❌

**Fix**: pełny rewrite `lib/insights.js` z:
- **6 reguł → 13 reguł** (top kategoria, top merchant, month vs month, weekend, yearly projection, druga kategoria, tx count high/low, top day of week, drugi merchant, weekly avg, category shift, średnia tx)
- **Variety mechanism**: Critical (anomalia tx) zawsze pierwsze (max 2), Informational shuffle z dziennym seedem `epochDays + cycleDay * 7` (linear congruential)
- **Cap 3 insighty** + retirement insights jako bonus (gdy zostało miejsce)

W praktyce: dziś widzisz [Critical, Info A, Info B], jutro [Critical, Info F, Info A]. Po tygodniu prawie cała pula informational przewinie się.

**Pliki**: `src/lib/insights.js` (~376 linii vs ~150 wcześniej).

## Bug 3 (NIE bug): "Średnia dzienna 1044 zł vs Możesz dziennie 117 zł"

**Sprawdzone dokładnie — nie jest bugiem.**

Te dwa wskaźniki mierzą **różne rzeczy**:

- **Średnia dzienna** = `recurringExp / elapsedCycDays` — **przeszłe** wydatki stałe (bez jednorazowych >500zł lub >4x mediany) podzielone przez liczbę dni które minęły w cyklu
- **Możesz dziennie** = `safeToSpend / daysLeft` — bilans minus nadchodzące rachunki podzielony przez **pozostałe** dni cyklu

W twojej sytuacji (screenshot 30 kwietnia, cykl 28 → cykl trwa od 28.04, czyli ledwo się zaczął — `elapsedCycDays ≈ 3`):
- W 3 dniach wydałeś ~3133 zł stałych → średnia 1044/dzień (matematycznie poprawne)
- Plus jednorazowy 2276 zł na Auto (idzie do `oneTime`, nie do średniej)
- Zostało 26 dni cyklu, 3042 zł safe → 117/dzień planowanego

**Liczby są poprawne, ale mylące w kontekście cyklu który ledwo się zaczął.** Średnia w pierwszych 3 dniach jest niereprezentatywna dla całych 30 dni.

**Co mogę zrobić w v1.4 jeśli zauważysz że to dalej myli**:
- Tooltip nad wartościami wyjaśniający różnicę
- Hint "z X dni" obok średniej dziennej żeby było widać że to z krótkiego okresu
- Nie pokazywać średniej dziennej w pierwszych 5 dniach cyklu (zbyt mała próbka)

W v1.3.9 nie ruszam — chcę żebyś najpierw zobaczył nowe insighty i zdecydował czy nadal myli.

## Pliki zmienione (3)

```
src/views/Dashboard.jsx          [bug fix duplikacji "zł zł" - 2 linie]
src/lib/insights.js              [rewrite 6 → 13 reguł + variety mechanism, ~226 linii dodanych]
package.json                      [1.3.8 → 1.3.9]
```

Build: zielony (22.25s), bundle ~91KB gzip.

## Test scenariusze

### Po wgraniu v1.3.9

1. **Dashboard widget'y "zł zł"**:
   - "Średnia dzienna" → powinna być "1044,63 zł" (bez duplikacji)
   - "Możesz dziennie" → powinna być "117,64 zł" (bez duplikacji)

2. **Dashboard insighty**:
   - **Dziś** zobaczysz X zestaw (np. Auto, oszczędność, projekcja roczna)
   - **Jutro** zobaczysz **inny** zestaw mimo że dane się nie zmieniły
   - **Pojutrze** kolejny inny

   Critical (anomalia tx >3x mediany) zawsze pierwsze. Informational losowane z dziennego seedu.

3. **"Średnia dzienna 1044 vs Możesz dziennie 117"**: dalej różne wartości — to NIE jest bug. Po kilku dniach cyklu wartości się zbliżą bo średnia będzie bardziej reprezentatywna.

## Co dalej

Backlog otwartych:
- **Faza 3 TWA setup** — czeka na keystore + SHA256
- **Faza 2 RevenueCat** — wstrzymane
- **Średnia dzienna labels/tooltip** — może w v1.4 jeśli dalej myli

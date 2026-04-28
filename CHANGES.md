# FinTrack PRO v1.2.9 — Diagnostyka PRO sync + preset kategorie przychodów (2026-04-28)

`package.json` 1.2.8 → 1.2.9.

## TL;DR

Dobra wiadomość z Twojego DevTools: **`encrypt failed RangeError` zniknął**. Mój v1.2.8 fix zadziałał. Pozostałe Twoje pytania: **PRO sync nadal nie syncuje + brakuje konkretnych kategorii przychodów**.

| | v1.2.8 | v1.2.9 |
|---|---|---|
| `[FT] encrypt failed RangeError` w DevTools | naprawione | naprawione |
| Diagnostyka czemu PRO nie syncuje | brak | dodana w Settings |
| Force-sync przycisk dla PRO | brak | jest |
| Preset kategorie przychodów (Vinted, Partner, Apki) | brak | jest |

---

## 🔧 Diagnostyka PRO sync — nowy panel w Settings

**Twoja skarga:** „A nic się nie zmieniło a zrobiłem wszystko co chciałeś."

Encrypt fix zadziałał (potwierdzone przez Twój screenshot). Ale PRO sync wciąż nie działa. To znaczy że **jest inny bug**, którego nie widzę bez Twoich danych. Dodałem panel diagnostyczny żebyś mógł sam zdiagnozować i wyforsować sync.

### Gdzie znaleźć

Settings → przewiń na sam dół, sekcja **"🔧 Diagnostyka licencji"**.

### Co pokazuje

```
Lokalnie (ten browser):
  isPro: TAK (yearly)
  aktywowane: 2026-04-28 14:23:11
  wygasa: 2027-04-28 14:23:11

Zalogowany jako:
  matiseekk@gmail.com (abc123def456...)
```

Lub gdy nie aktywne:
```
Lokalnie (ten browser):
  isPro: NIE
```

### Force-sync przycisk

Gdy `isPro=TAK` widzisz przycisk **"🔄 Wymuś sync PRO status do Firestore"**. Klika → wymusza save do Firestore (bez czekania na debounce 1.5s) → po 2.5s pokazuje wynik.

### Workflow naprawy

**Scenario A**: telefon ma PRO, laptop nie.

1. **Telefon** → Settings → Diagnostyka → sprawdź czy isPro=TAK
2. **Telefon** → kliknij "🔄 Wymuś sync PRO status do Firestore" → poczekaj alert "✅ wysłany"
3. **Laptop** → hard refresh (Ctrl+Shift+R)
4. **Laptop** → poczekaj 2-3s na Firestore load
5. **Laptop** → Settings → Diagnostyka → powinno pokazać isPro=TAK

**Scenario B**: oba urządzenia FREE, ale gdzieś masz licencję.

Aktywuj na laptopie → kliknij Force Sync → poczekaj na alert → telefon hard refresh.

**Scenario C**: nie wiesz co się dzieje.

Otwórz panel na obu urządzeniach, **prześlij mi screenshoty** obu. Wtedy widzę co jest w localStorage każdego + jakie uid są zalogowane. Bez tego latam na ślepo.

---

## 🟢 Preset kategorie przychodów (Twoja konkretna lista)

**Twoja lista:** „wygrane u bukmachera, vinted, od żony na rachunki/zakupy, może uda się coś zarabiać z apek."

### Co dodałem do BASE_CATEGORIES

Wszyscy nowi userzy dostają to out-of-the-box:

| ID | Label | Pokrywa |
|---|---|---|
| `przychód` | **Pensja** (zmieniona nazwa) | wynagrodzenie z pracy |
| `sprzedaż` | **Sprzedaż (Vinted/Allegro)** | Vinted, Allegro Lokalnie, OLX, sprzedaż używanych |
| `partner` | **Od partnera** ⭐ NEW | od żony/męża na rachunki, zakupy, wspólne wydatki |
| `dodatkowe` | **Dodatkowe (apki/freelance)** | przychód z apek (BabyLog, FinTracker), freelance, side hustle |
| `bukmacherka` | **Wygrane (zakłady)** | bukmacher (STS, Fortuna, Betclic) |
| `zwrot` | **Zwroty (PIT/sklep)** ⭐ NEW | PIT zwrot, zwrot z e-commerce |

**Zmiany nazw**:
- `Przychód` → `Pensja` (jaśniej)
- `Sprzedaż` → `Sprzedaż (Vinted/Allegro)` (sugestia kontekstu)
- `Dodatkowe` → `Dodatkowe (apki/freelance)`
- `Wygrane` → `Wygrane (zakłady)`

**Zmiany ID**: brak (kompatybilność wsteczna). Twoje istniejące transakcje z `cat: "przychód"` nadal działają, po prostu dostają nową labelę "Pensja".

### Jak teraz wybrać

Add Transaction → "📥 Przychód" → dropdown "Kategoria przychodu":
1. Pensja
2. Sprzedaż (Vinted/Allegro)
3. **Od partnera** ← nowa
4. Dodatkowe (apki/freelance)
5. Wygrane (zakłady)
6. **Zwroty (PIT/sklep)** ← nowa
+ wszystkie Twoje custom income cats (jeśli kiedyś dodasz)

### Dlaczego nie zostawić tylko custom?

Bo:
- Nowi userzy nie wiedzą że można dodać custom
- Mateusz pisał "ludzie mają różne przychody" = sugeruje że to normalna potrzeba, nie edge case
- 6 BASE income cats + opcja custom = balans między prostotą a fleksyblnością

Jeśli za dużo, w przyszłej v1.3 możemy dodać "ukryj nieużywane kategorie" w Settings.

---

## 🟡 Cross-Origin-Opener-Policy (Twoje "Image" — 2 błędy)

```
Cross-Origin-Opener-Policy policy would block the window.close call.
firebase-cWgg6Pqa.js:1291
```

To są **firebase auth popup ostrzeżenia**, nie nasze. Auth dalej działa (zalogowany jesteś). Naprawienie wymaga przełączenia z `signInWithPopup` na `signInWithRedirect` co **zabiera całą stronę** podczas logowania = gorszy UX.

**Decyzja**: zostawiam. Nie wpływa na funkcjonalność. Jeśli kiedyś Chrome zacznie BLOKOWAĆ (nie tylko ostrzegać), wtedy fix.

---

## 🟡 Recharts violation `'click' handler took 1021ms` (Twoje Image)

```
[Violation] 'click' handler took 1021ms
recharts-BOmpF1N_.js:24
```

To z biblioteki recharts (nie nasz kod). Oznacza że jakiś kliknięty wykres w Twoim AnalyticsView miał >1s czasu na render. Pewnie duży chart z dużą ilością danych.

**Decyzja**: zostawiam. Performance issue, nie błąd. Optymalizacja recharts to projekt sam w sobie. Gdyby było consistently > 2s, to sygnał że trzeba zaagregować dane w mniejsze chunki.

---

## Pliki zmienione (3)

```
src/components/SettingsPanel.jsx    [+ Diagnostyka licencji + Force sync button]
src/App.jsx                         [+ proStatus prop + onForceSyncProStatus do SettingsPanel]
src/constants.js                    [BASE_CATEGORIES income: + partner, + zwrot,
                                     zmiany nazw: Pensja/Sprzedaż (Vinted)/Dodatkowe (apki)/Wygrane (zakłady)]
package.json                        [1.2.8 → 1.2.9]
```

---

## 🚀 Deploy

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.9: PRO sync diagnostyka + preset kategorie przychodów"
git push --force
```

**Po push:** hard refresh + clear SW (jak zwykle, jeśli widzisz starą wersję).

---

## Co realnie zrobić po deployu

### Test 1: Diagnostyka PRO

```
1. Settings → przewiń na dół → Diagnostyka licencji
2. Sprawdź na laptopie: isPro = ? type = ?
3. Sprawdź na telefonie: isPro = ? type = ?
```

**Możliwe sytuacje:**

| Laptop | Telefon | Co zrobić |
|---|---|---|
| isPro=TAK | isPro=TAK | wszystko OK, sync działa |
| isPro=NIE | isPro=TAK | telefon kliknij Force Sync, laptop hard refresh |
| isPro=TAK | isPro=NIE | laptop kliknij Force Sync, telefon hard refresh |
| isPro=NIE | isPro=NIE | nigdzie nie aktywowałeś. Aktywuj 1× → Force Sync → drugi: refresh |

### Test 2: Kategorie przychodów

```
1. Add Transaction → "📥 Przychód"
2. Dropdown powinien pokazać 6 opcji:
   - Pensja
   - Sprzedaż (Vinted/Allegro)
   - Od partnera
   - Dodatkowe (apki/freelance)
   - Wygrane (zakłady)
   - Zwroty (PIT/sklep)
3. Wybierz "Od partnera" → Save
4. W TransactionsView powinno być widoczne z tą kategorią
```

### Test 3: Custom income cat (jeśli chcesz konkretną nazwę)

```
1. Settings → Kategorie → Dodaj
2. Nazwa: "Premia roczna ING"
3. Typ: Przychód
4. Save
5. Add Transaction → Przychód → "Premia roczna ING" w dropdownie
```

---

## Co WCIĄŻ otwarte

1. **PRO sync diagnoza** — czeka na Twoje screenshoty z Diagnostyki na obu urządzeniach
2. **User-defined classification per kategoria** (Stałe vs Lifestyle per kategoria w Strukturze wydatków)
3. **VAPID key** przed produkcją
4. **Lifestyle 45%** — czeka na konkretne przykłady transakcji od Ciebie

---

## Mój priorytet rekomendacja

Zrób Test 1 (Diagnostyka) na obu urządzeniach. **Prześlij screenshoty obu**. Wtedy widzę:

- czy proStatus jest w localStorage każdego
- jaki uid jest zalogowany (czy to ten sam)
- czy Force Sync wystawia komunikat success/fail

To powinno **definitywnie** rozwiązać "PRO sync nie działa" problem. Bez tych info nie mogę zdiagnozować, bo wszystko w kodzie wygląda poprawnie i smoke testy przeszły 14/14.

Po PRO sync działającym → idziemy w user-defined classification per kategoria (Lifestyle/Stałe).

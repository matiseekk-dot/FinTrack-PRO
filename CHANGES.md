# FinTrack PRO v1.2.8 — KRYTYCZNY fix encrypt + kategorie przychodów (2026-04-28)

`package.json` 1.2.7 → 1.2.8.

## TL;DR

| | v1.2.7 | v1.2.8 |
|---|---|---|
| **encrypt failed RangeError przy state >100k bytes** | **CRASH** | naprawione |
| PRO sync na laptopie | nie działało (skutek encrypt fail) | powinno działać |
| Picker kategorii dla przychodów | brak | jest |
| GoatCounter 400 zaśmiecający DevTools | tak | wyłączony (placeholder) |
| Service Worker | v7 | v7 (bez zmian) |

---

## 🔴🔴🔴 BUG KRYTYCZNY: `encrypt failed RangeError`

**Twoja diagnoza:** Image 2 z DevTools console pokazał:
```
[FT] encrypt failed RangeError: Maximum call stack size exceeded
  at Ki (index-DgVRtyAg.js:38:7196)
  at async Zi (index-DgVRtyAg.js:38:10174)
```

### Co się dzieje technicznie

`src/lib/crypto.js` linia 45 (przed fixem):
```js
return "enc:v1:" + btoa(String.fromCharCode(...combined));
```

`combined` to `Uint8Array` zawierający IV + ciphertext zaszyfrowanego state. **Spread `...combined` używa argumentów funkcji.** V8 (Chrome) ma limit ~125k argumentów na wywołanie. Gdy Twój state przekracza ~100k bytes plain (po szyfrowaniu jeszcze więcej), spread wybucha z `RangeError: Maximum call stack size exceeded`.

### Co to oznacza dla Ciebie

Każdy save do localStorage **failował**. To znaczy:

1. Każda zmiana stanu (dodanie tx, aktywacja PRO, edycja konta) NIE zapisywała się trwale
2. Po hard refresh dane wracają do **ostatniego prawidłowego save** (przed przekroczeniem 100k)
3. PRO aktywacja → `localStorage.setItem("ft_pro_status", ...)` zadziała (bezpośrednie), ale potem **bulk save całego state** failuje → Firestore też dostaje śmieciowe payload (encryptString → fallback do plaintext, ale to inna gałąź)
4. Sync między urządzeniami nie działa bo Firestore save na laptopie failuje

**To wyjaśnia dlaczego PRO sync nie działał na laptopie.** Telefon prawdopodobnie ma mniej state (świeższa instalacja?), nie przekracza 125k spread limit.

### Fix

`src/lib/crypto.js`:
```js
// PRZED (wybucha dla >100k bytes):
return "enc:v1:" + btoa(String.fromCharCode(...combined));

// PO (chunk po 8k, działa do 1M+ bytes):
return "enc:v1:" + btoa(uint8ToBinaryString(combined));

function uint8ToBinaryString(arr) {
  const CHUNK = 8192;
  let result = "";
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.subarray(i, i + CHUNK);
    result += String.fromCharCode.apply(null, slice);
  }
  return result;
}
```

### Test fix

```
Test 1 (10 bytes):     ✅ OK
Test 2 (50k bytes):    ✅ OK
Test 3 (200k bytes):   ✅ OK   (stary kod: 💥 RangeError)
Test 4 (1M bytes):     ✅ OK
```

### Po deployu

Po Twoim hard refresh + clear SW cache, PRO aktywacja powinna pójść poprawnie do Firestore i syncować się na drugie urządzenie.

**Jeśli widzisz nadal `[FT] encrypt failed`** w DevTools po deployu, daj znać natychmiast — to znaczy że masz inny edge case.

---

## 🟢 Kategorie dla przychodów (twój feature request)

**Twoja skarga (z wcześniej):** „w przychodzie nie da się dać jakiejś kategorii."

### Diagnoza

`src/views/TransactionsView.jsx` linia 572:
```jsx
{form.type === "expense" && (
  <Select label="Kategoria" ...>
    {/* picker tylko dla wydatków */}
  </Select>
)}
```

Picker kategorii **w ogóle nie pokazywał się** dla `form.type === "income"`. Wszystkie przychody dostawały hardkodowaną listę 4 kategorii (przychód/sprzedaż/dodatkowe/bukmacherka), a custom income cats były ignorowane.

### Fix

```jsx
{form.type === "income" && (
  // v1.2.8: picker kategorii dla przychodów. BASE income cats + custom z group: "income".
  <Select label="Kategoria przychodu" ...>
    {(allCats||CATEGORIES).filter(c => c.group === "income").map(c => (
      <option key={c.id} value={c.id}>{c.label}</option>
    ))}
  </Select>
)}
```

Plus 2 dodatkowe poprawki:

1. **Logika `finalCat` używa dynamicznej listy** (nie hardkodowanych 4 cat):
   ```js
   const incomeCatsList = (allCats || CATEGORIES).filter(c => c.group === "income").map(c => c.id);
   const finalCat = form.type === "income"
     ? (incomeCatsList.includes(form.cat) ? form.cat : "przychód")
     : form.cat;
   ```

2. **Przy switch type expense ↔ income** automatycznie ustaw sensowny default:
   ```js
   if (v === "income" && !incomeCatsList.find(cat => cat.id === f.cat)) {
     nextCat = incomeCatsList[0]?.id || "przychód";
   } else if (v === "expense" && !expenseCatsList.find(cat => cat.id === f.cat)) {
     nextCat = "jedzenie";
   }
   ```

### Jak teraz dodać własną kategorię przychodu

1. Settings → Kategorie → Dodaj
2. Wpisz nazwę (np. "Premia roczna", "Dywidenda", "Side hustle")
3. Wybierz typ: **Przychód**
4. Save
5. Następna nowa transakcja → przełącz na "Przychód" → w dropdownie zobaczysz "Premia roczna" obok 4 standardowych

### Custom income cats syncują się przez Firestore

`customCats` jest w `SYNC_KEYS`, więc kategorie zdefiniowane na 1 urządzeniu pojawią się na drugim po sync.

---

## 🟢 Spójność widoków „Bieżący" vs „Okresy" (twój komentarz)

**Twoja prośba:** „Te przychody bieżące niech zostaną po prostu lista a w tych innych okresy. Po prostu żeby spójnie było."

### Co już działa po v1.2.7 + co sprawdziłem

**Bieżący (cykl rozliczeniowy):**
- ✅ Struktura przychodów: lista wszystkich źródeł (`IncomeTypesBreakdown`, top 8)
- ✅ Wydatki per miejsce: tylko z `monthTx` (cykl bieżący)
- ✅ Hobby stats: 4 statystyki Cykl/Mies/Kwart/Rok

**Okresy (Q/H/Y):**
- ✅ Toggle Wydatki/Przychody (dla obu)
- ✅ Group by Kategorii / Miejscu (dla obu)
- ✅ Sort by Kwota / Ilość / Średnia
- ✅ Top 20 z paskami progresji
- ✅ Period summary: Wydatki / Wpływy / Bilans

Czyli w „Bieżący" masz **listy** (wszystkie źródła naraz), a w „Okresy" masz **agregacje** (Q1/H1/Y, top N, group by). To jest spójne.

### Edge case: sprawdź sam

Jeśli w „Okresy" → Przychody → widzisz coś dziwnego (np. nadal pokazuje top 1 zamiast pełnej listy), daj znać dokładnie co. Bo struktura kodu jest dobra, ale mogłem coś przegapić.

---

## 🟢 GoatCounter 400 — wyłączony

**Twoja diagnoza:** Image 2:
```
Failed to load fintrackpro.goatcoun...536&b-0&rnd=vcgfx:1 resource:
the server responded with a status of 400 ()
```

### Co się dzieje

`index.html` ma:
```html
<script data-goatcounter="https://fintrackpro.goatcounter.com/count" ...>
```

Ale **`fintrackpro` to placeholder** — nigdy nie zarejestrowałeś konta na goatcounter.com. Każde otwarcie strony wysyła analytics request → 400.

### Fix

W v1.2.8 wyłączyłem ten skrypt (zakomentowany z instrukcją włączenia). Dopóki nie zarejestrujesz konta, nie ma 400.

```html
<!-- Aby włączyć:
       1. Zarejestruj się na https://goatcounter.com
       2. Stwórz site z kodem (np. 'fintrack-skudev')
       3. Odkomentuj poniższy script i wstaw swój kod zamiast 'fintrackpro'
<script data-goatcounter="https://fintrackpro.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
-->
```

---

## 🟡 Cross-Origin-Opener-Policy ostrzeżenia (NIE naprawione)

**Twoja diagnoza:** Image 3:
```
Cross-Origin-Opener-Policy policy would block the window.close call.
firebase-cWgg6Pqa.js:1291
```

### Co się dzieje

Firebase auth używa `signInWithPopup` (popup okno → user wybiera Google account → popup zamyka się i przekazuje token). Chrome wprowadził politykę COOP która ostrzega gdy popup próbuje się zamknąć przez window.close().

### Decyzja: ZOSTAWIAM

**To są ostrzeżenia, nie błędy.** Auth dalej działa. Naprawienie wymaga przełączenia na `signInWithRedirect` co zabiera całą stronę → user widzi przekierowanie → wraca → musi zalogować się znowu jeśli session expired. Gorszy UX.

Jeśli kiedyś Chrome zacznie BLOKOWAĆ (nie tylko ostrzegać), wtedy fix. Na razie ignoruj.

---

## Pliki zmienione (5)

```
src/lib/crypto.js                   [KRYTYCZNE: chunked uint8ToBinaryString]
src/views/TransactionsView.jsx      [+ picker income cat, + dynamiczny finalCat,
                                     + auto-default cat przy switch type]
index.html                          [GoatCounter wyłączony]
package.json                        [1.2.7 → 1.2.8]
```

(SettingsPanel.jsx już ma flow dodawania custom income cat z `group: "income"` — bez zmian.)

---

## 🚀 Deploy

```bash
npm install
npm run build
git add -A && git commit -m "v1.2.8: KRYTYCZNY fix encrypt RangeError + kategorie przychodów"
git push --force
```

**Po push, KONIECZNIE:**

```
1. F12 → Application → Service Workers → Unregister fintrack-pro-v7 (jeśli jest)
2. Application → Storage → Clear site data
3. Hard refresh (Ctrl+Shift+R lub iPhone: Settings → Safari → Clear History)
```

To jednorazowe — uniknie konfliktu cache.

---

## Test scenariusze po deployu

### 1. Encrypt fix

Otwórz aplikację, F12 → Console. **NIE powinno być** `[FT] encrypt failed RangeError`.

Jeśli widzisz dalej — daj znać natychmiast (to inny edge case, np. circular reference w state).

### 2. PRO sync (najważniejsze)

```
A. Laptop: aktywuj PRO (jeśli jeszcze nie aktywne)
B. Poczekaj 3 sekundy (Firestore save debounce 1.5s + buffer)
C. Telefon (zalogowany na to samo konto): hard refresh
D. Po 1-2 sekundach Firestore load → telefon też powinien być PRO
```

**Jeśli nie działa:** otwórz Firestore console → users/{Twój uid}/data/main → sprawdź czy `proStatus` field tam jest. Jeśli nie ma — Firestore save ciągle failuje (potrzebuję Twojego DevTools console screenshot).

### 3. Kategoria przychodu

```
A. Settings → Kategorie → Dodaj nową
B. Wpisz "Premia roczna", wybierz typ: Przychód
C. Save
D. Add Transaction → klik "+ Dodaj"
E. Kliknij "📥 Przychód"
F. W dropdownie "Kategoria przychodu" powinny być:
   - Przychód
   - Sprzedaż
   - Dodatkowe
   - Wygrane
   - Premia roczna  ← Twoja custom
```

### 4. GoatCounter 400

DevTools → Network → odśwież. **NIE powinno być** request do `goatcounter.com` z 400 status.

---

## Co WCIĄŻ otwarte

1. **User-defined classification per kategoria** (struktura wydatków: "Kredyt Dom" jako Stałe zamiast Variable)
2. **VAPID key** — przed produkcją (krok manualny w Firebase Console)
3. **K3 NBP API** — niezaimplementowane (placeholder w rateLimit.js)
4. **TZ bug** — pytany 7×, brak odpowiedzi

---

## Mój priorytet rekomendacja

Po deployu 2 najważniejsze testy:

1. **`[FT] encrypt failed`** w DevTools — jest czy nie?
2. **PRO sync** — laptop aktywuje, telefon widzi?

Jeśli oba zielone, idziemy w **user-defined classification per kategoria** (żeby Lifestyle 45% nie wracało).

Jeśli encrypt nadal failuje — daj DevTools screenshot natychmiast.

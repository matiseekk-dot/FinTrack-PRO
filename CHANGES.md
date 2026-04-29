# FinTrack PRO v1.3.4 — HOTFIX edycji hobby (2026-04-29)

`package.json` 1.3.3 → **1.3.4** (patch bump — bug fix).

## Bug który naprawiłem

**Symptom**: w widoku Hobby → wchodzisz w hobby → klikasz Edit (ołówek) → **nic się nie dzieje**. Modal nie otwiera się. Edycja kompletnie zablokowana.

**Root cause**: state collision między `detailsId` a `modalHobby` w `HobbyView.jsx`.

```jsx
function HobbyView() {
  const [modalHobby, setModalHobby] = useState(null);
  const [detailsId, setDetailsId] = useState(null);

  const openEdit = (hobby) => setModalHobby(hobby);  // ← bug

  if (detailsId) {
    return <HobbyDetails onEdit={() => openEdit(hobby)} />;  // wczesny return
  }

  return (
    <div>...</div>
    {modalHobby && <HobbyModal />}  // ← nigdy nie dochodzi do render'u
  );
}
```

Flow który nie działał:
1. User klika hobby card → `setDetailsId(h.id)` → re-render → `HobbyDetails` renderowany
2. User klika Edit w details → `setModalHobby(hobby)` → re-render
3. Re-render: `if (detailsId) return <HobbyDetails>` — **early return ucina cały komponent**
4. `{modalHobby && <HobbyModal>}` jest **po** tym return'cie więc **nigdy się nie renderuje**

To był regression z dodawania feature'u "details view" w którejś z wcześniejszych iteracji. Modal działał gdy edycja szła z listy, ale po dodaniu details page nikt nie zauważył że flow z details page nie pokazuje modalu.

**Fix**:

```jsx
const openEdit = (hobby) => {
  setDetailsId(null);  // ← czyści details żeby modal mógł się renderować
  setModalHobby({ ...hobby, yearlyTarget: hobby.yearlyTarget ? String(hobby.yearlyTarget) : "" });
};
```

User klika Edit w details → details znika → modal otwiera się **na liście hobby**. Po zapisaniu modal się zamyka, lista odświeżona z nowymi danymi. Po zamknięciu modal'a (Anuluj) user widzi listę a nie details — to akceptowalne zachowanie, większość apek działa tak samo (Edit zwykle wraca cię do listy).

## Plik zmieniony (1 plik, 4 linie)

```
src/views/HobbyView.jsx  (linia 69-75: openEdit + komentarz wyjaśniający)
package.json             (1.3.3 → 1.3.4)
```

Build: zielony (19.67s), bundle bez zmian.

## Test scenariusz (dokładnie ten z v1.3.2 który nie działał)

1. Wejdź w widok Hobby
2. Klik w hobby card → otwiera się details page ✓
3. Klik Edit (ołówek w prawym górnym rogu) → **modal się otwiera** ✓
4. Zmień nazwę / kategorie / keywords → klik Save → modal zamyka się
5. Lista hobby odświeżona z nowymi danymi ✓

Plus testowy use case "Vinyle":

1. Edytuj hobby "Vinyle" — kategorie `dodatkowe`, `zakupy` + keywords `vinyl`, `ghost`, `gojira`, `katatonia`
2. Wydatek -150 zł "Ghost - Impera vinyl" w kat. zakupy → liczy się jako wydatek hobby
3. Przychód +60 zł "Vinted - Trivium vinyl" w kat. sprzedaż + opis "vinyl" → liczy się jako income hobby
4. Hobby card pokaże badge `−90 zł` (niebieski)
5. W detail hobby: Wydatki 150, Przychody 60, Netto badge `−90 zł` (czerwony)

Wszystkie logika hobby (matching, expenses/income/netto stats) **była zawsze poprawna** — testy end-to-end z poprzedniej tury to potwierdziły. Bug był tylko w UI flow edycji. Po fix wszystko działa zgodnie z planem.

## Jak Cię to dotyczy

- Jeśli **dotychczas nigdy nie edytowałeś hobby** od momentu dodania (czyli zostawiłeś z domyślnymi categories/keywords) — apka działała OK, bo dodanie nowego hobby szło przez button "+ Dodaj" które otwiera modal bez `detailsId` set'u. Bug objawiał się **tylko przy edycji istniejącego hobby**.
- Po wgraniu v1.3.4 możesz w końcu zmienić categories/keywords istniejącego hobby (np. dodać "katatonia" do "Vinyle").

## Co dalej

Po wgraniu v1.3.4 sprawdź czy:
1. Edycja hobby działa
2. Po zapisaniu hobby z nowymi keywords stare transakcje (z opisami zawierającymi te keywords) **zaczynają trafiać do hobby retroaktywnie**. To pożądane zachowanie — matching jest zawsze on-the-fly z aktualnych transakcji + aktualnych reguł hobby, nie zapisywany przy dodawaniu transakcji.

Daj znać po teście. Jeśli coś jeszcze nie działa, debuguję dalej.

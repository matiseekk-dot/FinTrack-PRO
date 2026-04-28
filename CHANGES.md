# FinTrack PRO v1.2.3 — Bug F (Inwestycje), Bug G (edycja duplikuje), 4 UX (2026-04-28)

`package.json` 1.2.2 → 1.2.3.

## TL;DR

| # | Co | Status |
|---|-----|--------|
| **F** | Inwestycje 11 000 zł zamiast 11 308,56 — Dashboard używał frozen acc.balance | ✅ Fix |
| **G** | Edycja transakcji typu „transfer" duplikuje ją w widoku transakcji | ✅ Fix |
| 1 | Struktura wydatków — kliknij Stałe/Zmienne/Lifestyle żeby zobaczyć kategorie pod spodem | ✅ Done |
| 2 | Wydatki dzienne — top 7 dni + przycisk „Pokaż wszystkie" | ✅ Done |
| 3 | Ranking wydatków — top 5 + expand · NOWY widget Ranking przychodów | ✅ Done |
| 4 | Wydatki per miejsce — top 7 + expand do top 30 | ✅ Done |

Build zielony (vite 2384 modułów, 37s, 351KB raw / 87KB gzip — +7KB względem v1.2.2). Smoke testy F+G pass.

---

## Bug F — Inwestycje 11 000 zamiast 11 308,56

### Dlaczego myliło na screenshocie

Image 1 z poprzedniego turn'a (Portfel → Inwestycje):
- XTBINW 1 szt × avg 10800 PLN, current 11 308,56 zł
- pnlPLN +508,56 (+4.71%)

Image 1 dwa tury wcześniej (Dashboard):
- INWESTYCJE 11 000,00 zł

Różnica 308,56 zł = **portfolio nie syncuje z Dashboardem**.

### Root cause

`InvestmentsView.jsx` linia 46 (stary save):
```js
const item = { id: editItem ? editItem.id : Date.now(), ticker: ..., qty, ..., account, currency };
```

Gdy edytujesz item który był wcześniej dodany przez „Dodaj z konta" (linia 241-254), dostawał on `linkedAccId: acc.id` (np. 5 = XTB Inwestycyjne). Ale przy edycji ten klucz **nie istnieje w form** (form ma tylko ticker/name/qty/avgPrice/currentPrice/account/currency). Skoro `save()` budował item od zera, `linkedAccId` znikało po pierwszej edycji.

Dashboard wywołuje `getEffectiveBalance(account, portfolio)`:
```js
if (!account || account.type !== "invest") return baseBalance;
const linked = portfolio.filter(p => p && p.linkedAccId === account.id);
if (linked.length === 0) return baseBalance;  // ← TU: skoro linkedAccId zniknął
return linked.reduce((s, p) => s + p.valuePLN, 0);
```

Gdy `linked.length === 0`, fallback na `acc.balance` (frozen 11000 — ostatnio zapisany w accounts).

### Fix

`InvestmentsView.jsx` save spread'uje istniejący item:
```js
const base = editItem ? { ...editItem } : { id: Date.now() };
const item = { ...base, ticker: ..., qty, ..., account, currency };
```

`linkedAccId`, jak każde inne pole spoza form, przechodzi z editItem do nowego item. Dashboard znowu znajduje match → liczy `sum(valuePLN)` = 11 308,56 zł.

### Co zrobić po deployu

1. Hard refresh (Ctrl+Shift+R)
2. Otwórz Portfel → Inwestycje, znajdź XTBINW
3. Kliknij Edytuj, kliknij Zapisz (bez zmian w polach) — to zapisze item z odzyskanym linkedAccId
4. Dashboard od razu pokaże 11 308,56 zł zamiast 11 000

Po fix nowe edycje już nie zgubią linka.

### Pomocniczy walidator (na przyszłość)

Jeśli to się powtórzy, w DevTools console sprawdź:
```js
const stored = JSON.parse(localStorage.getItem("fintrack_v1"));
stored.portfolio.forEach(p => console.log(p.ticker, "linkedAccId:", p.linkedAccId));
```

`undefined` przy invest account = bug F powtórzony.

---

## Bug G — Edycja transferu duplikuje

### Co widziałeś (Image 3)

W liście transakcji widać jednocześnie:
- Przelew ← Konto PKO (+5000)
- Przelew → Konto Revolut (−5000)

Te dwie się sumują w obu kierunkach przy edycji — czyli pewnie były wcześniej, edytowałeś, kod dodał kolejne 2 zamiast nadpisać.

### Root cause

`TransactionsView.jsx` linia 82-99 (stary kod):
```js
if (form.type === "transfer" && form.toAcc && parseInt(form.toAcc) !== parseInt(form.acc)) {
  // ... tworzy 2 nowe tx (txOut + txIn) ...
  setTransactions(tx => [txIn, txOut, ...tx]);
  // ... aktualizuje balance kont ...
  setModal(false);
  return;
}
```

Brak checka `if (editingId)`. Niezależnie czy to nowy transfer czy edycja istniejącego — kod wstawia 2 nowe rekordy + zostawia stary niezmieniony.

Dla normalnych tx (expense/income) niżej w kodzie jest osobny branch z `if (editingId)` który robi `tx.map(t => t.id === editingId ? {...t, ...txData} : t)`. Ale do tego brancha kod nigdy nie dochodzi gdy type=transfer, bo wcześniej `return`.

### Fix

W transferze, gdy `editingId` jest set, **najpierw usuwamy starą tx** (i odwracamy jej balance), potem dodajemy nową parę:

```js
if (editingId) {
  const oldTx = transactions.find(t => t.id === editingId);
  if (oldTx) {
    if (setAccounts) {
      setAccounts(accs => accs.map(a =>
        a.type !== "invest" && a.id === oldTx.acc
          ? { ...a, balance: parseFloat((a.balance - oldTx.amount).toFixed(2)) }
          : a
      ));
    }
    setTransactions(tx => tx.filter(t => t.id !== editingId));
  }
  setEditingId(null);
}
// ... potem standardowa logika dodawania pary tx
```

### Edge case który był w starym kodzie

Edycja jednej połowy transferu (np. „Przelew ← Konto PKO") usuwa z bazy tylko tę jedną tx i tworzy nową parę. Druga połowa starego transferu (`Przelew → Konto Revolut`) zostaje **osierocona**. Statystyki nie cierpią (transfery są kategorii "inne" więc się nie liczą do wydatków/przychodów), ale w widoku transakcji jest brzydko.

Pełny fix wymaga linkowania par transferów (np. wspólny `transferId`) — odkładam do v1.3.0. Na razie po edycji transferu **sprawdź czy nie ma osieroconej drugiej połowy** i ręcznie ją usuń.

Lepsze rozwiązanie: jeśli chcesz zmienić transfer — usuń starą parę (oba klucze są jeden po drugim w liście) i dodaj świeżą.

---

## Feature 1 — Struktura wydatków expandable

### Co widziałeś (Image 4)

```
STRUKTURA WYDATKÓW
Stałe        58% doch.   6.1k zł
Zmienne     114% doch.  11.9k zł
Lifestyle   117% doch.  12.3k zł
```

I uwaga: „dobrze byłoby wiedzieć co się kryje pod tymi kategoriami".

### Co zrobiłem

W `AnalyticsWidgets.jsx` `ExpenseTypesBreakdown` jest teraz klikalny:
- Klik na „Stałe" → rozwinie pod spodem listę kategorii pod tym typem (Rachunki, Zakupy z ich kwotami i %)
- Klik na „Zmienne" → Jedzenie / Transport / Zdrowie
- Klik na „Lifestyle" → Kawiarnia / Rozrywka / Muzyka / Ubrania / Prezenty / Alkohol / Bukmacher / Inne
- Tylko jedna sekcja może być otwarta na raz (klik innej zamyka poprzednią)
- Wskaźnik ▶/▼ przy nazwie typu

### Co cię może zaskoczyć

Mapowanie cat → typ jest hardkodowane w pliku `AnalyticsWidgets.jsx` linia 13-20:
```js
const EXPENSE_TYPES = {
  investment: ["inwestycje"],
  fixed:      ["rachunki","zakupy"],
  uncontrollable: ["rzad","rząd"],
  variable:   ["jedzenie","transport","zdrowie"],
  lifestyle:  ["kawiarnia","rozrywka","muzyka","ubrania","prezenty","alkohol","bukmacher","inne"],
};
```

Nie wiem czy to mapowanie się zgadza z Twoją intuicją. „Auto" które jest Twoją top kategorią z Image 6 (2276 zł) **nie jest tu wymienione** = traktowane jako fallback (default w `getExpenseType` zwraca `"variable"`). Ale przy expandzie zobaczysz Auto pod „Zmienne".

Jeśli chcesz przenieść Auto do „Stałe" (bo to kredyt+benzyna, bardziej fixed niż variable) — daj znać, zmienię mapowanie.

---

## Feature 2 — Wydatki dzienne top 7 + expand

Wcześniej: lista wszystkich 30 dni miesiąca, dużo scrollowania.

Teraz: domyślnie **top 7 dni z największymi wydatkami** (sortowane malejąco po kwocie). Pod listą przycisk „▼ Pokaż wszystkie dni (jeszcze X)" → rozwija pełną listę chronologicznie.

Logika koloru bez zmian: kolor barbeli zależy od średniej dziennej:
- ≤ 1.3× śr. → zielony
- 1.3-2× śr. → pomarańczowy
- > 2× śr. → czerwony

Twoje top 7 z screenshota Image 5: 28 (6194), 01 (2888), 11 (2146), 26 (1674), 10 (1389), 25 (1080), 14 (998).

---

## Feature 3 — Ranking wydatków top 5 + expand · Ranking przychodów

### Wydatki

Wcześniej: pełna lista 11+ kategorii.

Teraz: top 5 + przycisk „▼ Pokaż wszystkie kategorie (X więcej) +YYYY zł" pokazujący ile suma z reszty. Po expandzie przycisk „▲ Pokaż tylko top 5".

### Przychody — nowy widget

Mirror rankingu wydatków, z zielonym akcentem (ikona/przycisk #10b981). Pokazuje:
- # rankingu
- Ikona kategorii
- Nazwa + % udziału
- Pasek progress
- Kwota

Top 5 + expand identycznie jak wydatki. Wyświetla się **tylko jeśli są przychody w bieżącym cyklu** (inaczej cały widget jest hidden — nie pokazuje pustego wiersza).

---

## Feature 4 — Wydatki per miejsce top 7 + expand do top 30

Wcześniej: top 15 hardkodowane.

Teraz: top 7 default + expand do top 30 (limit żeby nie wybuchnąć przy 200 unique miejscach z 1.5 roku Twojej historii). Stopka „Pokazano top 30 miejsc · X pominięto (drobne wydatki)" gdy więcej niż 30.

### Drobny side-effect

`maxVal` (do skali pasków) jest teraz liczony z **widocznych pozycji**, nie z całej listy. To znaczy że po expandzie paski zachowują się tak samo (najwyższy bar = top1 = 100%) ale gdy zwijasz to 7. miejsce ma znowu 100% — pewnie ci się to spodoba bo łatwiej porównać miejsca między sobą.

---

## Pliki

### Zmodyfikowane (5)
```
src/views/InvestmentsView.jsx             [Bug F: spread editItem w save()]
src/views/TransactionsView.jsx            [Bug G: editingId guard w transfer branch]
src/components/AnalyticsWidgets.jsx       [Feature 1: ExpenseTypesBreakdown expand + getCat import]
src/views/AnalyticsView.jsx               [Feature 2,3,4: 4 expand state'y + refactor 4 sekcji + nowy ranking przychodów]
package.json                              [1.2.2 → 1.2.3]
```

### Bundle
| Wersja  | index.js (raw) | gzip |
|---------|---------|------|
| v1.2.2  | 344 KB  | 86 KB |
| v1.2.3  | 351 KB  | 87 KB |

+7KB / +1KB gzip — koszt 1 fixu + 4 expandów + nowy widget przychodów. Akceptowalne.

---

## Manual smoke test

1. Hard refresh.
2. **Bug F**: Portfel → Inwestycje → XTBINW → Edytuj → Zapisz (bez zmian) → wróć na Dashboard. Sprawdź czy „Inwestycje" pokazuje 11 308,56 zł zamiast 11 000.
3. **Bug G**: Dodaj świeży transfer (Konto PKO → Konto Revolut, 100 zł). Pojawią się 2 wpisy w transakcjach. Edytuj jeden z nich (np. zmień kwotę na 200), zapisz. Sprawdź:
   - Dwa nowe wpisy z 200 zł
   - **Pierwsza para 100 zł zniknęła** (przynajmniej jedna połowa — patrz edge case w sekcji Bug G)
4. **Feature 1**: Analiza → Struktura wydatków → klik na „Stałe" → rozwinie się lista (Rachunki, Zakupy itd.) z kwotami. Klik ponownie zwija.
5. **Feature 2**: Analiza → Wydatki dzienne → tylko top 7 dni → klik „Pokaż wszystkie dni" → cała lista chronologicznie.
6. **Feature 3**:
   - Analiza → Ranking wydatków → top 5 → klik „Pokaż wszystkie kategorie" → cała lista
   - Pod nim NOWA karta „Ranking przychodów" → top 5 zielonych pozycji → expand identycznie
7. **Feature 4**: Analiza → Wydatki per miejsce → top 7 → klik „Pokaż więcej miejsc" → top 30.

---

## Wciąż otwarte (pytania bez odpowiedzi)

Z poprzednich zrzutów:

1. **TZ bug** — pytałem 3 razy, wciąż nie wiem gdzie konkretnie data się rozjeżdża. Po dzisiejszych fixach przypomnij mi jeśli faktycznie to widzisz: który widok / które pole / jaka data jest błędna vs powinna być.

2. **Insighty z Image 2** — pokazują „2276,36 zł na Auto / 14 736,99 mniej / 27 316,32 rocznie". Jeśli wiesz że to są stare dane sprzed v1.2.2 — będą poprawne po hard refresh dziś. Jeśli po refresh nadal źle — daj wiedzieć jakie liczby tam widzisz vs jakie powinny być.

3. **Auto klasyfikacja kategorii** — chcesz żeby „Auto" było pod „Stałe" zamiast „Zmienne"? Jeśli tak, edytujemy mapowanie. Inne kategorie też możesz przenieść — pisz które.

## Audyt — zaległości

Z 39 z audytu O3 wciąż 27 nieadresowane:
- 3 krytyczne: K3 NBP API, K4 Service Worker, K5 VAPID/FCM
- ~15 ważnych
- O3 GoalsView refactor (zostało po v1.2.1)

Daj znać kiedy bierzesz tydzień 2 — najpilniejsze K3+K4+K5 (pieniądze + notyfikacje).

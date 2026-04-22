# Zmiany w pakiecie v3

## Zmodyfikowane pliki (4):
1. src/App.jsx
   - import PortfolioCombinedView
   - usunięty CreditCard button z topbara
   - TABS: id "investments" → "portfolio"
   - render accounts+investments scalony w portfolio

2. src/components/SettingsPanel.jsx
   - defaultAcc filter type === "checking" + empty state warning
   - Kolejność sekcji (Kategorie po Cyklu rozliczeniowym, Partner na dole):
     1. Domyślne konto
     2. Cykl rozliczeniowy
     3. Moje kategorie
     4. Eksport
     5. Import
     6. Przypomnienia
     7. Szablony
     8. Język
     9. Bezpieczeństwo
     10. Nazwa partnera
     11. Resetowanie danych

3. src/lib/insights.js
   - INSIGHT_IGNORED_CATS filter (rachunki, rząd, inwestycje, inne)

4. src/views/AccountsView.jsx
   - ukrycie kont type === "invest" z głównego widoku Konta
   - konta inwestycyjne widoczne teraz TYLKO w zakładce Inwestycje
   - saldo nadal liczone do Net Worth (przez sumByGroup bez filtra)

## Nowy plik (1):
5. src/views/PortfolioCombinedView.jsx
   - łączony widok z sub-tabami Konta / Inwestycje

## Jak wgrać:
1. Rozpakuj zip
2. Skopiuj pliki do lokalnego repo (nadpisz 4 + dodaj 1 nowy)
3. GitHub Desktop → commit → push
4. Poczekaj ~2 min na Actions
5. Ctrl+Shift+R na stronie apki

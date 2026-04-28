# License keys — model i workflow

## Model bezpieczeństwa (current — pre-launch)

Klucze są walidowane **w kliencie** za pomocą HMAC-SHA256 z hardcodowanym SECRETem.
Plus każda aktywacja jest "lockowana" w Firestore — drugi user próbujący ten sam
klucz dostanie odmowę.

### Co to chroni:
- ✅ Naiwny atak "wpisz `FT-Y-aaaaaaaa` i masz PRO" — nie zadziała, klucz nie ma
  poprawnego HMAC tagu.
- ✅ Dystrybucja jednego kupionego klucza między ludźmi — pierwszy uid który
  zaktywuje, blokuje klucz dla siebie. Drugi dostaje "klucz już użyty".
- ✅ Przypadkowe pomyłki przy wpisywaniu — alfabet base32 bez 0/O/1/I/L.

### Czego nie chroni:
- ❌ Determinowany atakujący który zrobi reverse-engineering bundle'a JS, wyciągnie
  SECRET, użyje skryptu `generate-license-keys.mjs` żeby zrobić sobie własny klucz.
  To jest podwyższenie progu, nie hard security. Docelowo: HMAC w Cloud Function,
  klient tylko forwarduje request.
- ❌ User klonujący swoją instalację (eksport JSON → import na innym urządzeniu)
  zachowa PRO bez aktywacji. Stan PRO jest w localStorage `ft_pro_status`,
  nie zsync'owany do Firestore. To jest świadome — własna kopia powinna
  działać bez internetu.

## Workflow uruchomienia sprzedaży

### Krok 1. Wygeneruj batch kluczy

```bash
# Zakładamy 100 kluczy yearly + 100 lifetime do startu
node scripts/generate-license-keys.mjs yearly 100 > keys-yearly-2026-04.txt
node scripts/generate-license-keys.mjs lifetime 100 > keys-lifetime-2026-04.txt
```

### Krok 2. Wgraj do Gumroad

W panelu produktu Gumroad:
1. Edit product → Settings → Content
2. Włącz "License keys" → wklej zawartość pliku (jeden klucz na linię)
3. Każdy kupujący otrzyma jeden unikalny klucz mailem od Gumroad

### Krok 3. Po wyczerpaniu batch'a

Uruchom skrypt ponownie. Stare i nowe klucze koegzystują (Firestore lock per
klucz, nie per batch).

## Zmiana SECRET (rotacja)

**Nie rób tego lekko** — zmiana SECRET unieważnia wszystkie wcześniej wydane klucze.
Userzy z aktywowanym PRO dalej mają PRO (stan w localStorage), ale gdyby zresetowali
przeglądarkę i chcieli ponownie wpisać klucz — nie zadziała.

Jeśli musisz rotować (np. wyciek SECRETU):
1. Zmień SECRET w `src/lib/license.js` ORAZ `scripts/generate-license-keys.mjs`
2. Wygeneruj nowy batch
3. Komunikat do zaktywowanych userów: "wprowadź klucz ponownie - oto nowy".
   Mail z Gumroad „resend license key" rozwiąże większość przypadków.
4. Stare niezużyte klucze z Gumroad — usuń.

## Przyszłość: migracja na Cloud Function

Gdy będzie ruch większy niż 50/mies, warto przenieść walidację do backendu:
1. Cloud Function `validateLicense({key, uid})` która ma SECRET w env vars.
2. Cloud Function `gumroadWebhook` która generuje klucz na żądanie i zwraca go
   do Gumroad (Gumroad supportuje "webhook URL for license generation").
3. Klient wywołuje tylko endpoint, nie ma SECRETU lokalnie.

To jest 4–8h pracy, niepilne dopóki sprzedaż jest niska.

## Format klucza

```
FT-{TYPE}-{XXXXX}-{XXXXX}-{TAG}
   │      │       │       │
   │      │       │       └── 4-char HMAC tag (signature)
   │      │       └────────── 5-char base32 random
   │      └────────────────── 5-char base32 random
   └─────────────────────────  Y=yearly | L=lifetime | T=trial
```

Łącznie: `FT-T-XXXXX-XXXXX-TTTT` = 22 znaki widoczne (bez myślników: 18).

Przykład: `FT-Y-K7P3N-W5A2B-Q8F4`

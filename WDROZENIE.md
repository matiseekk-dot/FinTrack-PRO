# FinTrack PRO - Checklista wdrożenia

## ⚠️ KRYTYCZNE zanim wgrasz na produkcję

### 1. Firebase Security Rules
Jeśli ich nie masz ustawionych, **każdy zalogowany user widzi cudze dane**.

1. Zaloguj się na https://console.firebase.google.com
2. Wybierz projekt `fintrack-pl-ddf27`
3. Firestore Database → Rules → wklej zawartość `firestore.rules` z tego repo
4. Kliknij "Publish"

### 2. Szyfrowanie localStorage - działa dla nowych userów
Stare dane userów się **automatycznie zdeszyfrują przy pierwszym odczycie**, potem zapiszą szyfrowane.
Jeden-raz cold read może być wolniejszy (~50-100ms).

### 3. Gumroad produkty

Zanim opublikujesz - **utwórz 2 produkty na Gumroad**:

- `skudev.gumroad.com/l/fintrack-pro-yearly` - 99 zł/rok (subskrypcja)
- `skudev.gumroad.com/l/fintrack-pro-lifetime` - 199 zł (one-time, limit 100)

URLe są hardkoded w `UpgradeModal.jsx` - zmień jeśli używasz innych.

### 4. System kluczy licencji

Obecny flow: user kupuje na Gumroad → dostaje email z kluczem → wkleja w apce → aktywuje.

Prefix klucza musi być:
- `FT-Y-xxxxx-xxxxx` dla rocznej (yearly)
- `FT-L-xxxxx-xxxxx` dla lifetime
- `FT-T-xxxxx-xxxxx` dla trial

W panelu Gumroad: Settings → License keys → Custom format → `FT-Y-XXXXX-XXXXX`

## 🔒 Bezpieczeństwo

Zaimplementowane:
- [x] Szyfrowanie localStorage (AES-GCM 256-bit + PBKDF2 100k iteracji)
- [x] Firebase security rules (users isolation)
- [x] Rate limiting client-side (60 tx/min)
- [x] Error tracking lokalny + w UI
- [x] ErrorBoundary na każdym widoku

Jeszcze NIE zaimplementowane:
- [ ] Firebase App Check (ochrona przed atakami na quota)
- [ ] 2FA (dla PRO userów)
- [ ] SOC 2 certification (fantazja na start)

## 📊 Monetyzacja

Tier system:
- **Free**: 50 tx/mies, 2 konta, 1 budżet, 1 cel, BEZ importu, BEZ sync
- **PRO Yearly**: 99 zł/rok - wszystko bez limitów
- **PRO Lifetime**: 199 zł (early bird, limit 100 osób) - wszystko bez limitów

Paywall triggers:
- Banner w TransactionsView od 30 tx (warning żółty)
- Urgent banner od 45 tx (czerwony)
- Full block przy 50 tx + modal Upgrade
- PRO card w Ustawieniach (upgrade CTA lub status)
- Upgrade modal otwiera się z wielu miejsc

## 🚀 Skalowanie

Realne możliwości apki:
- **0-1000 userów**: brak problemów
- **1000-10 000 userów**: OK, Firebase ~$25-50/msc
- **10k-100k userów**: wymaga optymalizacji (pagination, cold storage)
- **>100k**: wymaga przepisania architektury + zespół

Zaimplementowane dla realnej skali:
- Real-time Firebase sync z conflict resolution (onSnapshot + merge)
- Storage warning + auto-archive gdy > 4500 tx (1MB limit)
- Memoized filtering w TransactionsView i Dashboard
- Lazy-load XLSX (137KB gzipped oszczędność)
- Error reporting + feedback button

## 🧪 Test przed wdrożeniem

Uruchom lokalnie:
```bash
npm install
npm run dev
```

Przetestuj te ścieżki w DevTools:
1. ✅ Nowy user - pusty localStorage → widzi onboarding (8 slidów) → EmptyStateSetup (wybór banku) → Dashboard
2. ✅ Dodanie transakcji - sprawdź w localStorage czy `fintrack_v1` zaczyna się `enc:v1:`
3. ✅ Paywall - po 30 tx widać żółty banner, po 50 blockuje dodawanie
4. ✅ Settings → PRO card widoczna lub status (jeśli aktywowane)
5. ✅ Feedback button w prawym dolnym rogu → otwiera mailto
6. ✅ "Mam klucz licencji" w Upgrade modal → wklej "FT-L-TEST-1234" → aktywuje lifetime
7. ✅ Logowanie Google - sprawdź czy dane się zsynchronizowały do Firestore
8. ✅ Otwórz z drugiego urządzenia - sprawdź czy onSnapshot przynosi zmiany

## 📁 Struktura kluczowych plików

### Biblioteki (src/lib/)
- `tier.js` - Free vs PRO logika
- `crypto.js` - szyfrowanie localStorage
- `insights.js` - generator insightów Dashboard
- `errorTracking.js` - raportowanie błędów
- `rateLimit.js` - rate limit client-side
- `archive.js` - archiwizacja starych tx

### Komponenty (src/components/)
- `UpgradeModal.jsx` - paywall modal z 2 planami
- `EmptyStateSetup.jsx` - wymuszony setup nowego usera
- `InsightsCard.jsx` - insighty na Dashboard
- `StorageWarning.jsx` - warning dla power userów
- `FeedbackButton.jsx` - "Zgłoś problem" w apce
- `ErrorBoundary.jsx` - łapie React crashe

### Hooki (src/hooks/)
- `useFirebase.js` - auth + sync + real-time
- `useStreak.js` - streak counter z auto-repair

## 📝 Do zrobienia ręcznie

- [ ] Wdrożyć `firestore.rules` w Firebase Console
- [ ] Utworzyć produkty w Gumroad (2 plany)
- [ ] Zarejestrować się na GoatCounter (zmień `fintrackpro` w index.html na swój kod)
- [ ] Kupić domenę (preferowane `.com` dla przyszłej ekspansji)
- [ ] Zgłosić DAZ do ING (blocker prawny)

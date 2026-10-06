import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  PlusCircle, X, Settings, RefreshCw, Cloud, CloudOff
} from "lucide-react";
import { FontLoader } from "./components/FontLoader.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { SidegigSetup } from "./components/SidegigSetup.jsx";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { TransactionsView } from "./views/TransactionsView.jsx";
import { InvestmentsView } from "./views/InvestmentsView.jsx";
import { TripsView } from "./views/TripsView.jsx";
import { SidegigHome } from "./views/SidegigHome.jsx";
import { MoreView } from "./views/MoreView.jsx";
import { BettingView } from "./views/BettingView.jsx";
import { ResellingView } from "./views/ResellingView.jsx";
import { sanitizeItems } from "./lib/reselling.js";
import { CollectionsView } from "./views/CollectionsView.jsx";
import { FreelanceView } from "./views/FreelanceView.jsx";
import { HobbyCostsView } from "./views/HobbyCostsView.jsx";
import { sanitizeSubscriptions } from "./lib/subscriptions.js";
import { sanitizeCollectionItems } from "./lib/collections.js";
import { sanitizeGigs } from "./lib/freelance.js";
import { saveToStorage, loadFromStorage } from "./data/storage.js";
import { todayLocal, getCurrentCycleMonth } from "./utils.js";
import { INITIAL_ACCOUNTS, INITIAL_TRANSACTIONS, INITIAL_BUDGETS, INITIAL_PAYMENTS, INITIAL_PAID, INITIAL_GOALS, getAllCats } from "./constants.js";
import { useFirebase } from "./hooks/useFirebase.js";
import { PinScreen, PIN_ENABLED_KEY } from "./components/PinLock.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { FeedbackButton } from "./components/FeedbackButton.jsx";
import { getProStatusRaw, setProStatusFromRemote } from "./lib/tier.js";
import { getDisplayCurrency, setDisplayCurrency, guessCurrency } from "./lib/fx.js";
import { sanitizeModules, inferEnabledModules } from "./lib/modules.js";
import { t, getLang } from "./i18n.js";
import { getNavTabs, setNavTabs, navItem } from "./lib/nav.js";
import { initNative, setAppShortcuts } from "./lib/native.js";
import { sanitizePrefs, withPref } from "./lib/prefs.js";
import { closeTopOverlay } from "./lib/backButton.js";

function applyData(d, s) {
  if (!d) return;
  if (Array.isArray(d.accounts))                               s.setAccounts(d.accounts);
  if (Array.isArray(d.transactions) && d.transactions.length)  s.setTransactions(d.transactions);
  if (Array.isArray(d.budgets)      && d.budgets.length)       s.setBudgets(d.budgets);
  if (Array.isArray(d.payments))                               s.setPayments(d.payments);
  if (d.paid && typeof d.paid === "object")                    s.setPaid(d.paid);
  if (Array.isArray(d.goals))                                  s.setGoals(d.goals);
  if (Array.isArray(d.trips))                                  s.setTrips(d.trips);
  if (Array.isArray(d.hobbies))                                s.setHobbies(d.hobbies);
  if (Array.isArray(d.resaleItems) && s.setResaleItems)        s.setResaleItems(sanitizeItems(d.resaleItems));
  if (Array.isArray(d.collectionItems) && s.setCollectionItems) s.setCollectionItems(sanitizeCollectionItems(d.collectionItems));
  if (Array.isArray(d.gigs) && s.setGigs)                      s.setGigs(sanitizeGigs(d.gigs));
  if (Array.isArray(d.subscriptions) && s.setSubscriptions)    s.setSubscriptions(sanitizeSubscriptions(d.subscriptions));
  if (Array.isArray(d.customCats))                             s.setCustomCats(d.customCats.map(c => ({ ...c, label: c.label ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : c.label })));
  if (d.defaultAcc != null)                                    s.setDefaultAcc(d.defaultAcc);
  // v1.2.4: NIE nadpisujemy month z remote/storage — auto-snap useEffect
  // w App.jsx ustawi month na bieżący cykl rozliczeniowy. Jeśli applyData
  // by nadpisała month, Bug A wracałby przy każdym Firestore sync.
  // Wyjątek: gdy user nawigował manualnie, jego wybór jest preserved przez ref.
  // (Skip d.month całkowicie - `month` jest UI state, nie persisted reliably.)
  if (d.cycleDay != null && d.cycleDay >= 1 && d.cycleDay <= 28) s.setCycleDay(d.cycleDay);
  if (Array.isArray(d.cycleDayHistory) && d.cycleDayHistory.length > 0) {
    s.setCycleDayHistory(d.cycleDayHistory);
  } else if (d.cycleDay != null && d.cycleDay > 1) {
    // Migracja: stary cycleDay bez historii → twórz initial entry
    // "from: 1970-01-01" = obowiązuje dla całej dotychczasowej historii.
    // Userzy którzy chcą inaczej mogą edytować w Settings.
    s.setCycleDayHistory([{ from: "1970-01-01", day: d.cycleDay }]);
  }
  if (d.partnerName)                                           s.setPartnerName(d.partnerName);
  if (Array.isArray(d.portfolio)) {
    // v1.2.4: heuristic recovery dla Bug F (linkedAccId zgubiony przy edycji w v1.2.2-).
    // Jeśli portfolio item nie ma linkedAccId, ale jego nazwa pasuje do invest acc,
    // próbuj odtworzyć link. Bez tego Dashboard fallback do frozen acc.balance.
    const accs = Array.isArray(d.accounts) ? d.accounts : [];
    const investAccs = accs.filter(a => a && a.type === "invest");
    const recovered = d.portfolio.map(p => {
      if (!p || p.linkedAccId != null) return p;
      const matchByName = investAccs.find(a =>
        (p.name || "").toLowerCase().includes((a.name || "").toLowerCase().split(" ")[0]) ||
        (p.ticker || "").toLowerCase().includes((a.name || "").toLowerCase().split(" ")[0])
      );
      if (matchByName) return { ...p, linkedAccId: matchByName.id };
      return p;
    });
    s.setPortfolio(recovered);
  }
  if (Array.isArray(d.vacationArchiveData))                    s.setVacationArchive(d.vacationArchiveData);
  if (d.tombstones && typeof d.tombstones === "object")        s.setTombstones(d.tombstones);
  // v1.2.7: status PRO z dawnej płatnej wersji — od 2.6.0 apka jest w całości darmowa,
  // ale zachowujemy zapis (sync + kopia), żeby nic z danych użytkownika nie przepadło.
  if (d.proStatus && typeof d.proStatus === "object" && d.proStatus.type) {
    setProStatusFromRemote(d.proStatus);
  }
  // v1.5.1: display currency syncuje się między urządzeniami. Source of truth = localStorage,
  // sync przez SYNC_KEYS jako pole stateRef.current.displayCurrency.
  // Tylko valid kody (3-letter upper-case) — ochrona przed wstrzykniętą wartością z remote.
  if (typeof d.displayCurrency === "string" && /^[A-Z]{3}$/.test(d.displayCurrency)) {
    const current = getDisplayCurrency();
    if (current !== d.displayCurrency) {
      setDisplayCurrency(d.displayCurrency);
      // Brak forced reload — komponenty będą rerenderować się naturalnie po sync
      // (display currency jest re-czytane sync przy każdym fmtDisplay)
    }
  }
  // v2.7.0: cel miesięczny, limit strat — nowszy zapis (updatedAt) wygrywa
  if (d.prefs && typeof d.prefs === "object" && s.setPrefs) {
    const incoming = sanitizePrefs(d.prefs);
    s.setPrefs(prev => (incoming.updatedAt || 0) >= ((prev && prev.updatedAt) || 0) ? incoming : prev);
  }
  // v2.0.0 Sidegig: włączone moduły. null = setup Sidegig jeszcze nie przeprowadzony.
  const mods = sanitizeModules(d.modules);
  if (mods && s.setModules) s.setModules(mods);
  if (d.templates) try { localStorage.setItem("ft_templates", JSON.stringify(d.templates)); } catch(_) {}
  if (d.vacation)  try { localStorage.setItem("ft_vacation",  JSON.stringify(d.vacation));  } catch(_) {}
}

// Moduły z własnym ekranem; pozostałe otwierają przefiltrowane Wpisy
const MODULE_SCREENS = ["betting", "reselling", "collections", "freelance", "hobby", "trips"];

export default function App() {
  const { user, authLoading, syncing, syncError, signInGoogle, signOutUser, loadFromFirestore, saveToFirestore, subscribeToUpdates, mergeSnapshots } = useFirebase();

  const [tab,          setTab]          = useState("home");
  // Sidegig: włączone moduły (null = setup jeszcze nie zrobiony → onboarding Sidegig)
  const [modules,      setModules]      = useState(null);
  // true gdy Firestore load się zakończył (albo nie ma czego ładować) — onboarding czeka na to,
  // żeby drugie urządzenie nie pokazało setupu zanim przyjdą moduły z chmury.
  const [remoteChecked, setRemoteChecked] = useState(false);
  // Filtr modułu w zakładce Ledger (ustawiany kliknięciem wiersza na Home)
  const [ledgerModule, setLedgerModule] = useState("all");
  // Ponowne otwarcie setupu z Więcej → Moduły
  const [setupOpen,    setSetupOpen]    = useState(false);
  // Widoki modułów (Zakłady, Sprzedaż): przycisk + z paska i edycja otwierana z Wpisów
  const [moduleAddSignal, setModuleAddSignal] = useState(0);
  const [focusBetTx,   setFocusBetTx]   = useState(null);
  const [focusResaleItem, setFocusResaleItem] = useState(null);
  const [focusCollectionItem, setFocusCollectionItem] = useState(null);
  const [focusGig,     setFocusGig]     = useState(null);
  const [focusTrip,    setFocusTrip]    = useState(null);
  // Szybkie dodawanie wydatku do konkretnego wyjazdu (z ekranu Wyjazdów)
  const [quickAddTrip, setQuickAddTrip] = useState(null);
  const [onboarded,    setOnboarded]    = useState(false);
  const [month,        setMonth]        = useState(new Date().getMonth());
  const [customCats,   setCustomCats]   = useState([]);
  const [vacationArchive, setVacationArchive] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("ft_vacations") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  });
  const [accounts,     setAccounts]     = useState(INITIAL_ACCOUNTS);
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [budgets,      setBudgets]      = useState(INITIAL_BUDGETS);
  const [payments,     setPayments]     = useState(INITIAL_PAYMENTS);
  const [paid,         setPaid]         = useState(INITIAL_PAID);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cycleDay,     setCycleDay]     = useState(1);
  const [cycleDayHistory, setCycleDayHistory] = useState([]);
  const [defaultAcc,   setDefaultAcc]   = useState(1);
  const [partnerName,  setPartnerName]  = useState("Partner");
  const [portfolio,    setPortfolio]    = useState([]);
  const [goals,        setGoals]        = useState(INITIAL_GOALS);
  const [trips,        setTrips]        = useState([]);
  const [hobbies,      setHobbies]      = useState([]);
  const [resaleItems,  setResaleItems]  = useState([]); // v2.1.0: przedmioty modułu Sprzedaż
  const [collectionItems, setCollectionItems] = useState([]); // v2.2.0: katalog Kolekcji
  const [gigs,         setGigs]         = useState([]); // v2.2.0: zlecenia Freelance
  const [prefs,        setPrefs]        = useState({}); // v2.7.0: cel miesięczny, limit strat
  const [subscriptions, setSubscriptions] = useState([]); // v2.8.0: subskrypcje (Hobby)
  // Szybkie dodawanie wpisu z gotowym modułem (np. „Jednorazowy wydatek” w Hobby)
  const [quickAddModule, setQuickAddModule] = useState(null);
  // Miesiąc oglądany na Starcie i w ekranach modułów ("YYYY-MM"); nie resetuje się przy zmianie ekranu
  const [viewMonth,    setViewMonth]    = useState(() => todayLocal().slice(0, 7));
  // Otwarcie „Przenieś stare wpisy” w Hobby (id kolekcji albo "all")
  const [hobbyMoveFor, setHobbyMoveFor] = useState(null);
  // Skrót z ikony aplikacji / ?add= w adresie: wykonujemy, gdy apka jest gotowa (po PIN-ie)
  const [pendingAction, setPendingAction] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("add") || null; } catch { return null; }
  });
  // ?add= zostaje odczytane raz — usuń je z adresu, żeby odświeżenie strony nie otwierało formularza ponownie
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).has("add")) window.history.replaceState(null, "", window.location.pathname); } catch { /* bez historii */ }
  }, []);
  // Ekran modułu otwarty skrótem startuje z otwartym formularzem dodawania
  const [addOnMount,   setAddOnMount]   = useState(false);
  // v1.2.4: tombstones blokują wskrzeszanie usuniętych elementów przy Firestore real-time sync.
  // Format: { [arrayKey]: { [id]: deletedAtMs } }. Auto-purge po 30 dniach (w mergeSnapshots).
  const [tombstones,   setTombstones]   = useState({});
  const [fabOpen,      setFabOpen]      = useState(false);
  // Zmiana skrótów na dolnym pasku (Więcej → Dolny pasek) — wymusza ponowny odczyt
  const [,             setNavVersion]   = useState(0);
  const [fabMenu,      setFabMenu]      = useState(false); // long press menu
  const fabPressTimer  = useRef(null);
  const [loaded,       setLoaded]       = useState(false);
  const [pinLocked,    setPinLocked]    = useState(() => localStorage.getItem(PIN_ENABLED_KEY) === "1");
  const [importErr,    setImportErr]    = useState("");
  const [syncOk,       setSyncOk]       = useState(false);
  // Zmiana waluty głównej: przerysuj widoki i zapisz od razu (lokalnie + chmura).
  // Wcześniej Ustawienia przeładowywały stronę, zanim nowa waluta trafiła do zapisu,
  // i po starcie stary snapshot przywracał poprzednią walutę.
  const [fxEpoch,      setFxEpoch]      = useState(0);
  useEffect(() => {
    const bump = () => setFxEpoch(n => n + 1);
    window.addEventListener("ft:display-currency-changed", bump);
    return () => window.removeEventListener("ft:display-currency-changed", bump);
  }, []);

  const allCategories = useMemo(() => getAllCats(customCats), [customCats]);
  // effectiveCycleDay: jeśli mamy historię, przekaż array (komponenty resolve'ują per miesiąc);
  // inaczej przekaż starą liczbę (backward compat dla nowych userów bez historii)
  const effectiveCycleDay = useMemo(() => {
    if (Array.isArray(cycleDayHistory) && cycleDayHistory.length > 0) {
      return cycleDayHistory;
    }
    return cycleDay;
  }, [cycleDay, cycleDayHistory]);
  const stateRef = useRef(null);
  const clearingRef = useRef(false); // blocks Firestore save during clearAllData
  const skipFirestoreLoad = useRef(false); // blocks Firestore load after onboarding choice
  const userNavigatedMonthRef = useRef(false); // gdy user kliknie strzałkę w Dashboard, blokuje auto-snap
  stateRef.current = {
    accounts, transactions, budgets, payments, paid, goals, month, cycleDay,
    cycleDayHistory,
    customCats, defaultAcc, partnerName, portfolio, vacationArchiveData: vacationArchive,
    trips, hobbies, resaleItems, collectionItems, gigs, prefs, subscriptions,
    tombstones,
    proStatus: getProStatusRaw(),       // v1.2.7: sync PRO status między urządzeniami
    displayCurrency: getDisplayCurrency(), // v1.5.1: sync waluty wyświetlania
    ...(modules ? { modules } : {}),       // v2.0.0: moduły Sidegig (pomijane dopóki nie wybrane)
    templates: (() => { try { return JSON.parse(localStorage.getItem("ft_templates") || "null"); } catch(_) { return null; } })(),
    vacation:  (() => { try { return JSON.parse(localStorage.getItem("ft_vacation")  || "null"); } catch(_) { return null; } })(),
  };

  const capLabel = (c) => ({ ...c, label: c.label ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : c.label });
  const setCustomCatsCap = (cats) => setCustomCats(Array.isArray(cats) ? cats.map(capLabel) : cats);

  // === TOMBSTONE WRAPPER ===
  // Auto-detekuje delete: jeśli ID było w prev a nie ma w newVal, dodaje tombstone.
  // Bez konieczności modyfikowania views - każde wywołanie setTransactions(t => t.filter(...))
  // automatycznie generuje tombstone dla brakujących IDs.
  const wrapWithTombstoneTracking = useCallback((arrayKey, originalSetter) => {
    return (newValOrFn) => {
      originalSetter(prev => {
        const newVal = typeof newValOrFn === "function" ? newValOrFn(prev) : newValOrFn;
        if (Array.isArray(prev) && Array.isArray(newVal)) {
          const newIds = new Set();
          newVal.forEach(x => { if (x && x.id != null) newIds.add(x.id); });
          const deletedIds = [];
          prev.forEach(x => {
            if (x && x.id != null && !newIds.has(x.id)) deletedIds.push(x.id);
          });
          if (deletedIds.length > 0) {
            const now = Date.now();
            setTombstones(t => {
              const updated = { ...t, [arrayKey]: { ...(t[arrayKey] || {}) } };
              deletedIds.forEach(id => { updated[arrayKey][id] = now; });
              return updated;
            });
          }
        }
        return newVal;
      });
    };
  }, []);

  // Wrapped setters dla wszystkich critical arrays (gdzie usuwanie jest możliwe).
  // Ważne: te wrappery zastępują oryginalne setters w propsach do views.
  const setTransactionsTracked = useMemo(() => wrapWithTombstoneTracking("transactions", setTransactions), [wrapWithTombstoneTracking]);
  const setAccountsTracked     = useMemo(() => wrapWithTombstoneTracking("accounts",     setAccounts),     [wrapWithTombstoneTracking]);
  const setPaymentsTracked     = useMemo(() => wrapWithTombstoneTracking("payments",     setPayments),     [wrapWithTombstoneTracking]);
  const setGoalsTracked        = useMemo(() => wrapWithTombstoneTracking("goals",        setGoals),        [wrapWithTombstoneTracking]);
  const setPortfolioTracked    = useMemo(() => wrapWithTombstoneTracking("portfolio",    setPortfolio),    [wrapWithTombstoneTracking]);
  const setTripsTracked        = useMemo(() => wrapWithTombstoneTracking("trips",        setTrips),        [wrapWithTombstoneTracking]);
  const setHobbiesTracked      = useMemo(() => wrapWithTombstoneTracking("hobbies",      setHobbies),      [wrapWithTombstoneTracking]);
  const setResaleItemsTracked  = useMemo(() => wrapWithTombstoneTracking("resaleItems",  setResaleItems),  [wrapWithTombstoneTracking]);
  const setCollectionItemsTracked = useMemo(() => wrapWithTombstoneTracking("collectionItems", setCollectionItems), [wrapWithTombstoneTracking]);
  const setGigsTracked         = useMemo(() => wrapWithTombstoneTracking("gigs",         setGigs),         [wrapWithTombstoneTracking]);
  const setSubscriptionsTracked = useMemo(() => wrapWithTombstoneTracking("subscriptions", setSubscriptions), [wrapWithTombstoneTracking]);

  // Wrapper setMonth: gdy user manualnie nawiguje (strzałki w Dashboard, etc.),
  // ustawiamy flag żeby auto-snap nie ingerował.
  const setMonthByUser = useCallback((newMonth) => {
    userNavigatedMonthRef.current = true;
    if (typeof newMonth === "function") {
      setMonth(prev => newMonth(prev));
    } else {
      setMonth(newMonth);
    }
  }, []);

  // setters object przekazywany do applyData.
  // applyData wywoływane jest z bulk import/load - WSZYSTKIE settery muszą być RAW
  // (bez tombstone tracking). Inaczej load z Firestore wygeneruje fałszywe tombstones
  // dla rekordów które są w lokalnym state ale nie w remote.
  const setters = {
    setAccounts, setTransactions, setBudgets, setPayments, setPaid, setGoals,
    setCustomCats: setCustomCatsCap, setDefaultAcc, setMonth, setCycleDay,
    setCycleDayHistory, setPartnerName, setPortfolio, setVacationArchive,
    setTrips, setHobbies, setResaleItems, setCollectionItems, setGigs, setTombstones, setModules, setPrefs, setSubscriptions,
  };

  // Auto-snap month do bieżącego cyklu rozliczeniowego po loadzie cycleDayHistory.
  // Bez tego, jeśli cycleDay > 1 i dziś >= cycleDay, Dashboard pokazuje stary cykl
  // (100% przekroczony, "0 dni do końca", limity 110% itd.).
  //
  // v1.2.6: snap odpala się TAKŻE gdy `month` przyjdzie zepsuty z wartości startowej
  // useState(new Date().getMonth()), co dla dni >= cycleDay daje stary kalendarzowy
  // miesiąc zamiast bieżącego cyklu rozliczeniowego.
  useEffect(() => {
    if (!loaded) return;
    if (userNavigatedMonthRef.current) return;
    const correctMonth = getCurrentCycleMonth(
      Array.isArray(cycleDayHistory) && cycleDayHistory.length > 0 ? cycleDayHistory : cycleDay
    );
    if (correctMonth !== month) {
      setMonth(correctMonth);
    }
  }, [loaded, cycleDay, cycleDayHistory, month]);

  // Load from localStorage on mount
  useEffect(() => {
    let cancelled = false;
    if (localStorage.getItem("ft_onboarded") === "1") setOnboarded(true);
    loadFromStorage().then(d => {
      if (cancelled) return;
      try { applyData(d, setters); } catch(e) { console.error("[FT] restore error", e); }
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Load from Firestore when user logs in
  useEffect(() => {
    if (!user || !loaded) return;
    if (skipFirestoreLoad.current) { setRemoteChecked(true); return; }
    let cancelled = false;
    loadFromFirestore(user.uid).then(d => {
      if (cancelled) return;
      setRemoteChecked(true);
      if (d) {
        applyData(d, setters);
        if (!onboarded && (d.transactions?.length > 0 || d.payments?.length > 0)) {
          localStorage.setItem("ft_onboarded", "1");
          setOnboarded(true);
        }
        // v1.2.14: forced save 5s po loadzie - migracja state dla userów którzy
        // mieli buggy v1.2.5-1.2.8 (encrypt RangeError → tx nie zapisane do Firestore,
        // proStatus nie syncowany). Po loadzie z naprawioną v1.2.13 crypto, czystej
        // klasyfikacji v1.2.10 itp. - wymuszamy zapis czystej wersji.
        // 5s żeby nie kolidować z normalnym save flow (debounce 1.5s); plus safety
        // check że mamy faktyczne dane do zapisania.
        setTimeout(() => {
          if (cancelled || !user) return;
          const s = stateRef.current;
          const hasData = (s?.transactions?.length || 0) > 0
                       || (s?.accounts?.length || 0) > 0
                       || (s?.payments?.length || 0) > 0;
          if (hasData) {
            saveToFirestore(user.uid, s);
          }
        }, 5000);
      }
    });
    return () => { cancelled = true; };
  }, [user, loaded]);

  // Real-time sync (dla userów z 2+ urządzeń)
  useEffect(() => {
    if (!user || !loaded) return;
    const unsub = subscribeToUpdates(user.uid, (remoteData) => {
      const merged = mergeSnapshots(stateRef.current, remoteData);
      applyData(merged, setters);
    });
    return () => { if (unsub) unsub(); };
  }, [user, loaded]);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveToStorage({ ...stateRef.current, customCats }), 500);
    return () => clearTimeout(t);
  }, [loaded, accounts, transactions, budgets, payments, paid, goals, month, cycleDay, cycleDayHistory, customCats, defaultAcc, portfolio, partnerName, trips, hobbies, resaleItems, collectionItems, gigs, prefs, subscriptions, tombstones, modules, fxEpoch]);

  // Save to Firestore
  useEffect(() => {
    // remoteChecked: nie zapisuj do chmury zanim dane z chmury się wczytają — inaczej
    // nowe urządzenie mogłoby nadpisać Firestore pustym stanem lokalnym.
    if (!loaded || !user || clearingRef.current || !remoteChecked) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (clearingRef.current || cancelled) return;
      saveToFirestore(user.uid, stateRef.current);
      // saveToFirestore jest debounced - nie czekamy na .then żeby uniknąć race
      setSyncOk(true); setTimeout(() => { if (!cancelled) setSyncOk(false); }, 2500);
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [loaded, user, remoteChecked, accounts, transactions, budgets, payments, paid, goals, month, cycleDay, cycleDayHistory, customCats, defaultAcc, portfolio, partnerName, trips, hobbies, resaleItems, collectionItems, gigs, prefs, subscriptions, tombstones, modules, fxEpoch]);

  useEffect(() => {
    localStorage.setItem("ft_vacations", JSON.stringify(vacationArchive));
  }, [vacationArchive]);

  // Zablokuj PIN po powrocie z tła
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const enabled = localStorage.getItem(PIN_ENABLED_KEY) === "1";
        if (enabled) setPinLocked(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Self-healing migration: capitalize labels + napraw zepsuty icon (po JSON roundtrip)
  useEffect(() => {
    if (!loaded || customCats.length === 0) return;

    // Sprawdź czy coś wymaga naprawy
    const needsLabelFix = customCats.some(c => c.label && c.label[0] !== c.label[0].toUpperCase());
    const needsIconFix  = customCats.some(c => {
      // Icon jest OK gdy: undefined, null lub function (React component)
      // Zepsuty: object (np. {displayName: "Wallet"} po JSON.stringify)
      return c.icon != null && typeof c.icon !== "function";
    });

    if (!needsLabelFix && !needsIconFix) return;

    const fixed = customCats.map(c => {
      const out = { ...c };
      // Kapitalizuj label
      if (out.label && out.label[0] !== out.label[0].toUpperCase()) {
        out.label = out.label.charAt(0).toUpperCase() + out.label.slice(1);
      }
      // Napraw icon
      if (out.icon != null && typeof out.icon !== "function") {
        // Zachowaj iconName dla ICON_MAP lookup, usuń zepsuty icon
        if (!out.iconName && out.icon && typeof out.icon === "object" && out.icon.displayName) {
          out.iconName = out.icon.displayName;
        }
        delete out.icon;
      }
      return out;
    });
    setCustomCats(fixed);
  }, [loaded]);

  const clearAllData = async () => {
    clearingRef.current = true; // block Firestore saves during clear
    // 1. Clear Firestore FIRST (before state changes trigger save)
    if (user) {
      try {
        const { doc, deleteDoc } = await import("firebase/firestore");
        const { db } = await import("./firebase.js");
        await deleteDoc(doc(db, "users", user.uid, "data", "main"));
      } catch(e) {
        console.error("[FT] Firestore clear error", e);
      }
    }
    // 2. Clear localStorage. Lista jest świadomie szeroka — po wipe nic nie powinno
    // zostać. Pre-v1.4 wipe pomijał PIN, PRO status, streak, FX cache itd.
    const KEYS_TO_WIPE = [
      "fintrack_v1",
      "ft_templates",
      "ft_vacation",
      "ft_vacations",
      "ft_pro_status",
      "ft_pin_hash", "ft_pin_hash_v2", "ft_pin_enabled", "ft_pin_lockout",
      "ft_streak", "ft_streak_longest",
      "ft_errors",
      "ft_fx_cache_v1", "ft_fx_hist_v1",       // v1.4.1 + v1.5.0: FX cache (current + historical)
      "ft_display_currency",                    // v1.5.0: display currency preference
      "ft_resale_fees",                         // v2.1.0: zapamiętane prowizje platform
      "ft_tax_reserve_pct",                     // v2.2.0: rezerwa na podatek (Freelance)
      "ft_notif_asked", "ft_notif_date",
      "ft_setup_done",
      // ft_device_id, ft_lang i ft_nav_tabs ZOSTAJĄ — to preferencje urządzenia, nie dane usera.
      // ft_onboarded ustawiamy na "1" zaraz potem.
    ];
    KEYS_TO_WIPE.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    localStorage.setItem("ft_onboarded", "1");
    // 3. Reset all React state to initial values
    setAccounts(INITIAL_ACCOUNTS);
    setTransactions(INITIAL_TRANSACTIONS);
    setBudgets(INITIAL_BUDGETS);
    setPayments(INITIAL_PAYMENTS);
    setPaid({});
    setGoals(INITIAL_GOALS);
    setTrips([]);
    setHobbies([]);
    setResaleItems([]);
    setCollectionItems([]);
    setGigs([]);
    setPrefs({});
    setSubscriptions([]);
    setCustomCats([]);
    setPortfolio([]);
    setPartnerName("Partner");
    setCycleDay(1);
    setDefaultAcc(1);
    setMonth(new Date().getMonth());
    setVacationArchive([]);
    // Allow saves again after a short delay (let state settle)
    setTimeout(() => { clearingRef.current = false; }, 2000);
  };

  // Android: Wstecz zamyka najpierw otwarte okno, potem wraca z ekranu na Start,
  // a na Starcie (i na blokadzie PIN) minimalizuje aplikację.
  const backRef = useRef(null);
  backRef.current = () => {
    if (pinLocked) return false;
    if (closeTopOverlay()) return true;
    if (fabMenu) { setFabMenu(false); return true; }
    if (setupOpen && modules) { setSetupOpen(false); return true; }
    if (tab !== "home") { setTab("home"); return true; }
    return false;
  };
  useEffect(() => { initNative({ onBack: () => backRef.current(), onShortcut: (id) => setPendingAction(id) }); }, []);

  useEffect(() => {
    if (!pendingAction || !loaded || !user || !modules || pinLocked || setupOpen) return;
    const action = pendingAction;
    setPendingAction(null);
    setSettingsOpen(false);
    if (MODULE_SCREENS.includes(action) && modules.includes(action)) {
      setAddOnMount(true);
      setModuleAddSignal(n => n + 1);
      setTab(action);
    } else {
      setTab("home");
      setQuickAddOpen(true);
    }
  }, [pendingAction, loaded, user, modules, pinLocked, setupOpen]);
  // Widok modułu przeczytał openAdd przy montowaniu (efekty dzieci biegną przed rodzicem)
  useEffect(() => { if (addOnMount) setAddOnMount(false); }, [addOnMount]);

  // Skróty po przytrzymaniu ikony: moduły z formularzem dodawania + zwykły wpis
  useEffect(() => {
    if (!modules) return;
    const items = [
      ["betting", t("shortcut.bet", "Dodaj kupon"), "ic_sc_bet"],
      ["reselling", t("shortcut.item", "Dodaj przedmiot"), "ic_sc_item"],
      ["freelance", t("shortcut.gig", "Dodaj zlecenie"), "ic_sc_gig"],
      ["collections", t("shortcut.collection", "Dodaj do kolekcji"), "ic_sc_coll"],
    ].filter(([id]) => modules.includes(id)).slice(0, 3)
      .map(([id, title, icon]) => ({ id, title, icon }));
    setAppShortcuts([...items, { id: "entry", title: t("shortcut.entry", "Nowy wpis"), icon: "ic_sc_entry" }]);
  }, [modules ? modules.join(",") : ""]);

  const setPref = (key, money) => setPrefs(p => withPref(p, key, money));

  const enabledModules = modules || [];
  // Pasek: Start + do 3 skrótów wybranych przez użytkownika (domyślnie jego moduły) + Więcej,
  // po obu stronach przycisku +. Edycja w Więcej podbija navVersion → render czyta wybór od nowa.
  const navTabs = getNavTabs(enabledModules);
  const TABS = ["home", ...navTabs, "more"].map(id => navItem(id));
  // Ekran spoza paska (np. moduł otwarty z Więcej) podświetla Więcej
  const activeTab = TABS.some(x => x.id === tab) ? tab : "more";
  const changeNavTabs = (ids) => { setNavTabs(ids); setNavVersion(v => v + 1); };
  const navSplit = Math.ceil(TABS.length / 2);
  const goTab = (id) => setTab(id);
  // Zakłady i Sprzedaż mają własne ekrany; pozostałe moduły to przefiltrowane Wpisy
  const openModule = (id) => {
    if (MODULE_SCREENS.includes(id)) { setTab(id); return; }
    if (id === "investments") { setTab("portfolio"); return; }
    if (id === "trips") { setTab("trips"); return; }
    setLedgerModule(id); setTab("transactions");
  };
  // Edycja wpisu kuponu/przedmiotu z Wpisów otwiera jego ekran modułu
  const openLinkedTx = (tx) => {
    if (tx.bet || tx.betTransfer) { setFocusBetTx(tx.id); setTab("betting"); }
    else if (tx.resaleItemId != null) { setFocusResaleItem(tx.resaleItemId); setTab("reselling"); }
    else if (tx.gigId != null) { setFocusGig(tx.gigId); setTab("freelance"); }
    else if (tx.collectionItemId != null) { setFocusCollectionItem(tx.collectionItemId); setTab("collections"); }
    else if (tx.subscriptionId != null) { setTab("hobby"); }
    else if (tx.tripSettle) { setFocusTrip(tx.tripId); setTab("trips"); }
  };
  const moduleScreen = MODULE_SCREENS.includes(tab);

  // Loading
  if (!loaded || authLoading || (user && modules === null && !remoteChecked)) return (
    <div style={{ background: "#060b14", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <FontLoader/>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#059669,#10b981)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 24 }}>
        S
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 22, color: "#e2e8f0" }}>Sidegig</div>
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "#475569" }}>{authLoading ? t("app.checkingAccount", "Sprawdzam konto…") : t("app.loadingData", "Wczytuję dane…")}</div>
    </div>
  );

  // Login
  if (!user) return <LoginScreen onSignIn={signInGoogle} loading={authLoading} syncError={syncError}/>;

  // Setup Sidegig — raz dla każdego (także dla użytkowników FinTrack po aktualizacji)
  // oraz ponownie z Więcej → Moduły. Użytkownik z danymi dostaje moduły zaznaczone
  // na podstawie tego, co już ma; nic nie jest usuwane.
  if (modules === null || setupOpen) {
    const hasData = transactions.length > 0 || hobbies.length > 0 || trips.length > 0;
    return (
      <SidegigSetup
        initialCurrency={hasData || modules !== null ? getDisplayCurrency() : guessCurrency()}
        initialModules={modules || inferEnabledModules({ transactions, hobbies, trips, portfolio, payments })}
        isReturningUser={modules === null && hasData}
        canCancel={modules !== null}
        onCancel={() => setSetupOpen(false)}
        onDone={({ currency, modules: mods }) => {
          setDisplayCurrency(currency);
          // Nowy użytkownik: konto startowe w walucie głównej i z nazwą w jego języku (saldo 0, brak wpisów).
          // migrateData nadaje kontom currency "PLN", więc "PLN" też traktujemy jako domyślne.
          if (!hasData) {
            setAccounts(prev => prev.map(a =>
              a.id === 1 && (!a.currency || a.currency === "PLN") && !a.balance ? { ...a, currency, name: t("acc.main", "Konto główne") } : a
            ));
          }
          setModules(mods);
          setSetupOpen(false);
          localStorage.setItem("ft_onboarded", "1");
          setOnboarded(true);
          setTab("home");
        }}
      />
    );
  }

  return (
    <>
    {pinLocked && (
      <PinScreen onSuccess={() => setPinLocked(false)} title={t("pin.unlock", "Wprowadź PIN aby odblokować")}/>
    )}
    {!pinLocked && <div id="app-root" style={{ fontFamily: "'Space Grotesk', sans-serif", background: "#060b14", color: "#e2e8f0", minHeight: "100dvh", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <FontLoader/>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "linear-gradient(180deg, #060b14 80%, transparent)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)", paddingLeft: 16, paddingRight: 16, paddingBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#059669,#10b981)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 15 }}>
            S
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Sidegig</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {syncing && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#0a1e3a", border: "1px solid #1e40af44", borderRadius: 8, padding: "4px 8px" }}>
              <RefreshCw size={10} color="#60a5fa" style={{ animation: "spin 1s linear infinite" }}/>
              <span title={t("app.syncing", "Synchronizuję…")} style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 74 }}>{t("app.syncing", "Synchronizuję…")}</span>
            </div>
          )}
          {syncOk && !syncing && !syncError && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#052e16", border: "1px solid #14532d", borderRadius: 8, padding: "4px 8px" }}>
              <Cloud size={10} color="#10b981"/>
              <span title={t("app.synced", "Zsync")} style={{ fontSize: 10, fontWeight: 700, color: "#10b981", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 74 }}>{t("app.synced", "Zsync")}</span>
            </div>
          )}
          {syncError && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#1a0808", border: "1px solid #7f1d1d44", borderRadius: 8, padding: "4px 8px" }}>
              <CloudOff size={10} color="#ef4444"/>
              <span title={t("app.syncError", "Błąd sync")} style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 74 }}>{t("app.syncError", "Błąd sync")}</span>
            </div>
          )}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                if (window.confirm(`${t("app.signOutConfirm", "Wylogować się z konta")} ${user.displayName || user.email}?`)) signOutUser();
              }}
              title={`Wyloguj: ${user.displayName || user.email}`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2,
                borderRadius: "50%", transition: "opacity 0.2s" }}
            >
              {user.photoURL
                ? <img src={user.photoURL} alt="" style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #10b981", display: "block" }}/>
                : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#059669,#10b981)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #10b981" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{(user.displayName || user.email || "U")[0].toUpperCase()}</span>
                  </div>
              }
            </button>
          </div>
          <Settings size={17} color="#475569" style={{ cursor: "pointer" }} onClick={() => setSettingsOpen(true)}/>
        </div>
      </div>

      {/* Pages — key: po zmianie waluty głównej widoki liczą sumy od nowa */}
      <div key={`fx${fxEpoch}`} style={{ paddingBottom: 100 }}>
        {tab === "home"         && <ErrorBoundary><SidegigHome transactions={transactions} hobbies={hobbies} trips={trips} portfolio={portfolio} gigs={gigs} resaleItems={resaleItems} collectionItems={collectionItems} modules={enabledModules}
            onOpenModule={openModule}
            onAddTx={() => setQuickAddOpen(true)}
            onOpenTrips={() => setTab("trips")}
            prefs={prefs} onPrefChange={setPref} subscriptions={subscriptions} month={viewMonth} onMonthChange={setViewMonth}
            onEnableModule={(id) => { setModules(prev => sanitizeModules([...(prev || []), id]) || prev); setTab(id); }}
            onManageModules={() => setSetupOpen(true)}/></ErrorBoundary>}
        {tab === "more"         && <ErrorBoundary><MoreView modules={enabledModules} navTabs={navTabs} onNavTabsChange={changeNavTabs} onNavigate={goTab} onOpenModule={openModule} onManageModules={() => setSetupOpen(true)} onOpenSettings={() => setSettingsOpen(true)}/></ErrorBoundary>}
        {tab === "betting"      && <ErrorBoundary><BettingView transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc} hobbies={hobbies} onBack={() => setTab("home")} addSignal={moduleAddSignal} openAdd={addOnMount} month={viewMonth} onMonthChange={setViewMonth} lossLimit={prefs.betLossLimit || null} onLossLimitChange={(m) => setPref("betLossLimit", m)} focusTxId={focusBetTx} onFocusHandled={() => setFocusBetTx(null)}/></ErrorBoundary>}
        {tab === "collections"  && <ErrorBoundary><CollectionsView hobbies={hobbies} setHobbies={setHobbiesTracked} items={collectionItems} setItems={setCollectionItemsTracked} resaleItems={resaleItems} setResaleItems={setResaleItemsTracked} transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc} allCats={allCategories} month={month} cycleDay={effectiveCycleDay} onBack={() => setTab("home")} onOpenResale={(id) => { setFocusResaleItem(id); setTab("reselling"); }} onMoveToHobby={(id) => { setModules(prev => (prev || []).includes("hobby") ? prev : (sanitizeModules([...(prev || []), "hobby"]) || prev)); setHobbyMoveFor(id); setTab("hobby"); }} addSignal={moduleAddSignal} openAdd={addOnMount} focusItemId={focusCollectionItem} onFocusHandled={() => setFocusCollectionItem(null)}/></ErrorBoundary>}
        {tab === "freelance"    && <ErrorBoundary><FreelanceView gigs={gigs} setGigs={setGigsTracked} transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc} hobbies={hobbies} onBack={() => setTab("home")} addSignal={moduleAddSignal} openAdd={addOnMount} month={viewMonth} onMonthChange={setViewMonth} focusGigId={focusGig} onFocusHandled={() => setFocusGig(null)}/></ErrorBoundary>}
        {tab === "reselling"    && <ErrorBoundary><ResellingView items={resaleItems} setItems={setResaleItemsTracked} collectionItems={collectionItems} setCollectionItems={setCollectionItemsTracked} transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc} hobbies={hobbies} onBack={() => setTab("home")} addSignal={moduleAddSignal} openAdd={addOnMount} month={viewMonth} onMonthChange={setViewMonth} focusItemId={focusResaleItem} onFocusHandled={() => setFocusResaleItem(null)}/></ErrorBoundary>}
          {tab === "hobby"        && <ErrorBoundary><HobbyCostsView transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc} hobbies={hobbies} modules={enabledModules} subscriptions={subscriptions} setSubscriptions={setSubscriptionsTracked} onBack={() => setTab("home")} onAddExpense={() => { setQuickAddModule("hobby"); setQuickAddOpen(true); }} addSignal={moduleAddSignal} openAdd={addOnMount} month={viewMonth} onMonthChange={setViewMonth} setHobbies={setHobbiesTracked} collectionItems={collectionItems} moveFor={hobbyMoveFor} onMoveHandled={() => setHobbyMoveFor(null)}/></ErrorBoundary>}
          {tab === "trips"        && <ErrorBoundary><TripsView trips={trips} setTrips={setTripsTracked} transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} defaultAcc={defaultAcc}
            onBack={() => setTab("home")} onAddExpense={(trip) => { setQuickAddModule("trips"); setQuickAddTrip(trip.id); setQuickAddOpen(true); }}
            addSignal={moduleAddSignal} openAdd={addOnMount} focusTripId={focusTrip} onFocusHandled={() => setFocusTrip(null)}/></ErrorBoundary>}
          {tab === "portfolio"    && <ErrorBoundary><InvestmentsView portfolio={portfolio} setPortfolio={setPortfolioTracked} onBack={() => setTab("home")}/></ErrorBoundary>}
          {tab === "transactions" && <ErrorBoundary><TransactionsView transactions={transactions} setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} allCats={allCategories} _forceOpenModal={fabOpen} _onModalClose={() => setFabOpen(false)} defaultAcc={defaultAcc} trips={trips} modules={enabledModules} hobbies={hobbies} moduleFilter={ledgerModule} onModuleFilterChange={setLedgerModule} onOpenLinked={openLinkedTx}/></ErrorBoundary>}
      </div>

      {importErr && (
        <div style={{ position: "absolute", top: 70, left: 12, right: 12, zIndex: 300, background: "#1a0808", border: "1px solid #7f1d1d", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>X</span>
          <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>{importErr}</span>
          <button onClick={() => setImportErr("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14}/></button>
        </div>
      )}

      <ErrorBoundary>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}
        accounts={accounts} transactions={transactions} budgets={budgets}
        payments={payments} paid={paid} goals={goals} customCats={customCats}
        setTransactions={setTransactionsTracked} setAccounts={setAccountsTracked} setBudgets={setBudgets}
        setPayments={setPaymentsTracked} setPaid={setPaid} setGoals={setGoalsTracked}
        cycleDay={cycleDay} setCycleDay={setCycleDay}
        cycleDayHistory={cycleDayHistory} setCycleDayHistory={setCycleDayHistory}
        setCustomCats={setCustomCatsCap}
        defaultAcc={defaultAcc} setDefaultAcc={setDefaultAcc}
        vacationArchive={vacationArchive} partnerName={partnerName}
        user={user} onSignOut={signOutUser} onClearData={clearAllData}
        trips={trips} hobbies={hobbies} portfolio={portfolio} resaleItems={resaleItems} collectionItems={collectionItems} gigs={gigs} modules={modules}
        onRestoreFull={(d) => applyData(d, setters)}
        prefs={prefs} subscriptions={subscriptions}
      />
      </ErrorBoundary>

      {fabMenu && <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, minHeight: "100dvh", zIndex: 99 }} onClick={() => setFabMenu(false)}/>}

      <FeedbackButton/>

      {quickAddOpen && (
        <TransactionsView
          transactions={transactions}
          setTransactions={(txs) => { setTransactionsTracked(txs); setQuickAddOpen(false); setQuickAddModule(null); setQuickAddTrip(null); }}
          setAccounts={setAccountsTracked} allCats={allCategories} presetModule={quickAddModule} presetTripId={quickAddTrip}
          _forceOpenModal={true}
          _onClose={() => { setQuickAddOpen(false); setQuickAddModule(null); setQuickAddTrip(null); }}
          _onModalClose={() => { setQuickAddOpen(false); setQuickAddModule(null); setQuickAddTrip(null); }}
          defaultAcc={defaultAcc}
          trips={trips}
          modules={enabledModules} hobbies={hobbies}
          onOpenLinked={(tx) => { setQuickAddOpen(false); openLinkedTx(tx); }}
        />
      )}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "linear-gradient(180deg, transparent 0%, #060b14 20%)", paddingTop: 20, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)", zIndex: 50 }}>
        <div style={{ display: "flex", background: "#0a1120", border: "1px solid #1a2744", borderRadius: 20, margin: "0 12px", padding: "5px 3px", alignItems: "center" }}>
          {TABS.slice(0, navSplit).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => goTab(id)} aria-current={active ? "page" : undefined} aria-label={label} style={{ flex: 1, minWidth: 0, background: active ? "#10b9811f" : "none", border: active ? "1px solid #10b98144" : "1px solid transparent", borderRadius: 13, padding: "7px 2px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.2s ease", position: "relative" }}>
                <Icon size={15} color={active ? "#34d399" : "#475569"}/>
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: label.length > 8 ? 7 : 8, fontWeight: 700, color: active ? "#34d399" : "#475569", textTransform: "uppercase", letterSpacing: label.length > 8 ? "0.02em" : "0.05em" }}>{label}</span>
              </button>
            );
          })}
          <button onClick={() => { if (moduleScreen) { setModuleAddSignal(n => n + 1); return; } setFabOpen(true); setTab("transactions"); }} aria-label={t("nav.add", "Dodaj")} style={{ flexShrink: 0, background: "linear-gradient(135deg,#059669,#10b981)", border: "2px solid #0a1120", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, boxShadow: "0 0 16px #10b98155", transition: "transform 0.12s ease", margin: "0 2px", borderRadius: 16, padding: "5px 8px", minWidth: 52 }}
            onPointerDown={e => e.currentTarget.style.transform = "scale(0.9)"}
            onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}>
            <PlusCircle size={15} color="white"/>
            <span style={{ fontSize: 8, fontWeight: 800, color: "white", letterSpacing: "0.03em", fontFamily: "'Space Grotesk', sans-serif" }}>{t("nav.add").toUpperCase()}</span>
          </button>
          {TABS.slice(navSplit).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => goTab(id)} aria-current={active ? "page" : undefined} aria-label={label} style={{ flex: 1, minWidth: 0, background: active ? "#10b9811f" : "none", border: active ? "1px solid #10b98144" : "1px solid transparent", borderRadius: 13, padding: "7px 2px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.2s ease", position: "relative" }}>
                <Icon size={15} color={active ? "#34d399" : "#475569"}/>
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: label.length > 8 ? 7 : 8, fontWeight: 700, color: active ? "#34d399" : "#475569", textTransform: "uppercase", letterSpacing: label.length > 8 ? "0.02em" : "0.05em" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>}
    </>
  );
}

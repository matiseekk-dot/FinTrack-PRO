import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Wallet, PlusCircle, X, Home, List, PiggyBank, BarChart2, Settings,
  CreditCard, Briefcase, Bell, CheckCircle2, RefreshCw, Cloud, CloudOff
} from "lucide-react";
import { FontLoader } from "./components/FontLoader.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { Onboarding } from "./components/Onboarding.jsx";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { Dashboard } from "./views/Dashboard.jsx";
import { AccountsView } from "./views/AccountsView.jsx";
import { TransactionsView } from "./views/TransactionsView.jsx";
import { InvestmentsView } from "./views/InvestmentsView.jsx";
import { GoalsView } from "./views/GoalsView.jsx";
import { PaymentsView } from "./views/PaymentsView.jsx";
import { AnalyticsView } from "./views/AnalyticsView.jsx";
import { saveToStorage, loadFromStorage, loadSnapshotFromJSON } from "./data/storage.js";
import { DEMO_TRANSACTIONS, DEMO_PAYMENTS, DEMO_ACCOUNTS } from "./data/demo.js";
import { INITIAL_ACCOUNTS, INITIAL_TRANSACTIONS, INITIAL_BUDGETS, INITIAL_PAYMENTS, INITIAL_PAID, INITIAL_GOALS, BASE_CATEGORIES } from "./constants.js";
import { useFirebase } from "./hooks/useFirebase.js";
import { useSessionTracker } from "./hooks/useSessionTracker.js";
import { RatingPrompt } from "./components/RatingPrompt.jsx";

function applyData(d, s) {
  if (!d) return;
  if (Array.isArray(d.accounts))                               s.setAccounts(d.accounts);
  if (Array.isArray(d.transactions) && d.transactions.length)  s.setTransactions(d.transactions);
  if (Array.isArray(d.budgets)      && d.budgets.length)       s.setBudgets(d.budgets);
  if (Array.isArray(d.payments))                               s.setPayments(d.payments);
  if (d.paid && typeof d.paid === "object")                    s.setPaid(d.paid);
  if (Array.isArray(d.goals))                                  s.setGoals(d.goals);
  if (Array.isArray(d.customCats))                             s.setCustomCats(d.customCats.map(c => ({ ...c, label: c.label ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : c.label })));
  if (d.defaultAcc != null)                                    s.setDefaultAcc(d.defaultAcc);
  if (d.month != null && d.month >= 0 && d.month <= 11)        s.setMonth(d.month);
  if (d.cycleDay != null && d.cycleDay >= 1 && d.cycleDay <= 28) s.setCycleDay(d.cycleDay);
  if (d.partnerName)                                           s.setPartnerName(d.partnerName);
  if (Array.isArray(d.portfolio))                              s.setPortfolio(d.portfolio);
  if (Array.isArray(d.vacationArchiveData))                    s.setVacationArchive(d.vacationArchiveData);
  if (d.templates) try { localStorage.setItem("ft_templates", JSON.stringify(d.templates)); } catch(_) {}
  if (d.vacation)  try { localStorage.setItem("ft_vacation",  JSON.stringify(d.vacation));  } catch(_) {}
}

export default function App() {
  const { user, authLoading, syncing, syncError, signInGoogle, signOutUser, loadFromFirestore, saveToFirestore } = useFirebase();
  const { showRatingPrompt, dismissRating } = useSessionTracker();

  const [tab,          setTab]          = useState("dashboard");
  const [onboarded,    setOnboarded]    = useState(false);
  const [month,        setMonth]        = useState(new Date().getMonth());
  const [customCats,   setCustomCats]   = useState([]);
  const [vacationArchive, setVacationArchive] = useState(() => JSON.parse(localStorage.getItem("ft_vacations") || "[]"));
  const [accounts,     setAccounts]     = useState(INITIAL_ACCOUNTS);
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [budgets,      setBudgets]      = useState(INITIAL_BUDGETS);
  const [payments,     setPayments]     = useState(INITIAL_PAYMENTS);
  const [paid,         setPaid]         = useState(INITIAL_PAID);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cycleDay,     setCycleDay]     = useState(1);
  const [defaultAcc,   setDefaultAcc]   = useState(1);
  const [partnerName,  setPartnerName]  = useState("Partner");
  const [portfolio,    setPortfolio]    = useState([]);
  const [goals,        setGoals]        = useState(INITIAL_GOALS);
  const [fabOpen,      setFabOpen]      = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [importErr,    setImportErr]    = useState("");
  const [syncOk,       setSyncOk]       = useState(false);

  const allCategories = useMemo(() => [...BASE_CATEGORIES, ...customCats], [customCats]);
  const stateRef = useRef(null);
  const clearingRef = useRef(false); // blocks Firestore save during clearAllData
  const skipFirestoreLoad = useRef(false); // blocks Firestore load after onboarding choice
  stateRef.current = {
    accounts, transactions, budgets, payments, paid, goals, month, cycleDay,
    customCats, defaultAcc, partnerName, portfolio, vacationArchiveData: vacationArchive,
    templates: (() => { try { return JSON.parse(localStorage.getItem("ft_templates") || "null"); } catch(_) { return null; } })(),
    vacation:  (() => { try { return JSON.parse(localStorage.getItem("ft_vacation")  || "null"); } catch(_) { return null; } })(),
  };

  const setters = { setAccounts, setTransactions, setBudgets, setPayments, setPaid, setGoals, setCustomCats, setDefaultAcc, setMonth, setCycleDay, setPartnerName, setPortfolio, setVacationArchive };

  // Load from localStorage on mount
  useEffect(() => {
    if (localStorage.getItem("ft_onboarded") === "1") setOnboarded(true);
    loadFromStorage().then(d => {
      try { applyData(d, setters); } catch(e) { console.error("[FT] restore error", e); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  // Load from Firestore when user logs in
  useEffect(() => {
    if (!user || !loaded) return;
    if (skipFirestoreLoad.current) return; // user just did onboarding — don't overwrite their choice
    loadFromFirestore(user.uid).then(d => {
      if (d) {
        applyData(d, setters);
        // If device is new (no ft_onboarded) but user has Firestore data → skip onboarding
        if (!onboarded && (d.transactions?.length > 0 || d.payments?.length > 0)) {
          localStorage.setItem("ft_onboarded", "1");
          setOnboarded(true);
        }
      }
    });
  }, [user, loaded]);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveToStorage({ ...stateRef.current, customCats }), 500);
    return () => clearTimeout(t);
  }, [loaded, accounts, transactions, budgets, payments, paid, goals, month, cycleDay, customCats, defaultAcc, portfolio, partnerName]);

  // Save to Firestore
  useEffect(() => {
    if (!loaded || !user || clearingRef.current) return;
    const t = setTimeout(() => {
      if (clearingRef.current) return;
      saveToFirestore(user.uid, stateRef.current).then(() => {
        setSyncOk(true); setTimeout(() => setSyncOk(false), 2500);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [loaded, user, accounts, transactions, budgets, payments, paid, goals, month, cycleDay, customCats, defaultAcc, portfolio, partnerName]);

  useEffect(() => {
    localStorage.setItem("ft_vacations", JSON.stringify(vacationArchive));
  }, [vacationArchive]);

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
    // 2. Clear localStorage
    localStorage.removeItem("fintrack_v1");
    localStorage.removeItem("ft_templates");
    localStorage.removeItem("ft_vacation");
    localStorage.removeItem("ft_vacations");
    localStorage.setItem("ft_onboarded", "1");
    // 3. Reset all React state to initial values
    setAccounts(INITIAL_ACCOUNTS);
    setTransactions(INITIAL_TRANSACTIONS);
    setBudgets(INITIAL_BUDGETS);
    setPayments(INITIAL_PAYMENTS);
    setPaid({});
    setGoals(INITIAL_GOALS);
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

  const loadDemo = () => {
    setAccounts(DEMO_ACCOUNTS);
    setTransactions(DEMO_TRANSACTIONS);
    setPayments(DEMO_PAYMENTS);
    const demoKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
    setPaid({ [`101_${demoKey}`]: true, [`102_${demoKey}`]: true, [`103_${demoKey}`]: true });
  };

  const currentMonthKey = `${new Date().getFullYear()}-${String(month+1).padStart(2,"0")}`;
  const unpaidBillsCount = payments.filter(p => {
    if (!p.trackPaid || p.freq === "weekly" || p.freq === "daily") return false;
    if (paid[`${p.id}_${currentMonthKey}`]) return false;
    if (p.freq === "bimonthly") {
      const startM = p.startMonth || new Date().getMonth();
      if (Math.abs(month - startM) % 2 !== 0) return false;
    }
    return true;
  }).length;

  const TABS = [
    { id: "dashboard",    label: "Start",      Icon: Home },
    { id: "transactions", label: "Transakcje", Icon: List },
    { id: "payments",     label: "Platnosci",  Icon: ({ size, color }) => <Bell size={size} color={color}/>, badge: unpaidBillsCount },
    { id: "goals",        label: "Cele",       Icon: PiggyBank },
    { id: "analytics",    label: "Analiza",    Icon: BarChart2 },
    { id: "investments",  label: "Portfel",    Icon: Briefcase },
  ];

  // Loading
  if (!loaded || authLoading) return (
    <div style={{ background: "#060b14", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <FontLoader/>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Wallet size={24} color="white"/>
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 22, color: "#e2e8f0" }}>FinTrack PRO</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "#475569" }}>{authLoading ? "Sprawdzam konto..." : "Wczytuje dane..."}</div>
    </div>
  );

  // Login
  if (!user) return <LoginScreen onSignIn={signInGoogle} loading={authLoading} syncError={syncError}/>;

  // Onboarding
  if (!onboarded) return (
    <Onboarding
      onFinish={() => { skipFirestoreLoad.current = true; localStorage.setItem("ft_onboarded","1"); setOnboarded(true); setTimeout(() => { setFabOpen(true); setTab("transactions"); }, 500); }}
      onLoadDemo={() => { skipFirestoreLoad.current = true; loadDemo(); localStorage.setItem("ft_onboarded","1"); setOnboarded(true); }}
    />
  );

  return (
    <div id="app-root" style={{ fontFamily: "'Space Grotesk', sans-serif", background: "#060b14", color: "#e2e8f0", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", overflowX: "hidden" }}>
      <FontLoader/>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "linear-gradient(180deg, #060b14 80%, transparent)", padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={14} color="white"/>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>FinTrack PRO</span>
          {cycleDay > 1 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "#78350f22", border: "1px solid #78350f66", borderRadius: 6, padding: "2px 6px" }}>/{cycleDay}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {syncing && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#0a1e3a", border: "1px solid #1e40af44", borderRadius: 8, padding: "4px 8px" }}>
              <RefreshCw size={10} color="#60a5fa" style={{ animation: "spin 1s linear infinite" }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>Sync...</span>
            </div>
          )}
          {syncOk && !syncing && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#052e16", border: "1px solid #14532d", borderRadius: 8, padding: "4px 8px" }}>
              <Cloud size={10} color="#10b981"/>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>Zsync</span>
            </div>
          )}
          {syncError && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#1a0808", border: "1px solid #7f1d1d44", borderRadius: 8, padding: "4px 8px" }}>
              <CloudOff size={10} color="#ef4444"/>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>Blad sync</span>
            </div>
          )}
          {unpaidBillsCount > 0 && (
            <button onClick={() => setTab("payments")} style={{ display: "flex", alignItems: "center", gap: 4, background: "#2d1212", border: "1px solid #7f1d1d", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "#fca5a5", fontSize: 11, fontWeight: 700 }}>
              <Bell size={11}/> {unpaidBillsCount}
            </button>
          )}
          <button onClick={signOutUser} title={`Wyloguj (${user.displayName || user.email})`} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {user.photoURL
              ? <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #1e3a5f" }}/>
              : <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa" }}>{(user.displayName || user.email || "U")[0].toUpperCase()}</span></div>
            }
          </button>
          <button onClick={() => setTab("accounts")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <CreditCard size={17} color="#475569"/>
          </button>
          <Settings size={17} color="#475569" style={{ cursor: "pointer" }} onClick={() => setSettingsOpen(true)}/>
        </div>
      </div>

      {/* Pages */}
      <div style={{ paddingBottom: 20 }}>
        {tab === "dashboard"    && <Dashboard accounts={accounts} transactions={transactions} setTransactions={setTransactions} payments={payments} paid={paid} month={month} setMonth={setMonth} onAddTx={() => setQuickAddOpen(true)} cycleDay={cycleDay} onRefresh={() => { if (user) loadFromFirestore(user.uid).then(d => { if (d) applyData(d, setters); }); }}/>}
        {tab === "accounts"     && <AccountsView accounts={accounts} setAccounts={setAccounts}/>}
        {tab === "investments"  && <InvestmentsView portfolio={portfolio} setPortfolio={setPortfolio} accounts={accounts}/>}
        {tab === "transactions" && <TransactionsView transactions={transactions} setTransactions={setTransactions} accounts={accounts} setAccounts={setAccounts} allCats={allCategories} _forceOpenModal={fabOpen} _onModalClose={() => setFabOpen(false)} defaultAcc={defaultAcc}/>}
        {tab === "payments"     && <PaymentsView payments={payments} setPayments={setPayments} paid={paid} setPaid={setPaid} transactions={transactions} setTransactions={setTransactions} accounts={accounts} month={month} partnerName={partnerName}/>}
        {tab === "goals"        && <GoalsView goals={goals} setGoals={setGoals} accounts={accounts} budgets={budgets} setBudgets={setBudgets} transactions={transactions} month={month} cycleDay={cycleDay} vacationArchive={vacationArchive} setVacationArchive={setVacationArchive}/>}
        {tab === "analytics"    && <AnalyticsView transactions={transactions} payments={payments} paid={paid} month={month} cycleDay={cycleDay} partnerName={partnerName}/>}
      </div>

      {importErr && (
        <div style={{ position: "fixed", top: 70, left: 12, right: 12, zIndex: 300, background: "#1a0808", border: "1px solid #7f1d1d", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>X</span>
          <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>{importErr}</span>
          <button onClick={() => setImportErr("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={14}/></button>
        </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}
        accounts={accounts} transactions={transactions} budgets={budgets}
        payments={payments} paid={paid} goals={goals} customCats={customCats}
        setTransactions={setTransactions} setAccounts={setAccounts} setBudgets={setBudgets}
        setPayments={setPayments} setPaid={setPaid} setGoals={setGoals}
        cycleDay={cycleDay} setCycleDay={setCycleDay} setCustomCats={setCustomCats}
        defaultAcc={defaultAcc} setDefaultAcc={setDefaultAcc}
        vacationArchive={vacationArchive} partnerName={partnerName}
        setPartnerName={setPartnerName} user={user} onSignOut={signOutUser} onLoadDemo={loadDemo} onClearData={clearAllData}
      />

      {showRatingPrompt && <RatingPrompt onDismiss={dismissRating}/>}

      {quickAddOpen && (
        <TransactionsView transactions={transactions}
          setTransactions={(txs) => { setTransactions(txs); setQuickAddOpen(false); }}
          accounts={accounts} setAccounts={setAccounts} allCats={allCategories}
          _forceOpenModal={true} _onClose={() => setQuickAddOpen(false)}
        />
      )}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "linear-gradient(180deg, transparent 0%, #060b14 20%)", paddingTop: 20, paddingBottom: 8 }}>
        <div style={{ display: "flex", background: "#0a1120", border: "1px solid #1a2744", borderRadius: 20, margin: "0 12px", padding: "5px 3px", alignItems: "center" }}>
          {TABS.slice(0, 3).map(({ id, label, Icon, badge }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: active ? "#1e3a5f" : "none", border: active ? "1px solid #2563eb44" : "1px solid transparent", borderRadius: 13, padding: "7px 2px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.2s ease", position: "relative" }}>
                <Icon size={15} color={active ? "#60a5fa" : "#334155"}/>
                {badge > 0 && <div style={{ position: "absolute", top: 4, right: 6, background: "#ef4444", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, fontWeight: 800, color: "white" }}>{badge > 9 ? "9+" : badge}</span></div>}
                <span style={{ fontSize: 8, fontWeight: 700, color: active ? "#60a5fa" : "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              </button>
            );
          })}
          <button onClick={() => { setFabOpen(true); setTab("transactions"); }} style={{ flexShrink: 0, background: "linear-gradient(135deg,#1e40af,#7c3aed)", border: "2px solid #0a1120", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, boxShadow: "0 0 16px #7c3aed55", transition: "transform 0.12s ease", margin: "0 2px", borderRadius: 16, padding: "5px 8px", minWidth: 52 }}
            onPointerDown={e => e.currentTarget.style.transform = "scale(0.9)"}
            onPointerUp={e => e.currentTarget.style.transform = "scale(1)"}>
            <PlusCircle size={15} color="white"/>
            <span style={{ fontSize: 8, fontWeight: 800, color: "white", letterSpacing: "0.03em", fontFamily: "'Space Grotesk', sans-serif" }}>DODAJ</span>
          </button>
          {TABS.slice(3).map(({ id, label, Icon, badge }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: active ? "#1e3a5f" : "none", border: active ? "1px solid #2563eb44" : "1px solid transparent", borderRadius: 13, padding: "7px 2px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.2s ease", position: "relative" }}>
                <Icon size={15} color={active ? "#60a5fa" : "#334155"}/>
                {badge > 0 && <div style={{ position: "absolute", top: 4, right: 6, background: "#ef4444", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 8, fontWeight: 800, color: "white" }}>{badge > 9 ? "9+" : badge}</span></div>}
                <span style={{ fontSize: 8, fontWeight: 700, color: active ? "#60a5fa" : "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

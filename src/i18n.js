// Lekkie tłumaczenia — bez biblioteki, prosty pattern
const LANG_KEY = "ft_lang";

function detectLang() {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "pl" || stored === "en") return stored;
  // Domyślnie z preferencji przeglądarki
  const browser = (navigator.language || "pl").toLowerCase();
  return browser.startsWith("en") ? "en" : "pl";
}

let currentLang = detectLang();

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  // Force reload żeby wszystkie komponenty dostały nowy język
  window.location.reload();
}

function getLang() { return currentLang; }

// Dictionary — kluczowe stringi. Rozbudowywane etapami.
const TRANSLATIONS = {
  pl: {
    // Navigation
    "nav.start": "Start",
    "nav.transactions": "Transakcje",
    "nav.payments": "Płatności",
    "nav.goals": "Cele",
    "nav.analytics": "Analiza",
    "nav.accounts": "Portfel",
    "nav.add": "Dodaj",

    // Dashboard
    "dash.todayBalance": "Bilans dnia",
    "dash.totalWealth": "Całkowity Majątek",
    "dash.savings": "Oszczędności",
    "dash.investments": "Inwestycje",
    "dash.cycleBalance": "Bilans cyklu",
    "dash.income": "Przychody",
    "dash.expenses": "Wydatki",
    "dash.balance": "Bilans",
    "dash.canStillSpend": "Możesz jeszcze wydać",
    "dash.dailyAvg": "Średnia dzienna",
    "dash.dailyBudget": "Możesz dziennie",
    "dash.forecast": "Prognoza końca miesiąca",
    "dash.estSpending": "Szac. wydatki",
    "dash.recentTx": "Ostatnie transakcje",
    "dash.noTxToday": "Brak transakcji",
    "dash.budgetExceeded": "Limit przekroczony",
    "dash.budgetWarning": "Zbliżasz się do limitu",
    "dash.daysUntilEnd": "dni do końca cyklu",

    // Transactions
    "tx.search": "Szukaj opisu, kategorii…",
    "tx.all": "Wszystkie",
    "tx.income": "Przychody",
    "tx.expense": "Wydatki",
    "tx.add": "+ Dodaj transakcję",
    "tx.noResults": "Brak wyników",
    "tx.noTx": "Brak transakcji",
    "tx.foundCount": "Znaleziono",
    "tx.new": "Nowa transakcja",
    "tx.edit": "Edytuj transakcję",
    "tx.date": "Data",
    "tx.amount": "Kwota",
    "tx.description": "Opis",
    "tx.category": "Kategoria",
    "tx.account": "Konto",
    "tx.save": "Zapisz",
    "tx.delete": "Usuń",

    // Common
    "common.cancel": "Anuluj",
    "common.confirm": "Potwierdź",
    "common.yes": "Tak",
    "common.no": "Nie",
    "common.save": "Zapisz",
    "common.loading": "Ładowanie…",
    "common.error": "Błąd",
    "common.success": "Sukces",

    // Days (0 = Sunday)
    "day.0": "Niedziela",
    "day.1": "Poniedziałek",
    "day.2": "Wtorek",
    "day.3": "Środa",
    "day.4": "Czwartek",
    "day.5": "Piątek",
    "day.6": "Sobota",
  },
  en: {
    "nav.start": "Home",
    "nav.transactions": "Transactions",
    "nav.payments": "Bills",
    "nav.goals": "Goals",
    "nav.analytics": "Insights",
    "nav.accounts": "Accounts",
    "nav.add": "Add",

    "dash.todayBalance": "Today's balance",
    "dash.totalWealth": "Total Wealth",
    "dash.savings": "Savings",
    "dash.investments": "Investments",
    "dash.cycleBalance": "Cycle balance",
    "dash.income": "Income",
    "dash.expenses": "Expenses",
    "dash.balance": "Balance",
    "dash.canStillSpend": "You can still spend",
    "dash.dailyAvg": "Daily average",
    "dash.dailyBudget": "Daily budget",
    "dash.forecast": "End of month forecast",
    "dash.estSpending": "Est. spending",
    "dash.recentTx": "Recent transactions",
    "dash.noTxToday": "No transactions",
    "dash.budgetExceeded": "Budget exceeded",
    "dash.budgetWarning": "Approaching limit",
    "dash.daysUntilEnd": "days until cycle end",

    "tx.search": "Search by description, category…",
    "tx.all": "All",
    "tx.income": "Income",
    "tx.expense": "Expenses",
    "tx.add": "+ Add transaction",
    "tx.noResults": "No results",
    "tx.noTx": "No transactions",
    "tx.foundCount": "Found",
    "tx.new": "New transaction",
    "tx.edit": "Edit transaction",
    "tx.date": "Date",
    "tx.amount": "Amount",
    "tx.description": "Description",
    "tx.category": "Category",
    "tx.account": "Account",
    "tx.save": "Save",
    "tx.delete": "Delete",

    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",
    "common.save": "Save",
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.success": "Success",

    "day.0": "Sunday",
    "day.1": "Monday",
    "day.2": "Tuesday",
    "day.3": "Wednesday",
    "day.4": "Thursday",
    "day.5": "Friday",
    "day.6": "Saturday",
  },
};

// Główna funkcja tłumaczenia — używana w kodzie jako t("klucz")
function t(key, fallback) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.pl;
  return dict[key] || fallback || TRANSLATIONS.pl[key] || key;
}

export { t, getLang, setLang };

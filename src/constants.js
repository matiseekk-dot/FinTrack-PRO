import {
  Wallet, TrendingUp, TrendingDown, PlusCircle, X, ChevronLeft, ChevronRight,
  Home, List, PiggyBank, BarChart2, Settings, ArrowUpRight, ArrowDownLeft,
  CreditCard, Briefcase, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Eye, EyeOff, Edit2, Trash2, Check,
  Bell, BellOff, CheckCircle2, Circle, AlertCircle, CalendarClock, Flame,
  ClipboardList, RefreshCw, AlarmClock, Copy
} from "lucide-react";

const MONTHS = ["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];
const MONTH_NAMES = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

// group: "essential" = sta e/wa ne, "lifestyle" = dodatkowe, "income" = przychody
const BASE_CATEGORIES = [
  { id: "rząd",        label: "Podatki/ZUS",   icon: Building,   color: "#3b82f6", group: "essential" },
  { id: "rachunki",    label: "Rachunki",       icon: Zap,        color: "#f59e0b", group: "essential" },
  { id: "inwestycje",  label: "Inwestycje",     icon: TrendingUp, color: "#8b5cf6", group: "essential" },
  { id: "jedzenie",    label: "Jedzenie",       icon: Utensils,   color: "#ef4444", group: "essential" },
  { id: "transport",   label: "Transport",      icon: Car,        color: "#f97316", group: "essential" },
  { id: "zdrowie",     label: "Zdrowie",        icon: Shield,     color: "#10b981", group: "essential" },
  { id: "zakupy",      label: "Zakupy",         icon: ShoppingBag,color: "#06b6d4", group: "essential" },
  { id: "kawiarnia",   label: "Kawiarnia",      icon: Coffee,     color: "#a78bfa", group: "lifestyle" },
  { id: "rozrywka",    label: "Rozrywka",       icon: Gift,       color: "#ec4899", group: "lifestyle" },
  { id: "muzyka",      label: "Muzyka",         icon: Bell,       color: "#f43f5e", group: "lifestyle" },
  { id: "ubrania",     label: "Ubrania",        icon: ShoppingBag,color: "#818cf8", group: "lifestyle" },
  { id: "prezenty",    label: "Prezenty",       icon: Gift,       color: "#e879f9", group: "lifestyle" },
  { id: "alkohol",     label: "Alkohol",        icon: Coffee,     color: "#2563eb", group: "lifestyle" },
  { id: "bukmacher",   label: "Zakłady",         icon: TrendingDown,color: "#dc2626", group: "lifestyle" },
  { id: "inne",        label: "Inne",           icon: Wallet,     color: "#6b7280", group: "lifestyle" },
  { id: "przychód",    label: "Przychód",       icon: DollarSign, color: "#10b981", group: "income" },
  { id: "sprzedaż",    label: "Sprzedaż",       icon: ArrowUpRight,color: "#34d399", group: "income" },
  { id: "dodatkowe",   label: "Dodatkowe",      icon: Briefcase,  color: "#a3e635", group: "income" },
  { id: "bukmacherka", label: "Wygrane",         icon: TrendingUp, color: "#fb923c", group: "income" },
];

// Static CATEGORIES   custom ones merged at render time via allCats prop
const ICON_MAP = {
  Wallet, TrendingUp, TrendingDown, ShoppingBag, Car, Utensils, Zap, Coffee,
  Building, Repeat, Gift, Shield, DollarSign, Bell, CreditCard, Briefcase,
  AlertCircle, CalendarClock, Flame, ClipboardList, RefreshCw, AlarmClock,
};

function getCat(id, customCats = []) {
  const all = [...BASE_CATEGORIES, ...customCats];
  const found = all.find(c => c.id === id);
  if (found) {
    return {
      ...found,
      icon: found.icon || ICON_MAP[found.iconName] || Wallet,
      label: found.label ? found.label.charAt(0).toUpperCase() + found.label.slice(1) : found.label,
    };
  }
  // Fallback - capitalize the id itself
  const label = id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
  return { id, label, icon: Wallet, color: "#6b7280" };
}
const CATEGORIES = BASE_CATEGORIES;

// Helper used where customCats are available
function getAllCats(customCats = []) {
  const mapped = (customCats || []).map(c => ({
    ...c,
    icon: c.icon || ICON_MAP[c.iconName] || Wallet,
    label: c.label ? c.label.charAt(0).toUpperCase() + c.label.slice(1) : c.label,
  }));
  return [...BASE_CATEGORIES, ...mapped];
}

const INITIAL_ACCOUNTS = [
  { id: 1, name: "Konto główne",  type: "savings", bank: "", balance: 0, color: "#3b82f6", iban: "" },
];


//    RECURRING BILLS                                                           
//    PAYMENTS                                                                  
// type: "credit" | "bill" | "sub" | "savings"
const INITIAL_PAYMENTS = [];

const INITIAL_TEMPLATES = [
  { id: 1, desc: "Sklep",        amount: 50,    cat: "zakupy",    acc: 1 },
  { id: 2, desc: "Paliwo",       amount: 200,   cat: "transport", acc: 1 },
  { id: 3, desc: "Restauracja",  amount: 80,    cat: "jedzenie",  acc: 1 },
  { id: 4, desc: "Kawa",         amount: 15,    cat: "kawiarnia", acc: 1 },
  { id: 5, desc: "Transport",    amount: 25,    cat: "transport", acc: 1 },
];

const INITIAL_PAID = {};




//    SAVINGS GOALS                                                              
const INITIAL_GOALS = [];

const INITIAL_TRANSACTIONS = [];

const INITIAL_BUDGETS = [];

// Moduł inwestycyjny: dane wprowadzane przez użytkownika (stan w App)

// HIST_DATA is now computed dynamically from transactions in Dashboard
// This constant is kept as empty placeholder
const HIST_DATA = [];


export { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats,
  INITIAL_ACCOUNTS, INITIAL_PAYMENTS, INITIAL_TEMPLATES, INITIAL_PAID,
  INITIAL_GOALS, INITIAL_TRANSACTIONS, INITIAL_BUDGETS, HIST_DATA };

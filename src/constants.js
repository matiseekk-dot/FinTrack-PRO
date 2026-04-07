import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
const CATEGORIES = BASE_CATEGORIES;
const getCat = (id) => CATEGORIES.find(c => c.id === id) || { id, label: id, icon: Wallet, color: "#6b7280" };

// Helper used where customCats are available
const getAllCats = (customCats = []) => [...BASE_CATEGORIES, ...customCats];

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

function buildHistData(transactions, cycleDay = 1) {
  const monthSet = new Set(transactions.map(t => t.date.slice(0,7)));
  const months   = [...monthSet].sort();
  const last6    = months.slice(-6);
  return last6.map(ym => {
    const [,mm] = ym.split("-");
    const mIdx  = parseInt(mm) - 1;
    const txs   = cycleDay <= 1
      ? transactions.filter(t => t.date.startsWith(ym) && t.cat !== "inne")
      : cycleTxs(transactions, mIdx, cycleDay).filter(t => t.cat !== "inne");
    const income  = txs.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
    const expense = txs.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
    return { m: MONTHS[mIdx], ym, income: Math.round(income), expense: Math.round(expense), balance: Math.round(income - expense) };
  });
}

//    UTILS                                                                     
const fmt = (n, showSign = false) => {
  const s = Math.abs(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign) return (n >= 0 ? "+" : "−") + s + " zł";
  return s + " zł";
};

const fmtShort = (n) => {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toFixed(0);
};


//    BILLING CYCLE HELPER                                                      
// Returns [startDate, endDate] strings for a given month index and cycleDay.
// If cycleDay=1   standard calendar month.
// If cycleDay=25   25th of prev month to 24th of current month.
// "month" param is 0-indexed (0=Jan   11=Dec), year hardcoded 2026.
const getCycleRange = (month, cycleDay) => {
  if (cycleDay <= 1) {
    const y = new Date().getFullYear();
    const m = month + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2,"0")}-01`;
    const end   = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    return [start, end];
  }
  // e.g. cycleDay=25, month=2 (March)   25 Feb   24 Mar
  const y = new Date().getFullYear();
  // start: cycleDay of previous month
  const startMonth = month === 0 ? 12 : month;       // 1-indexed prev month
  const startYear  = month === 0 ? y - 1 : y;
  const start = `${startYear}-${String(startMonth).padStart(2,"0")}-${String(cycleDay).padStart(2,"0")}`;
  // end: (cycleDay-1) of current month
  const endMonth = month + 1; // 1-indexed
  const endDay   = cycleDay - 1;
  const end = `${y}-${String(endMonth).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`;
  return [start, end];
};

const cycleTxs = (transactions, month, cycleDay) => {
  const [start, end] = getCycleRange(month, cycleDay);
  return transactions.filter(t => t.date >= start && t.date <= end);
};

const fmtCycleLabel = (month, cycleDay) => {
  if (cycleDay <= 1) return MONTH_NAMES[month] + " " + new Date().getFullYear();
  const prevMonth = month === 0 ? 11 : month - 1;
  return `${cycleDay} ${MONTHS[prevMonth]} – ${cycleDay-1} ${MONTHS[month]} ${new Date().getFullYear()}`;
};

//    COMPONENTS                                                                

export { MONTHS, MONTH_NAMES, BASE_CATEGORIES, CATEGORIES, getCat, getAllCats,
  INITIAL_ACCOUNTS, INITIAL_PAYMENTS, INITIAL_TEMPLATES, INITIAL_PAID,
  INITIAL_GOALS, INITIAL_TRANSACTIONS, INITIAL_BUDGETS, HIST_DATA };

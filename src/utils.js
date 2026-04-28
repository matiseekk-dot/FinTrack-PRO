import { MONTHS, MONTH_NAMES } from "./constants.js";

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
function fmt(n, showSign = false) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0,00 zł";
  const s = Math.abs(num).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign) return (num >= 0 ? "+" : "−") + s + " zł";
  return s + " zł";
};

function fmtShort(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toFixed(0);
};


//    BILLING CYCLE HELPER                                                      
// Returns [startDate, endDate] strings for a given month index and cycleDay.
// If cycleDay=1   standard calendar month.
// If cycleDay=25   25th of prev month to 24th of current month.
// "month" param is 0-indexed (0=Jan   11=Dec), year hardcoded 2026.
// Helper: ostatni dzień danego miesiąca (1-indexed month)
function daysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

// Helper: clamp day do liczby dni w miesiącu
function clampDay(day, year, month1) {
  return Math.min(day, daysInMonth(year, month1));
}

function getCycleRange(month, cycleDay, year) {
  const y = year || new Date().getFullYear();
  if (cycleDay <= 1) {
    const m = month + 1;
    const lastDay = daysInMonth(y, m);
    const start = `${y}-${String(m).padStart(2,"0")}-01`;
    const end   = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    return [start, end];
  }
  // e.g. cycleDay=25, month=2 (March)   25 Feb   24 Mar
  // start: cycleDay of previous month (clamped)
  const startMonth = month === 0 ? 12 : month;       // 1-indexed prev month
  const startYear  = month === 0 ? y - 1 : y;
  const startDay   = clampDay(cycleDay, startYear, startMonth);
  const start = `${startYear}-${String(startMonth).padStart(2,"0")}-${String(startDay).padStart(2,"0")}`;
  // end: (cycleDay-1) of current month, clamped do ostatniego dnia miesiąca
  const endMonth = month + 1; // 1-indexed
  const endDayRaw = cycleDay - 1;
  // Jeśli cycleDay-1 > daysInMonth, użyj lastDay (np. cycleDay=31 w lutym → endDay=28)
  const endDay = Math.min(endDayRaw, daysInMonth(y, endMonth));
  const end = `${y}-${String(endMonth).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`;
  return [start, end];
};

function cycleTxs(transactions, month, cycleDay, year) {
  const [start, end] = getCycleRange(month, cycleDay, year);
  return transactions.filter(t => t.date >= start && t.date <= end);
};

function fmtCycleLabel(month, cycleDay) {
  const y = new Date().getFullYear();
  if (cycleDay <= 1) return MONTH_NAMES[month] + " " + y;
  const prevMonth = month === 0 ? 11 : month - 1;
  // Clamp day do liczby dni w odpowiednim miesiącu dla ładnego wyświetlenia
  const startDay = Math.min(cycleDay, daysInMonth(month === 0 ? y-1 : y, prevMonth + 1));
  const endDay   = Math.min(cycleDay - 1, daysInMonth(y, month + 1));
  return `${startDay} ${MONTHS[prevMonth]} – ${endDay} ${MONTHS[month]} ${y}`;
};


// ═══ LOCAL DATE HELPERS ═══
// new Date().toISOString() zwraca UTC. W PL (UTC+1/+2) między 22:00 a 00:00
// czasu lokalnego daje wczorajszą datę - psuje streak, daily reminder, prefilled
// daty w formularzach. Używaj tych helperów zamiast .toISOString().split("T")[0]
// wszędzie gdzie chodzi o "dziś" / "lokalna data użytkownika".
function todayLocal() {
  return dateToLocal(new Date());
}

function dateToLocal(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


export { buildHistData, fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel,
         todayLocal, dateToLocal };

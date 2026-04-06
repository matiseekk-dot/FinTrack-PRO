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
    const y = 2026;
    const m = month + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2,"0")}-01`;
    const end   = `${y}-${String(m).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
    return [start, end];
  }
  // e.g. cycleDay=25, month=2 (March)   25 Feb   24 Mar
  const y = 2026;
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


export { buildHistData, fmt, fmtShort, getCycleRange, cycleTxs, fmtCycleLabel };

import { MONTHS, MONTH_NAMES } from "./constants.js";

function buildHistData(transactions, cycleDayOrHistory = 1) {
  const monthSet = new Set(transactions.map(t => t.date.slice(0,7)));
  const months   = [...monthSet].sort();
  const last6    = months.slice(-6);
  // Cycle = 1 (kalendarzowy) jako shortcut tylko dla starego liczbowego argumentu
  const isCalendarMonth = typeof cycleDayOrHistory === "number" && cycleDayOrHistory <= 1;
  return last6.map(ym => {
    const [year, mm] = ym.split("-");
    const mIdx  = parseInt(mm) - 1;
    const txs   = isCalendarMonth
      ? transactions.filter(t => t.date.startsWith(ym) && t.cat !== "inne")
      : cycleTxs(transactions, mIdx, cycleDayOrHistory, parseInt(year))
          .filter(t => t.cat !== "inne");
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

/**
 * Z historii cycleDay wybierz właściwą wartość dla danego (year, month).
 * History format: [{ from: "YYYY-MM-DD", day: number }, ...]
 * - Sortowane rosnąco po `from`
 * - Dla danego miesiąca bierzemy ostatni entry którego `from <= 1. dzień miesiąca`
 *
 * Zwraca number (cycleDay).
 *
 * Jeśli `cycleDayOrHistory` jest liczbą (stary format), zwraca ją bez modyfikacji.
 * Jeśli jest tablicą ale pustą lub niepoprawną, zwraca fallback (1).
 */
function resolveCycleDay(month, cycleDayOrHistory, year) {
  if (typeof cycleDayOrHistory === "number") return cycleDayOrHistory;
  if (!Array.isArray(cycleDayOrHistory) || cycleDayOrHistory.length === 0) return 1;
  const y = year || new Date().getFullYear();
  // Pierwszy dzień miesiąca dla porównania
  const targetStr = `${y}-${String(month + 1).padStart(2, "0")}-01`;
  const sorted = [...cycleDayOrHistory]
    .filter(e => e && typeof e.day === "number" && typeof e.from === "string")
    .sort((a, b) => a.from.localeCompare(b.from));
  if (sorted.length === 0) return 1;
  let result = sorted[0].day;  // fallback do najstarszego entry
  for (const e of sorted) {
    if (e.from <= targetStr) {
      result = e.day;
    } else {
      break;
    }
  }
  return result;
}

/**
 * Zwraca "month index" reprezentujący BIEŻĄCY CYKL ROZLICZENIOWY (nie kalendarzowy).
 *
 * Edge case kluczowy: jeśli cycleDay > 1 i dziś >= cycleDay, jesteśmy już w
 * NOWYM cyklu, który "zawiera się" w następnym miesiącu kalendarzowym.
 *
 * Przykład: cycleDay=28, dziś=28.04.2026.
 *   - Cykl "kwietniowy" = 28.03 - 27.04 → SKOŃCZONY wczoraj
 *   - Cykl "majowy"     = 28.04 - 27.05 → BIEŻĄCY (zaczął się dziś)
 *   - Funkcja zwraca 4 (maj), nie 3 (kwiecień).
 *
 * Bez tej korekty Dashboard pokazuje stary cykl (100% przekroczony,
 * "0 dni do końca", limity 110%) — bo `month = today.getMonth()` jest
 * jeszcze kwietnia.
 */
function getCurrentCycleMonth(cycleDayOrHistory) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const day = resolveCycleDay(m, cycleDayOrHistory, y);
  if (day <= 1) return m;  // standardowy miesiąc kalendarzowy
  if (today.getDate() >= day) {
    // Jesteśmy już w nowym cyklu - przeskocz na następny miesiąc
    // (z wrap grudzień → styczeń, ale wtedy też year +1 - to jest osobny issue
    //  bo getCycleRange ma year-locking; wrap działa OK dla styczeń-listopad)
    return m + 1 > 11 ? 0 : m + 1;
  }
  return m;
}

function getCycleRange(month, cycleDayOrHistory, year) {
  const y = year || new Date().getFullYear();
  const cycleDay = resolveCycleDay(month, cycleDayOrHistory, y);
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

function cycleTxs(transactions, month, cycleDayOrHistory, year) {
  const [start, end] = getCycleRange(month, cycleDayOrHistory, year);
  return transactions.filter(t => t.date >= start && t.date <= end);
};

function fmtCycleLabel(month, cycleDayOrHistory) {
  const y = new Date().getFullYear();
  const cycleDay = resolveCycleDay(month, cycleDayOrHistory, y);
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
         todayLocal, dateToLocal, getCurrentCycleMonth };

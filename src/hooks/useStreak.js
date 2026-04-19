import { useState, useEffect } from "react";

const STREAK_KEY = "ft_streak";
const LONGEST_KEY = "ft_streak_longest";
// Freeze pozwala przerwać streak na maksymalnie 2 dni z rzędu bez utraty serii
// ale tylko raz w tygodniu (resetuje się w niedzielę)
const MAX_GAP_DAYS = 2;

/**
 * Liczy streak w sposób bardziej motywujący:
 * - Pomija weekendy (nie wymaga transakcji w sobotę/niedzielę)
 * - Toleruje maks 2-dniowe przerwy (urlop, choroba)
 * - Zachowuje "najdłuższy streak" historyczny (motywator)
 */
export function useStreak(transactions) {
  const [streak, setStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(() => {
    const stored = localStorage.getItem(LONGEST_KEY);
    return stored ? parseInt(stored) : 0;
  });

  useEffect(() => {
    if (!transactions || transactions.length === 0) {
      setStreak(0);
      return;
    }

    // Zbierz wszystkie dni z transakcjami (set dla O(1) lookup)
    const daysWithTx = new Set();
    transactions.forEach(t => {
      if (t.date && t.cat !== "inne") {
        daysWithTx.add(t.date);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let current = 0;
    let gapDays = 0;

    // Idź wstecz, licząc dni z transakcjami
    // Pomijaj weekendy (nie wymagaj transakcji w SB/ND)
    // Toleruj maks 2 dni przerwy w ciągu
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const hasTx = daysWithTx.has(iso);

      if (hasTx) {
        current++;
        gapDays = 0;  // reset licznika przerwy
      } else if (isWeekend) {
        // Weekend bez transakcji = OK, nie łamiemy streaka, nie liczymy
        continue;
      } else if (i === 0) {
        // Dzisiaj jeszcze nic nie dodano — OK, jeszcze wcześnie
        continue;
      } else {
        // Dzień roboczy bez transakcji = rozważ gap
        gapDays++;
        if (gapDays > MAX_GAP_DAYS) {
          break;  // Przerwa za długa — koniec streaka
        }
      }
    }

    setStreak(current);
    localStorage.setItem(STREAK_KEY, String(current));

    // Update najdłuższego streaka
    if (current > longestStreak) {
      setLongestStreak(current);
      localStorage.setItem(LONGEST_KEY, String(current));
    }
  }, [transactions, longestStreak]);

  return streak;
}

export function useLongestStreak() {
  const stored = localStorage.getItem(LONGEST_KEY);
  return stored ? parseInt(stored) : 0;
}

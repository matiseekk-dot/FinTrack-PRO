import { useState, useEffect } from "react";

const STREAK_KEY = "ft_streak";

export function useStreak(transactions) {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!transactions || transactions.length === 0) return;

    const today = new Date();
    let current = 0;

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const hasTx = transactions.some(t => t.date === iso && t.cat !== "inne");
      if (hasTx) {
        current++;
      } else if (i > 0) { // Allow missing today (not yet added)
        break;
      }
    }

    setStreak(current);
    localStorage.setItem(STREAK_KEY, String(current));
  }, [transactions]);

  return streak;
}

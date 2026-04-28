import { useState, useEffect } from "react";

const SESSION_KEY = "ft_session_count";
const RATING_KEY  = "ft_rating_shown";
const RATING_THRESHOLD = 5; // po 5 sesjach

export function useSessionTracker() {
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);

  useEffect(() => {
    const alreadyShown = localStorage.getItem(RATING_KEY) === "1";
    if (alreadyShown) return;

    const count = parseInt(localStorage.getItem(SESSION_KEY) || "0") + 1;
    localStorage.setItem(SESSION_KEY, String(count));

    if (count === RATING_THRESHOLD) {
      // Pokaż po 3 sekundach żeby apka się załadowała
      setTimeout(() => setShowRatingPrompt(true), 3000);
    }
  }, []);

  const dismissRating = (rated = false) => {
    setShowRatingPrompt(false);
    localStorage.setItem(RATING_KEY, "1");
    if (rated) {
      // v1.2.10: market intent do io.github.matiseekk_dot.fintrackpro NIE ISTNIEJE.
      // FinTrack nie jest jeszcze na Play Store. Do czasu publikacji - direct feedback.
      // Po publikacji przywróć market intent z prawdziwym package ID.
      window.open("https://skudev.gumroad.com/l/fintrack-pro-yearly?wanted=true", "_blank");
    }
  };

  const sessionCount = parseInt(localStorage.getItem(SESSION_KEY) || "0");

  return { showRatingPrompt, dismissRating, sessionCount };
}

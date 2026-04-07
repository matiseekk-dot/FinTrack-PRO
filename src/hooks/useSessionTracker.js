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
      // Otwórz Play Store / App Store
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("android")) {
        window.open("market://details?id=io.github.matiseekk_dot.fintrackpro", "_blank");
      } else {
        window.open("https://matiseekk-dot.github.io/FinTrack-PRO/", "_blank");
      }
    }
  };

  const sessionCount = parseInt(localStorage.getItem(SESSION_KEY) || "0");

  return { showRatingPrompt, dismissRating, sessionCount };
}

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
      // v1.3.0: prawdziwy market intent do pl.skudev.fintrackpro (Play Store).
      // Po publikacji intent otworzy Play Store rating dialog. Przed publikacją
      // (intent się nie zarejestruje) - fallback do https URL po 1.5s.
      const PACKAGE_ID = "pl.skudev.fintrackpro";
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("android")) {
        // Market intent najpierw - jeśli apka jest zainstalowana z Play Store,
        // otworzy się od razu rating dialog. Inaczej fallback do https.
        try {
          window.location.href = `market://details?id=${PACKAGE_ID}`;
          setTimeout(() => {
            window.open(`https://play.google.com/store/apps/details?id=${PACKAGE_ID}`, "_blank");
          }, 1500);
        } catch (_) {
          window.open(`https://play.google.com/store/apps/details?id=${PACKAGE_ID}`, "_blank");
        }
      } else {
        // iOS / desktop - bezpośrednio do Play Store listing
        window.open(`https://play.google.com/store/apps/details?id=${PACKAGE_ID}`, "_blank");
      }
    }
  };

  const sessionCount = parseInt(localStorage.getItem(SESSION_KEY) || "0");

  return { showRatingPrompt, dismissRating, sessionCount };
}

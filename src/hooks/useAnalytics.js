// Privacy-first analytics hook - działa z GoatCounter, Plausible lub nothing
function useAnalytics() {
  const track = (event, extra = {}) => {
    try {
      // GoatCounter
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
          path: event,
          event: true,
        });
      }
      // Plausible fallback
      if (window.plausible) {
        window.plausible(event, { props: extra });
      }
    } catch (_) { /* silent */ }
  };

  return { track };
}

export { useAnalytics };

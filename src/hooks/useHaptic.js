import { useCallback } from "react";

// Haptic feedback — działa na iOS Safari i Android Chrome
export function useHaptic() {
  const light  = useCallback(() => {
    try {
      if (window.navigator?.vibrate) window.navigator.vibrate(10);
    } catch(_) {}
  }, []);

  const medium = useCallback(() => {
    try {
      if (window.navigator?.vibrate) window.navigator.vibrate(40);
    } catch(_) {}
  }, []);

  const heavy  = useCallback(() => {
    try {
      if (window.navigator?.vibrate) window.navigator.vibrate([40, 30, 40]);
    } catch(_) {}
  }, []);

  const success = useCallback(() => {
    try {
      if (window.navigator?.vibrate) window.navigator.vibrate([10, 50, 10]);
    } catch(_) {}
  }, []);

  const error = useCallback(() => {
    try {
      if (window.navigator?.vibrate) window.navigator.vibrate([80, 40, 80]);
    } catch(_) {}
  }, []);

  return { light, medium, heavy, success, error };
}

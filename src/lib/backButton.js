// Android back button: the most recently opened sheet/modal closes first.
// Open overlays register a close handler; App falls back to its own
// navigation (screen → Home → minimise) when nothing is registered.

import { useEffect, useRef } from "react";

const stack = [];

/** Closes the top-most registered overlay. Returns false when there was none. */
function closeTopOverlay() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** Registers `onClose` for the back button while `active` is true. */
function useBackHandler(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const entry = { close: () => ref.current && ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

export { closeTopOverlay, useBackHandler };

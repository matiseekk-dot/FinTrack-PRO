import { useState, useMemo, useEffect, useCallback, useRef } from "react";

const useToast = () => {
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });
  const showToast = useCallback((message, type = "success", duration = 2000) => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), duration);
  }, []);
  return { toast, showToast };
};


export { useToast };

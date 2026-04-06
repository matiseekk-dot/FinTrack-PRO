import { useState, useEffect, useCallback } from "react";
import {
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  doc, getDoc, setDoc, onSnapshot
} from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase.js";

// Debounce helper
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Keys we sync to Firestore (everything except UI state)
const SYNC_KEYS = [
  "accounts", "transactions", "budgets", "payments", "paid",
  "goals", "customCats", "cycleDay", "defaultAcc", "partnerName",
  "portfolio", "month", "vacationArchiveData"
];

export function useFirebase() {
  const [user,        setUser]        = useState(null);   // Firebase user
  const [authLoading, setAuthLoading] = useState(true);   // checking auth on mount
  const [syncing,     setSyncing]     = useState(false);  // saving indicator
  const [syncError,   setSyncError]   = useState(null);

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Sign in with Google
  const signInGoogle = useCallback(async () => {
    try {
      setSyncError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setSyncError("Logowanie nie powiodło się. Spróbuj ponownie.");
      console.error("[FB] signIn error", e);
    }
  }, []);

  // Sign out
  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("[FB] signOut error", e);
    }
  }, []);

  // Load user data from Firestore (one-time on login)
  const loadFromFirestore = useCallback(async (uid) => {
    try {
      const snap = await getDoc(doc(db, "users", uid, "data", "main"));
      if (snap.exists()) return snap.data();
      return null;
    } catch (e) {
      console.error("[FB] load error", e);
      return null;
    }
  }, []);

  // Save user data to Firestore (debounced)
  const saveToFirestore = useCallback(
    debounce(async (uid, data) => {
      if (!uid) return;
      setSyncing(true);
      try {
        const payload = {};
        SYNC_KEYS.forEach(k => { if (data[k] !== undefined) payload[k] = data[k]; });
        await setDoc(doc(db, "users", uid, "data", "main"), payload, { merge: true });
        setSyncError(null);
      } catch (e) {
        setSyncError("Błąd synchronizacji. Sprawdź połączenie.");
        console.error("[FB] save error", e);
      } finally {
        setSyncing(false);
      }
    }, 1500),
    []
  );

  return {
    user,
    authLoading,
    syncing,
    syncError,
    signInGoogle,
    signOutUser,
    loadFromFirestore,
    saveToFirestore,
  };
}

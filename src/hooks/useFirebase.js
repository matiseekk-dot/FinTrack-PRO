import { useState, useEffect, useCallback, useRef } from "react";
import {
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
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

// Arrays z ID - merge po ID (lepszy konflikt resolution)
const ARRAY_KEYS_WITH_ID = ["transactions", "accounts", "payments", "goals", "portfolio", "customCats"];

/**
 * Merge dwóch snapshotów danych z preferencją lokalnych zmian.
 * - Dla tablic z ID: union po ID, zachowuje lokalnie nowsze
 * - Dla obiektów: shallow merge
 * - Dla prymitywów: bierze local jeśli zmienione, inaczej remote
 */
function mergeSnapshots(local, remote, localLastWrite) {
  if (!remote) return local;
  if (!local) return remote;
  
  const merged = { ...remote };
  
  SYNC_KEYS.forEach(key => {
    const localVal  = local[key];
    const remoteVal = remote[key];
    
    if (localVal === undefined) return;
    
    // Tablice z ID — union po ID
    if (ARRAY_KEYS_WITH_ID.includes(key) && Array.isArray(localVal) && Array.isArray(remoteVal)) {
      const map = new Map();
      // Najpierw remote (mają być nadpisane przez local jeśli ID się powtarza)
      remoteVal.forEach(item => { if (item && item.id != null) map.set(item.id, item); });
      localVal.forEach(item => { if (item && item.id != null) map.set(item.id, item); });
      merged[key] = Array.from(map.values());
    }
    // Tablice bez ID (np. vacationArchiveData) — jeśli local zmienione po sync, bierz local
    else if (Array.isArray(localVal)) {
      merged[key] = localVal.length >= (remoteVal?.length || 0) ? localVal : remoteVal;
    }
    // Obiekty (np. paid) — merge kluczy
    else if (typeof localVal === "object" && localVal !== null && typeof remoteVal === "object" && remoteVal !== null) {
      merged[key] = { ...remoteVal, ...localVal };
    }
    // Prymitywy — bierz local jeśli localLastWrite istnieje (oznacza że user zmienił)
    else {
      merged[key] = localVal;
    }
  });
  
  return merged;
}

export function useFirebase() {
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [syncError,   setSyncError]   = useState(null);
  const [remoteUpdate, setRemoteUpdate] = useState(null); // Payload od onSnapshot
  
  const lastLocalSaveRef = useRef(null);   // Timestamp ostatniego lokalnego save
  const snapshotUnsubRef = useRef(null);   // Odpis od onSnapshot
  const isSavingRef      = useRef(false);  // Flag: jestem w trakcie zapisywania?

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
      if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
        return;
      }
      setSyncError("Logowanie nie powiodło się. Spróbuj ponownie.");
      console.error("[FB] signIn error", e);
    }
  }, []);

  // Sign out
  const signOutUser = useCallback(async () => {
    try {
      // Odłącz snapshot przed wylogowaniem
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }
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

  // Subscribe to real-time updates — wywoływane przez App po loginie
  const subscribeToUpdates = useCallback((uid, onRemoteChange) => {
    if (!uid) return;
    // Cleanup poprzedniej subskrypcji
    if (snapshotUnsubRef.current) snapshotUnsubRef.current();

    snapshotUnsubRef.current = onSnapshot(
      doc(db, "users", uid, "data", "main"),
      (snap) => {
        if (!snap.exists()) return;
        // Ignoruj własne zapisy (hasPendingWrites = true gdy to nasza modyfikacja)
        if (snap.metadata.hasPendingWrites) return;
        // Ignoruj jeśli właśnie zapisujemy (czasowe okno)
        if (isSavingRef.current) return;
        
        const data = snap.data();
        const timeSinceLocalSave = lastLocalSaveRef.current 
          ? Date.now() - lastLocalSaveRef.current 
          : Infinity;
        
        // Jeśli lokalny zapis był < 3s temu, prawdopodobnie echo naszego zapisu — ignoruj
        if (timeSinceLocalSave < 3000) return;
        
        // To jest prawdziwy remote update (inne urządzenie) — wyślij do App
        setRemoteUpdate({ data, receivedAt: Date.now() });
        if (onRemoteChange) onRemoteChange(data);
      },
      (err) => {
        console.error("[FB] snapshot error", err);
        setSyncError("Błąd synchronizacji w czasie rzeczywistym.");
      }
    );

    return () => {
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }
    };
  }, []);

  // Save user data to Firestore (debounced) z conflict resolution
  const saveToFirestore = useCallback(
    debounce(async (uid, data) => {
      if (!uid) return;
      isSavingRef.current = true;
      setSyncing(true);
      try {
        const payload = {};
        SYNC_KEYS.forEach(k => { if (data[k] !== undefined) payload[k] = data[k]; });
        // Dodaj timestamp ostatniej modyfikacji po stronie serwera
        payload._lastModified = serverTimestamp();
        
        await setDoc(doc(db, "users", uid, "data", "main"), payload, { merge: true });
        lastLocalSaveRef.current = Date.now();
        setSyncError(null);
      } catch (e) {
        setSyncError("Błąd synchronizacji. Sprawdź połączenie.");
        console.error("[FB] save error", e);
      } finally {
        setSyncing(false);
        // Delay resetu flagi żeby nie złapać własnego echo
        setTimeout(() => { isSavingRef.current = false; }, 500);
      }
    }, 1500),
    []
  );

  // Cleanup na unmount
  useEffect(() => {
    return () => {
      if (snapshotUnsubRef.current) snapshotUnsubRef.current();
    };
  }, []);

  return {
    user,
    authLoading,
    syncing,
    syncError,
    signInGoogle,
    signOutUser,
    loadFromFirestore,
    saveToFirestore,
    subscribeToUpdates,
    remoteUpdate,
    mergeSnapshots,   // Eksport helper dla App do użycia
  };
}

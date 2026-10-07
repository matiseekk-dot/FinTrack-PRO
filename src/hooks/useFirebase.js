import { useState, useEffect, useCallback, useRef } from "react";
import {
  signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged,
  deleteUser, reauthenticateWithPopup, reauthenticateWithCredential
} from "firebase/auth";
import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { auth, db, googleProvider, GOOGLE_WEB_CLIENT_ID } from "../firebase.js";
import { t } from "../i18n.js";
import { isNative } from "../lib/native.js";

// Android: natywne okno wyboru konta Google → idToken → Firebase credential.
// signInWithPopup nie działa w WebView (Google blokuje logowanie w osadzonych przeglądarkach).
let socialLoginReady = null;
async function socialLogin() {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  if (!socialLoginReady) {
    if (!GOOGLE_WEB_CLIENT_ID) throw Object.assign(new Error("GOOGLE_WEB_CLIENT_ID is not set (src/firebase.js)"), { code: "config" });
    socialLoginReady = SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
  }
  await socialLoginReady;
  return SocialLogin;
}

async function signInGoogleNative() {
  const SocialLogin = await socialLogin();
  const res = await SocialLogin.login({ provider: "google", options: {} });
  const idToken = res && res.result && res.result.idToken;
  if (!idToken) throw new Error("Google sign-in returned no idToken");
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Sync kluczy - wszystko w jednym dokumencie users/{uid}/data/main
// Przy realnej skali (1-10k userów, do 5000 tx per user) to działa bez problemu.
const SYNC_KEYS = [
  "accounts", "transactions", "budgets", "payments", "paid",
  "goals", "customCats", "cycleDay", "cycleDayHistory", "defaultAcc", "partnerName",
  "portfolio", "month", "vacationArchiveData",
  "trips", "hobbies",
  "tombstones",       // v1.2.4: { [arrayKey]: { [id]: deletedAtMs } } - blokuje wskrzeszanie
  "proStatus",        // v1.2.7: licencja PRO syncuje się między urządzeniami tego samego konta
  "displayCurrency",  // v1.5.1: preferencja waluty wyświetlania syncuje się między urządzeniami
  "modules",          // v2.0.0 Sidegig: włączone moduły (freelance, betting, ...)
  "resaleItems",      // v2.1.0: przedmioty modułu Sprzedaż
  "collectionItems",  // v2.2.0: katalog Kolekcji
  "gigs",             // v2.2.0: zlecenia Freelance
  "prefs",            // v2.7.0: cel miesięczny, limit strat w Zakładach
  "subscriptions",    // v2.8.0: subskrypcje modułu Hobby
  "rentals",          // v2.14.0: miejsca modułu Najem
];

// Tablice z ID - merge po ID przy real-time sync (dwa urządzenia)
const ARRAY_KEYS_WITH_ID = ["transactions", "accounts", "payments", "goals",
  "portfolio", "customCats", "trips", "hobbies", "resaleItems", "collectionItems", "gigs", "subscriptions", "rentals"];

// Tombstones starsze niż 30 dni są auto-purgowane przy każdym merge.
// 30 dni to bezpieczny próg - po tym czasie dane na drugim urządzeniu (które
// było offline) prawie na pewno były już zsync'owane przez Firestore.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Merge dwóch snapshotów danych z preferencją lokalnych zmian.
 * Używane przy real-time sync (onSnapshot) żeby nie tracić zmian.
 *
 * KLUCZOWE v1.2.4: tombstones (lista usuniętych ID per array) blokują wskrzeszanie.
 * Bez tego: usuwasz tx → debounce save 1.5s → onSnapshot przychodzi z ECHO Firestore
 * które zawiera STARY remote bez naszego delete → union remote+local → tx wraca.
 *
 * Z tombstones: union remote+local FILTRUJE wszystkie ID które są w tombstones.
 */
export function mergeSnapshots(local, remote) {
  if (!remote) return local;
  if (!local) return remote;

  const merged = { ...remote };

  // Merge tombstones (union, najnowszy timestamp wygrywa) + purge starszych niż 30 dni
  const localTomb  = (local && local.tombstones) || {};
  const remoteTomb = (remote && remote.tombstones) || {};
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const mergedTomb = {};
  const allKeys = new Set([...Object.keys(localTomb), ...Object.keys(remoteTomb)]);
  allKeys.forEach(key => {
    const combined = { ...(remoteTomb[key] || {}), ...(localTomb[key] || {}) };
    const filtered = {};
    Object.entries(combined).forEach(([id, ts]) => {
      if (typeof ts === "number" && ts >= cutoff) filtered[id] = ts;
    });
    if (Object.keys(filtered).length > 0) mergedTomb[key] = filtered;
  });
  merged.tombstones = mergedTomb;

  SYNC_KEYS.forEach(key => {
    if (key === "tombstones") return; // już zrobione

    const localVal  = local[key];
    const remoteVal = remote[key];

    if (localVal === undefined) return;

    if (ARRAY_KEYS_WITH_ID.includes(key) && Array.isArray(localVal) && Array.isArray(remoteVal)) {
      // Tombstones dla tego array
      const tombs = mergedTomb[key] || {};
      const isDeleted = (id) => tombs[id] != null;

      // Union po ID, ale FILTRUJEMY deletes z obu stron
      const map = new Map();
      remoteVal.forEach(item => {
        if (item && item.id != null && !isDeleted(item.id)) map.set(item.id, item);
      });
      localVal.forEach(item => {
        if (item && item.id != null && !isDeleted(item.id)) map.set(item.id, item);
      });
      merged[key] = Array.from(map.values());
    }
    else if (key === "modules") {
      // Moduły to preferencja — lokalny wybór wygrywa. Reguła "bierz dłuższą"
      // ponownie włączałaby moduł, który użytkownik właśnie wyłączył.
      merged[key] = localVal;
    }
    else if (Array.isArray(localVal)) {
      // Tablice bez ID (vacationArchiveData) - bierz dłuższą
      merged[key] = localVal.length >= (remoteVal?.length || 0) ? localVal : remoteVal;
    }
    else if (typeof localVal === "object" && localVal !== null && typeof remoteVal === "object" && remoteVal !== null) {
      // proStatus: last-write-wins po `since` timestamp - potrzebne żeby drugie urządzenie
      // dostało aktywację PRO bez ponownego wpisywania klucza.
      if (key === "prefs") {
        // Ustawienia: nowszy zapis wygrywa w całości. Scalanie pól zostawiłoby
        // starą wartość z tego urządzenia nad nowszą z drugiego.
        merged[key] = (localVal.updatedAt || 0) >= (remoteVal.updatedAt || 0) ? localVal : remoteVal;
      } else if (key === "proStatus") {
        const localSince  = localVal.since  || "";
        const remoteSince = remoteVal.since || "";
        merged[key] = localSince >= remoteSince ? localVal : remoteVal;
      } else {
        // Obiekty (paid) - shallow merge
        merged[key] = { ...remoteVal, ...localVal };
      }
    }
    else {
      // Prymitywy (cycleDay, defaultAcc) - lokalne wygrywają
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
  
  const lastLocalSaveRef = useRef(null);
  const snapshotUnsubRef = useRef(null);
  const isSavingRef      = useRef(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = useCallback(async () => {
    try {
      setSyncError(null);
      if (isNative) await signInGoogleNative();
      else await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request" || e.code === "USER_CANCELLED") {
        return;
      }
      setSyncError(t("err.login.failed", "Logowanie nie powiodło się. Spróbuj ponownie."));
      console.error("[FB] signIn error", e);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }
      await signOut(auth);
      // Bez tego następne logowanie od razu wybiera to samo konto Google
      if (isNative) (await socialLogin()).logout({ provider: "google" }).catch(() => {});
    } catch (e) {
      console.error("[FB] signOut error", e);
    }
  }, []);

  // Usunięcie konta (wymóg Google Play): dane w chmurze, potem samo konto logowania.
  // Firebase wymaga świeżego logowania — wtedy prosimy o nie (okno Google) i próbujemy jeszcze raz.
  const deleteAccount = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return false;
    if (snapshotUnsubRef.current) { snapshotUnsubRef.current(); snapshotUnsubRef.current = null; }
    await deleteDoc(doc(db, "users", u.uid, "data", "main"));
    try {
      await deleteUser(u);
    } catch (e) {
      if (e.code !== "auth/requires-recent-login") throw e;
      if (isNative) {
        const res = await (await socialLogin()).login({ provider: "google", options: {} });
        const idToken = res && res.result && res.result.idToken;
        if (!idToken) throw e;
        await reauthenticateWithCredential(u, GoogleAuthProvider.credential(idToken));
      } else {
        await reauthenticateWithPopup(u, googleProvider);
      }
      await deleteUser(u);
    }
    if (isNative) (await socialLogin()).logout({ provider: "google" }).catch(() => {});
    return true;
  }, []);

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

  // Real-time sync dla userów z 2+ urządzeń
  const subscribeToUpdates = useCallback((uid, onRemoteChange) => {
    if (!uid) return;
    if (snapshotUnsubRef.current) snapshotUnsubRef.current();

    snapshotUnsubRef.current = onSnapshot(
      doc(db, "users", uid, "data", "main"),
      (snap) => {
        if (!snap.exists()) return;
        if (snap.metadata.hasPendingWrites) return;
        if (isSavingRef.current) return;
        
        const data = snap.data();
        const timeSinceLocalSave = lastLocalSaveRef.current 
          ? Date.now() - lastLocalSaveRef.current 
          : Infinity;
        
        // Ignoruj echo < 5s od własnego save (1.5s debounce + setDoc latency + onSnapshot propagation)
        if (timeSinceLocalSave < 5000) return;
        
        if (onRemoteChange) onRemoteChange(data);
      },
      (err) => {
        console.error("[FB] snapshot error", err);
        setSyncError(t("err.sync.realtime", "Błąd synchronizacji w czasie rzeczywistym."));
      }
    );

    return () => {
      if (snapshotUnsubRef.current) {
        snapshotUnsubRef.current();
        snapshotUnsubRef.current = null;
      }
    };
  }, []);

  const saveToFirestore = useCallback(
    debounce(async (uid, data) => {
      if (!uid) return;
      isSavingRef.current = true;
      setSyncing(true);
      try {
        const payload = {};
        // Firestore odrzuca cały zapis, gdy gdziekolwiek w danych jest undefined — serializacja JSON je usuwa
        SYNC_KEYS.forEach(k => { if (data[k] !== undefined) payload[k] = JSON.parse(JSON.stringify(data[k])); });
        payload._lastModified = serverTimestamp();
        
        // Warning jeśli dokument robi się duży (90% limit) - prosta prewencja
        const size = JSON.stringify(payload).length;
        if (size > 900000) {
          console.warn(`[FT] Document size ${(size/1024).toFixed(0)}KB - approaching 1MB limit`);
          // User dostanie warning w UI, ale nadal zapisze
        }
        
        await setDoc(doc(db, "users", uid, "data", "main"), payload, { merge: true });
        lastLocalSaveRef.current = Date.now();
        setSyncError(null);
      } catch (e) {
        if (e.code === "resource-exhausted" || e.message?.includes("exceeded")) {
          setSyncError(t("err.sync.tooBig", "Dokument za duży. Usuń stare transakcje lub wyeksportuj do pliku."));
        } else {
          setSyncError(t("err.sync.network", "Błąd synchronizacji. Sprawdź połączenie."));
        }
        console.error("[FB] save error", e);
      } finally {
        setSyncing(false);
        setTimeout(() => { isSavingRef.current = false; }, 500);
      }
    }, 1500),
    []
  );

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
    deleteAccount,
    loadFromFirestore,
    saveToFirestore,
    subscribeToUpdates,
    mergeSnapshots,
  };
}

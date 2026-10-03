import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyDU61PZsnuw9Din_CXbCiSyqAbCfCXqE0k",
  authDomain: "fintrack-pl-ddf27.firebaseapp.com",
  projectId: "fintrack-pl-ddf27",
  storageBucket: "fintrack-pl-ddf27.firebasestorage.app",
  messagingSenderId: "330375478561",
  appId: "1:330375478561:web:138224695596513706d260",
  measurementId: "G-T5PEWHR45E"
};

const app = initializeApp(firebaseConfig);
// Aplikacja Android loguje przez natywne okno Google (Credential Manager), więc Auth
// nie potrzebuje resolvera popup/redirect, który w WebView potrafi zawiesić start.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Klient OAuth typu "Web application" tego projektu (Firebase → Authentication →
// Sign-in method → Google → Web SDK configuration → Web client ID). Nie jest
// sekretem. Wymagany do logowania Google w aplikacji Android.
export const GOOGLE_WEB_CLIENT_ID = "";

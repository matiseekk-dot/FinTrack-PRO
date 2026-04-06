import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

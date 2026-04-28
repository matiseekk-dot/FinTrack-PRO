// Firebase Cloud Messaging — push notifications
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";

const VAPID_KEY = ""; // Do uzupełnienia po konfiguracji FCM w Firebase Console

let messaging = null;

function getMessagingInstance() {
  if (!messaging) {
    try { messaging = getMessaging(); } catch(_) {}
  }
  return messaging;
}

export async function requestNotificationPermission(uid) {
  if (!("Notification" in window)) return null;
  if (Notification.permission === "denied") return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const m = getMessagingInstance();
    if (!m || !VAPID_KEY) return null;

    const token = await getToken(m, { vapidKey: VAPID_KEY });
    if (token && uid) {
      // Save token to Firestore so backend can send notifications
      await setDoc(doc(db, "users", uid, "fcm", "token"), {
        token, updatedAt: new Date().toISOString(), platform: navigator.userAgent,
      });
    }
    return token;
  } catch(e) {
    console.warn("[FCM] token error:", e);
    return null;
  }
}

export function onForegroundMessage(callback) {
  const m = getMessagingInstance();
  if (!m) return () => {};
  return onMessage(m, callback);
}

// Local notification fallback (działa bez FCM backend)
export function scheduleLocalNotification(title, body, delayMs = 0) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  setTimeout(() => {
    try {
      new Notification(title, {
        body,
        icon: "/FinTrack-PRO/icon.svg",
        badge: "/FinTrack-PRO/icon.svg",
        tag: "fintrack-reminder",
        requireInteraction: false,
      });
    } catch(e) {}
  }, delayMs);
}

// Check upcoming payments and schedule local notifications
export function schedulePaymentReminders(payments, paid) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  payments.forEach(p => {
    if (!p.trackPaid || p.freq === "weekly" || p.freq === "daily") return;
    const monthKey = `${year}-${String(month+1).padStart(2,"0")}`;
    if (paid?.[`${p.id}_${monthKey}`]) return; // already paid

    const dueDay = p.dueDay || 1;
    const dueDate = new Date(year, month, dueDay);
    const diffDays = Math.round((dueDate - today) / 86400000);

    if (diffDays === 1) {
      scheduleLocalNotification(
        "💳 Jutro płatność!",
        `${p.name} · ${Math.abs(p.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł`
      );
    } else if (diffDays === 0) {
      scheduleLocalNotification(
        "⚡ Dziś płatność!",
        `${p.name} · ${Math.abs(p.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł`
      );
    }
  });
}

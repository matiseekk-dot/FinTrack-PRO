// Firebase Cloud Messaging — push notifications
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";
import { t } from "./i18n.js";

// VAPID public key z Firebase Console:
//   1. Otwórz Firebase Console → Project Settings → Cloud Messaging
//   2. Web Push certificates → Generate key pair (jeśli jeszcze nie ma)
//   3. Skopiuj "Key pair" wartość (zaczyna się od "B...", długi base64url string)
//   4. Wklej tutaj jako string
//
// Bez VAPID key działają TYLKO local notifications (scheduleLocalNotification poniżej).
// Push z serwera (FCM) nie zadziała - getToken() rzuci.
//
// PRZED PUBLIKACJĄ NA PRODUKCJĘ: ustawić VAPID_KEY i przetestować push end-to-end.
const VAPID_KEY = "";

let messaging = null;

function getMessagingInstance() {
  if (!messaging) {
    try { messaging = getMessaging(); } catch(_) {}
  }
  return messaging;
}

export async function requestNotificationPermission(uid) {
  if (!("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (Notification.permission === "denied") {
    return { ok: false, reason: "denied_by_user" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "permission_not_granted" };
    }

    // Lokalne notyfikacje już działają od tej chwili (scheduleLocalNotification).
    // Token FCM dla cloud push - tylko jeśli VAPID skonfigurowany.
    if (!VAPID_KEY) {
      return { ok: true, hasFcm: false, reason: "vapid_not_configured" };
    }

    const m = getMessagingInstance();
    if (!m) return { ok: true, hasFcm: false, reason: "messaging_unavailable" };

    const token = await getToken(m, { vapidKey: VAPID_KEY });
    if (token && uid) {
      // Save token to Firestore so backend can send notifications
      await setDoc(doc(db, "users", uid, "fcm", "token"), {
        token, updatedAt: new Date().toISOString(), platform: navigator.userAgent,
      });
    }
    return { ok: true, hasFcm: !!token, token };
  } catch (e) {
    console.warn("[FCM] token error:", e);
    return { ok: true, hasFcm: false, reason: "fcm_error", error: String(e) };
  }
}

export function onForegroundMessage(callback) {
  const m = getMessagingInstance();
  if (!m) return () => {};
  return onMessage(m, callback);
}

// Local notification fallback (działa bez FCM backend).
// Używana wewnętrznie przez schedulePaymentReminders dla przypomnień o rachunkach.
function scheduleLocalNotification(title, body, delayMs = 0) {
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
        t("notif.paymentTomorrow", "💳 Jutro płatność!"),
        `${p.name} · ${Math.abs(p.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł`
      );
    } else if (diffDays === 0) {
      scheduleLocalNotification(
        t("notif.paymentToday", "⚡ Dziś płatność!"),
        `${p.name} · ${Math.abs(p.amount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} zł`
      );
    }
  });
}

"use client";

import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import app, { db } from "@/lib/firebase";

// Loaded lazily and only in the browser — `firebase/messaging` touches `navigator`/`window`
// at import time in some paths and Next.js SSR-renders this module on the server otherwise.
async function getMessagingIfSupported() {
  if (typeof window === "undefined") return null;
  const { getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return null; // Safari/older browsers without Push API support
  return getMessaging(app);
}

/**
 * Requests an FCM token for this browser/device and saves it to the user's profile
 * (`users/{uid}.fcmTokens`, an array — a person may be logged in on several devices).
 * Call only after `Notification.permission === "granted"`. Returns the token, or null
 * if messaging isn't supported here or something failed (never throws).
 */
export async function registerFcmToken(uid: string): Promise<string | null> {
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;

    const { getToken } = await import("firebase/messaging");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    return token;
  } catch (e) {
    console.error("registerFcmToken error:", e);
    return null;
  }
}

/**
 * Reads (without writing to Firestore) the FCM token already issued to this browser, if any.
 * Firebase caches it internally so this resolves instantly — no re-prompt. Used to exclude
 * "this device" when asking the server to push to the rest of the workspace, since this
 * device already gets an instant local Notification (see sendStockNotification).
 */
export async function getCurrentFcmToken(): Promise<string | null> {
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;

    const { getToken } = await import("firebase/messaging");
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return null; // not registered yet — registerFcmToken() hasn't run

    return await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/** Removes this device's token — called when the user turns notifications off. */
export async function unregisterFcmToken(uid: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
  } catch (e) {
    console.error("unregisterFcmToken error:", e);
  }
}

/**
 * Listens for pushes that arrive while the app is open and focused (foreground).
 * FCM does NOT show these automatically like it does in the background — the page
 * has to render/display them itself, hence the callback instead of a raw Notification.
 */
export async function listenForegroundMessages(
  onReceive: (title: string, body: string) => void
): Promise<() => void> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};

  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, (payload) => {
    onReceive(payload.notification?.title ?? "LogiAnalytics Pro", payload.notification?.body ?? "");
  });
}

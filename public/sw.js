const CACHE_NAME = "logipro-v4";
const STATIC_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icon.svg",
];

// --- Firebase Cloud Messaging (background push) ---
// Lives in this same SW (instead of a separate firebase-messaging-sw.js) because
// only one service worker can control the "/" scope at a time. Config values below
// are the public NEXT_PUBLIC_FIREBASE_* client keys — not secrets, already shipped
// in every page's JS bundle; Firestore rules are what actually gate access.
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBSbnG_b3M7ZsCqoEWRsRNRqBfHcRs9H38",
  authDomain: "logianalytics-pro.firebaseapp.com",
  projectId: "logianalytics-pro",
  storageBucket: "logianalytics-pro.firebasestorage.app",
  messagingSenderId: "567668556898",
  appId: "1:567668556898:web:6c89d6bdf7070a46e5fd3b",
});

const messaging = firebase.messaging();

// Fires when a push arrives while no tab has focus (or the browser/PWA is closed). While the
// app IS focused, the existing Firestore onSnapshot listener already fires an instant local
// Notification (useStockNotifications.ts) — the server excludes that tab's own token from the
// push (see /api/notify-stock-critical) so this handler and the local one never double up.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "LogiAnalytics Pro";
  const body  = payload.notification?.body  || "";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    tag: payload.data?.tag || "logi-stock-alert",
  });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (Firebase, Cloudinary)
  if (request.method !== "GET" || url.origin !== location.origin) return;

  // Network-first for HTML pages — fall back to offline.html
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match("/offline.html"))
        )
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

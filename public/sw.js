// Bump obligatorio al cambiar la estrategia de abajo: `activate` borra toda
// caché cuyo nombre no coincida, así que subir la versión es lo que purga lo
// que quedó guardado en los dispositivos que ya tienen la PWA instalada.
// v5 -> v6 (18-sep-2026).
const CACHE_NAME = "logipro-v6";

// OJO: `cache.addAll` falla entero si UNO solo de estos da 404, y si install
// falla el SW no se instala. Todo lo que se agregue aquí debe existir de verdad
// en /public (por eso no está "/icon-192.png", que el manifest declara pero no
// existe en el repo).
const STATIC_ASSETS = ["/offline.html", "/manifest.json", "/icon.svg"];

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

/**
 * El caché existe para instalabilidad + una pantalla de "sin conexión" decente.
 * Los datos de esta app vienen de Firestore (otro origen, ni pasa por aquí), así
 * que el SW NO intenta funcionar offline de verdad: solo evita la pantalla en
 * blanco fea del navegador cuando no hay red.
 *
 * OJO con lo que se cachea (bug real, mismo que se corrigió en founders_crm el
 * 18-sep-2026): la versión anterior mandaba a la red SOLO lo que pedía
 * `text/html`, y todo el resto iba a un caché permanente sin revalidar nunca
 * (`if (cached) return cached`). Las navegaciones dentro de la app NO piden
 * `text/html`: con App Router, Next pide componentes de servidor
 * (`text/x-component` / `?_rsc=`), así que caían en ese caché eterno y la PWA
 * instalada seguía mostrando pantallas viejas después de cada deploy, sin forma
 * de actualizarse salvo desinstalarla. Ahora solo se cachea lo estático.
 */

/** Respuesta de servidor, nunca cacheable: cambia con los datos. */
function esContenidoDeServidor(request, url) {
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("accept")?.includes("text/x-component") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/api/")
  );
}

/** Build de Next: el nombre lleva hash, así que un archivo dado nunca cambia de contenido. */
function esInmutable(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET y cross-origin (Firestore, Cloudinary, gstatic).
  if (request.method !== "GET" || url.origin !== location.origin) return;

  // Datos del servidor: siempre a la red, jamás al caché.
  if (esContenidoDeServidor(request, url)) return;

  // Navegación a una página: red primero, y si no hay conexión, la pantalla offline.
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Assets con hash en el nombre: caché directo, no pueden quedar viejos.
  if (esInmutable(url)) {
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
    return;
  }

  // Resto de estáticos con nombre fijo (íconos, logo, manifest): se sirve lo
  // guardado para que sea instantáneo, pero SIEMPRE se revalida por detrás, así
  // un archivo que cambió de contenido sin cambiar de nombre se actualiza solo
  // en la visita siguiente en vez de quedar congelado para siempre.
  event.respondWith(
    caches.match(request).then((cached) => {
      const red = fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || red;
    })
  );
});
